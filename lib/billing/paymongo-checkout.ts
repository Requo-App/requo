import "server-only";

/**
 * PayMongo QR Ph checkout intents and prepaid activation.
 *
 * A checkout intent is the local source of truth for one hosted-checkout
 * attempt. The webhook and the success-page fallback both funnel into
 * `activatePaymongoCheckoutIntent`, which is idempotent per intent: the first
 * caller activates the prepaid term, later callers observe `succeeded` and
 * return the already-active plan.
 */

import { eq, or } from "drizzle-orm";

import { getPlanPrice } from "@/lib/billing/plans";
import {
  isActivePrepaidSubscription,
  isPaidPolarSubscription,
} from "@/lib/billing/paymongo-eligibility";
import { addBillingInterval, getPrepaidTermStart } from "@/lib/billing/periods";
import {
  invalidatePlanTierCache,
  lockBusinessSubscription,
  resolveEffectivePlanFromSubscription,
} from "@/lib/billing/subscription-service";
import { enforceLiveServiceLimit } from "@/lib/billing/live-service-enforcement";
import { normalizeBillingCurrency } from "@/lib/billing/currency";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema/businesses";
import {
  businessSubscriptions,
  paymongoCheckoutIntents,
  paymentAttempts,
  type BillingCurrency,
} from "@/lib/db/schema/subscriptions";
import { newEntityId } from "@/lib/ids";
import type { BillingInterval, PaidPlan } from "@/lib/billing/types";
import type { PlanTier } from "@/lib/plans/plans";

export type PaymongoCheckoutIntent = typeof paymongoCheckoutIntents.$inferSelect;

export type CreatePaymongoIntentParams = {
  businessId: string;
  userId: string;
  plan: PaidPlan;
  interval: BillingInterval;
};

/**
 * Writes a pending intent before the provider call. `amount` and `currency`
 * are derived here, never accepted from the client.
 */
export async function createPaymongoCheckoutIntent(
  params: CreatePaymongoIntentParams,
): Promise<PaymongoCheckoutIntent> {
  const now = new Date();
  const amount = getPlanPrice(params.plan, "PHP", params.interval);

  const [intent] = await db
    .insert(paymongoCheckoutIntents)
    .values({
      id: newEntityId(),
      businessId: params.businessId,
      userId: params.userId,
      plan: params.plan,
      interval: params.interval,
      amount,
      currency: "PHP",
      status: "pending",
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return intent!;
}

/** Stores the provider session id once PayMongo has created the session. */
export async function attachPaymongoCheckoutSession(
  intentId: string,
  providerSessionId: string,
): Promise<void> {
  await db
    .update(paymongoCheckoutIntents)
    .set({ providerSessionId, updatedAt: new Date() })
    .where(eq(paymongoCheckoutIntents.id, intentId));
}

/**
 * Marks a pending intent failed when session creation fails. The intent is
 * retained for support and audit rather than deleted.
 */
export async function markPaymongoCheckoutIntentFailed(
  intentId: string,
): Promise<void> {
  await db
    .update(paymongoCheckoutIntents)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(paymongoCheckoutIntents.id, intentId));
}

export async function getPaymongoCheckoutIntentForUser({
  intentId,
  userId,
}: {
  intentId: string;
  userId: string;
}): Promise<PaymongoCheckoutIntent | null> {
  const [intent] = await db
    .select()
    .from(paymongoCheckoutIntents)
    .where(eq(paymongoCheckoutIntents.id, intentId))
    .limit(1);

  if (!intent || intent.userId !== userId) {
    return null;
  }

  return intent;
}

export async function findPaymongoCheckoutIntentBySessionId(
  providerSessionId: string,
): Promise<PaymongoCheckoutIntent | null> {
  const [intent] = await db
    .select()
    .from(paymongoCheckoutIntents)
    .where(eq(paymongoCheckoutIntents.providerSessionId, providerSessionId))
    .limit(1);

  return intent ?? null;
}

/**
 * Resolves an intent from either the session id or the reference number
 * (which is the intent id). The fallback covers a session created by PayMongo
 * before the local session-id update committed.
 */
export async function resolvePaymongoCheckoutIntent({
  providerSessionId,
  referenceNumber,
}: {
  providerSessionId: string;
  referenceNumber: string | null;
}): Promise<PaymongoCheckoutIntent | null> {
  const conditions = [
    eq(paymongoCheckoutIntents.providerSessionId, providerSessionId),
  ];

  if (referenceNumber) {
    conditions.push(eq(paymongoCheckoutIntents.id, referenceNumber));
  }

  const [intent] = await db
    .select()
    .from(paymongoCheckoutIntents)
    .where(conditions.length > 1 ? or(...conditions) : conditions[0])
    .limit(1);

  return intent ?? null;
}

export type PaymongoActivationPayment = {
  providerPaymentId: string;
  amount: number | null;
  currency: string | null;
  paidAt: Date | null;
};

export type PaymongoActivationResult =
  | { status: "activated"; businessId: string; plan: PlanTier }
  | { status: "already_active"; businessId: string; plan: PlanTier }
  | { status: "not_found" }
  | { status: "not_pending"; businessId: string; plan: PlanTier }
  | { status: "invalid_payment"; businessId: string; message: string }
  | { status: "blocked_by_polar"; businessId: string; message: string };

function toBillingCurrency(value: string | null): BillingCurrency {
  return normalizeBillingCurrency(value);
}

function amountMatches(
  intent: PaymongoCheckoutIntent,
  payment: PaymongoActivationPayment,
): boolean {
  return (
    payment.amount === intent.amount &&
    toBillingCurrency(payment.currency) === intent.currency
  );
}

function isSamePlanInterval(
  intent: PaymongoCheckoutIntent,
): intent is PaymongoCheckoutIntent & {
  plan: PaidPlan;
  interval: BillingInterval;
} {
  return (
    (intent.plan === "pro" || intent.plan === "business") &&
    (intent.interval === "monthly" || intent.interval === "yearly")
  );
}

/**
 * Activates or extends a prepaid term for a paid checkout intent.
 *
 * The subscription, intent, payment-attempt, and denormalized
 * `businesses.plan` writes share one transaction. Renewals extend from
 * `max(now, currentPeriodEnd)`; an expired or absent term starts at payment
 * time.
 */
export async function activatePaymongoCheckoutIntent({
  intentId,
  payment,
  invalidateCache = true,
}: {
  intentId: string;
  payment: PaymongoActivationPayment;
  /**
   * Route Handlers and other non-render contexts should leave this on. The
   * checkout return page sets it off and invalidates with `updateTag` after
   * activation, because `revalidateTag` cannot run during a render.
   */
  invalidateCache?: boolean;
}): Promise<PaymongoActivationResult> {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [initial] = await tx
      .select()
      .from(paymongoCheckoutIntents)
      .where(eq(paymongoCheckoutIntents.id, intentId))
      .limit(1);

    if (!initial) {
      return { status: "not_found" } as const;
    }

    await lockBusinessSubscription(tx, initial.businessId);

    const [intent] = await tx
      .select()
      .from(paymongoCheckoutIntents)
      .where(eq(paymongoCheckoutIntents.id, intentId))
      .limit(1)
      .for("update");

    if (!intent) {
      return { status: "not_found" } as const;
    }

    if (intent.status === "succeeded") {
      const plan = isSamePlanInterval(intent)
        ? (intent.plan as PlanTier)
        : "pro";
      return {
        status: "already_active",
        businessId: intent.businessId,
        plan,
      } as const;
    }

    if (intent.status !== "pending") {
      const plan = isSamePlanInterval(intent)
        ? (intent.plan as PlanTier)
        : "pro";
      return {
        status: "not_pending",
        businessId: intent.businessId,
        plan,
      } as const;
    }

    if (!isSamePlanInterval(intent)) {
      return {
        status: "invalid_payment",
        businessId: intent.businessId,
        message: `Intent ${intent.id} has an unsupported plan or interval.`,
      } as const;
    }

    if (!amountMatches(intent, payment)) {
      return {
        status: "invalid_payment",
        businessId: intent.businessId,
        message: `Payment amount or currency does not match intent ${intent.id}.`,
      } as const;
    }

    const [existing] = await tx
      .select()
      .from(businessSubscriptions)
      .where(eq(businessSubscriptions.businessId, intent.businessId))
      .limit(1)
      .for("update");

    if (isPaidPolarSubscription(existing, now)) {
      return {
        status: "blocked_by_polar",
        businessId: intent.businessId,
        message:
          "Business still has a paid Polar subscription; QR Ph payment needs manual reconciliation.",
      } as const;
    }

    // A second open checkout for a different plan must not overwrite a term
    // the business already paid for. Checkout eligibility blocks this, but the
    // webhook is the last line of defense when two sessions overlap.
    if (
      existing &&
      isActivePrepaidSubscription(existing, now) &&
      existing.plan !== intent.plan
    ) {
      return {
        status: "invalid_payment",
        businessId: intent.businessId,
        message: `Intent ${intent.id} would replace an active prepaid term for ${existing.plan}; needs manual reconciliation.`,
      } as const;
    }

    const paidAt = payment.paidAt ?? now;
    // Extend an existing prepaid term for the same plan. `getPrepaidTermStart`
    // ignores an end that has already passed, so a stale row cannot extend.
    const currentTermEnd =
      existing &&
      existing.billingProvider === "paymongo" &&
      existing.plan === intent.plan
        ? existing.currentPeriodEnd
        : null;

    const termStart = getPrepaidTermStart(currentTermEnd, now);
    const termEnd = addBillingInterval(termStart, intent.interval);
    const effectivePlan = intent.plan as PlanTier;
    const currency = intent.currency;

    let subscription;

    if (existing) {
      const [updated] = await tx
        .update(businessSubscriptions)
        .set({
          status: "active",
          plan: intent.plan,
          billingProvider: "paymongo",
          billingCurrency: currency,
          // PayMongo is a one-time gateway: no customer, subscription, or
          // portal identifiers exist for this row.
          providerCustomerId: null,
          providerSubscriptionId: null,
          providerCheckoutId: intent.providerSessionId,
          paymentMethod: "QR Ph",
          currentPeriodStart: termStart,
          currentPeriodEnd: termEnd,
          canceledAt: null,
          trialEndsAt: null,
          providerEventAt: paidAt,
          updatedAt: now,
        })
        .where(eq(businessSubscriptions.id, existing.id))
        .returning();

      subscription = updated!;
    } else {
      const [created] = await tx
        .insert(businessSubscriptions)
        .values({
          id: newEntityId(),
          businessId: intent.businessId,
          status: "active",
          plan: intent.plan,
          billingProvider: "paymongo",
          billingCurrency: currency,
          providerCheckoutId: intent.providerSessionId,
          paymentMethod: "QR Ph",
          currentPeriodStart: termStart,
          currentPeriodEnd: termEnd,
          providerEventAt: paidAt,
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      subscription = created!;
    }

    await tx
      .update(businesses)
      .set({
        plan: resolveEffectivePlanFromSubscription(subscription),
        updatedAt: now,
      })
      .where(eq(businesses.id, intent.businessId));

    await enforceLiveServiceLimit(tx, intent.businessId, effectivePlan);

    await tx
      .update(paymongoCheckoutIntents)
      .set({
        status: "succeeded",
        providerPaymentId: payment.providerPaymentId,
        paidAt,
        updatedAt: now,
      })
      .where(eq(paymongoCheckoutIntents.id, intent.id));

    await tx
      .insert(paymentAttempts)
      .values({
        id: newEntityId(),
        userId: intent.userId,
        businessId: intent.businessId,
        plan: intent.plan,
        provider: "paymongo",
        providerPaymentId: payment.providerPaymentId,
        amount: intent.amount,
        currency,
        status: "succeeded",
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: [paymentAttempts.provider, paymentAttempts.providerPaymentId],
        set: {
          userId: intent.userId,
          businessId: intent.businessId,
          plan: intent.plan,
          amount: intent.amount,
          currency,
          status: "succeeded",
        },
      });

    return {
      status: "activated",
      businessId: intent.businessId,
      plan: effectivePlan,
    } as const;
  });

  // The webhook may arrive after the success page already activated the
  // intent. Invalidate on `already_active` too: the eager path runs during a
  // render, where Next rejects cache invalidation, so this may be the only
  // chance to clear the pre-payment subscription read.
  if (
    invalidateCache &&
    (result.status === "activated" || result.status === "already_active")
  ) {
    invalidatePlanTierCache(result.businessId);
  }

  return result;
}
