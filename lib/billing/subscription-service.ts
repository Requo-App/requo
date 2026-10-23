import "server-only";

/**
 * Core subscription operations for business-level billing.
 *
 * Subscriptions are owned by businesses. Businesses without a row are
 * implicitly on the free plan.
 */

import { eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { normalizeBillingCurrency } from "@/lib/billing/currency";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema/businesses";
import { newEntityId } from "@/lib/ids";
import {
  billingShellCacheLife,
  getBusinessBillingCacheTags,
} from "@/lib/cache/shell-tags";
import {
  businessSubscriptions,
  type BillingCurrency,
  type BillingProvider,
  type SubscriptionStatus,
} from "@/lib/db/schema/subscriptions";
import type { PlanTier } from "@/lib/plans/plans";

type BusinessSubscriptionRow = typeof businessSubscriptions.$inferSelect;

type SubscriptionLike = {
  status: SubscriptionStatus;
  plan: string;
  currentPeriodEnd: Date | null;
};

/**
 * Local grace window after a failed renewal. Polar retries dunning on its
 * own schedule, but paid access must not last forever if the webhook route
 * or dunning never recovers.
 */
export const PAST_DUE_GRACE_DAYS = 7;
export const PAST_DUE_GRACE_MS =
  PAST_DUE_GRACE_DAYS * 24 * 60 * 60 * 1000;

const businessSubscriptionLockNamespace = 903_118_247;

export function getPastDueGraceEnd(currentPeriodEnd: Date | null): Date | null {
  if (!currentPeriodEnd) return null;
  return new Date(currentPeriodEnd.getTime() + PAST_DUE_GRACE_MS);
}

/**
 * Serializes subscription writes per business. `SELECT ... FOR UPDATE`
 * cannot lock a row that does not exist yet, so two first events could
 * otherwise both pass the stale check and race the unique insert.
 */
async function lockBusinessSubscription(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${businessSubscriptionLockNamespace}, hashtext(${businessId}))`,
  );
}

function isStaleProviderEvent(
  incoming: Date | null | undefined,
  existing: Date | null | undefined,
): boolean {
  return !!incoming && !!existing && incoming.getTime() < existing.getTime();
}

/* ── Read ──────────────────────────────────────────────────────────────────── */

/**
 * Invalidates the cached reads that depend on a business's plan.
 *
 * `revalidateTag` (not `updateTag`) because subscription writes happen in
 * Route Handlers — the Polar webhooks and the expiry cron — where
 * `updateTag` is unsupported.
 *
 * The business scope tag is included on purpose: plan-gated reads such as
 * the inquiry form config are resolved against the plan, so they must
 * converge with the subscription change too.
 */
function invalidatePlanTierCache(businessId: string) {
  for (const tag of getBusinessBillingCacheTags(businessId)) {
    revalidateTag(tag, "max");
  }
}

/**
 * Returns the subscription row for a business, or `null` if no subscription
 * exists (business is implicitly free).
 */
export async function getBusinessSubscription(
  businessId: string,
): Promise<BusinessSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, businessId))
    .limit(1);

  return row ?? null;
}

/**
 * Cached read helper for request/render paths. Mutation and webhook paths
 * should keep using `getBusinessSubscription` for fresh pre-write reads.
 */
export async function getCachedBusinessSubscription(
  businessId: string,
): Promise<BusinessSubscriptionRow | null> {
  "use cache";

  cacheLife(billingShellCacheLife);
  cacheTag(...getBusinessBillingCacheTags(businessId));

  return getBusinessSubscription(businessId);
}

/**
 * Resolves the effective plan for a business.
 */
export async function getEffectivePlanForBusiness(
  businessId: string,
): Promise<PlanTier> {
  const subscription = await getBusinessSubscription(businessId);

  if (!subscription) {
    return "free";
  }

  return resolveEffectivePlanFromSubscription(subscription);
}

export async function getCachedEffectivePlanForBusiness(
  businessId: string,
): Promise<PlanTier> {
  "use cache";

  cacheLife(billingShellCacheLife);
  cacheTag(...getBusinessBillingCacheTags(businessId));

  const subscription = await getBusinessSubscription(businessId);

  if (!subscription) {
    return "free";
  }

  return resolveEffectivePlanFromSubscription(subscription);
}

/**
 * Pure function that resolves the effective business plan from a
 * subscription row. Exported for unit testing.
 */
export function resolveEffectivePlanFromSubscription(
  subscription: SubscriptionLike,
): PlanTier {
  switch (subscription.status) {
    case "active":
      return subscription.plan as PlanTier;

    case "canceled":
      // Still active until end of billing period
      if (
        subscription.currentPeriodEnd &&
        subscription.currentPeriodEnd > new Date()
      ) {
        return subscription.plan as PlanTier;
      }
      return "free";

    case "past_due": {
      const graceEnd = getPastDueGraceEnd(subscription.currentPeriodEnd);
      return graceEnd && graceEnd > new Date()
        ? (subscription.plan as PlanTier)
        : "free";
    }

    case "pending":
    case "paused":
    case "expired":
    case "incomplete":
    case "free":
    default:
      return "free";
  }
}

/**
 * Null-safe variant for queries that left-join `business_subscriptions`.
 * A business without a subscription row is on the free plan.
 */
export function resolveEffectivePlanFromSubscriptionFields(
  subscription:
    | {
        status: SubscriptionStatus | null;
        plan: string | null;
        currentPeriodEnd: Date | null;
      }
    | null
    | undefined,
): PlanTier {
  if (!subscription?.status || !subscription.plan) {
    return "free";
  }

  return resolveEffectivePlanFromSubscription({
    status: subscription.status,
    plan: subscription.plan,
    currentPeriodEnd: subscription.currentPeriodEnd,
  });
}

/* ── Write ─────────────────────────────────────────────────────────────────── */

type ActivateSubscriptionParams = {
  businessId: string;
  plan: PlanTier;
  provider: BillingProvider;
  currency: BillingCurrency;
  status?: SubscriptionStatus;
  providerCustomerId?: string | null;
  providerSubscriptionId?: string | null;
  providerCheckoutId?: string | null;
  paymentMethod?: string | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  providerEventAt?: Date | null;
};

/**
 * Creates or updates a business subscription to an active state.
 *
 * The subscription write and the denormalized `businesses.plan` update
 * run in a single transaction: if either fails, both roll back, so the
 * cache can never drift from the authoritative subscription row.
 */
export async function activateSubscription(
  params: ActivateSubscriptionParams,
): Promise<BusinessSubscriptionRow> {
  const now = new Date();

  const subscription = await db.transaction(async (tx) => {
    await lockBusinessSubscription(tx, params.businessId);

    const [existing] = await tx
      .select()
      .from(businessSubscriptions)
      .where(eq(businessSubscriptions.businessId, params.businessId))
      .limit(1)
      .for("update");

    if (
      existing &&
      isStaleProviderEvent(params.providerEventAt, existing.providerEventAt)
    ) {
      return existing;
    }

    let subscription: BusinessSubscriptionRow;

    if (existing) {
      const [updated] = await tx
        .update(businessSubscriptions)
        .set({
          status: params.status ?? "active",
          plan: params.plan,
          billingProvider: params.provider,
          billingCurrency: params.currency,
          providerCustomerId: params.providerCustomerId ?? existing.providerCustomerId,
          providerSubscriptionId:
            params.providerSubscriptionId ?? existing.providerSubscriptionId,
          providerCheckoutId:
            params.providerCheckoutId ?? existing.providerCheckoutId,
          paymentMethod: params.paymentMethod ?? existing.paymentMethod,
          currentPeriodStart: params.currentPeriodStart ?? now,
          currentPeriodEnd: params.currentPeriodEnd ?? null,
          canceledAt: null,
          providerEventAt:
            params.providerEventAt ?? existing.providerEventAt,
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
          businessId: params.businessId,
          status: params.status ?? "active",
          plan: params.plan,
          billingProvider: params.provider,
          billingCurrency: params.currency,
          providerCustomerId: params.providerCustomerId ?? null,
          providerSubscriptionId: params.providerSubscriptionId ?? null,
          providerCheckoutId: params.providerCheckoutId ?? null,
          paymentMethod: params.paymentMethod ?? null,
          currentPeriodStart: params.currentPeriodStart ?? now,
          currentPeriodEnd: params.currentPeriodEnd ?? null,
          providerEventAt: params.providerEventAt ?? null,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: businessSubscriptions.businessId,
          set: {
            status: params.status ?? "active",
            plan: params.plan,
            billingProvider: params.provider,
            billingCurrency: params.currency,
            providerCustomerId: params.providerCustomerId ?? null,
            providerSubscriptionId: params.providerSubscriptionId ?? null,
            providerCheckoutId: params.providerCheckoutId ?? null,
            paymentMethod: params.paymentMethod ?? null,
            currentPeriodStart: params.currentPeriodStart ?? now,
            currentPeriodEnd: params.currentPeriodEnd ?? null,
            canceledAt: null,
            providerEventAt: params.providerEventAt ?? null,
            updatedAt: now,
          },
        })
        .returning();

      subscription = created!;
    }

    // Keep the denormalized businesses.plan column in sync so UI reads
    // are immediately consistent without waiting for cache revalidation.
    // The value is the *effective* plan derived from the subscription row,
    // not the requested plan: a non-active status (pending, incomplete)
    // must never leave a paid plan behind in the read cache.
    await tx
      .update(businesses)
      .set({
        plan: resolveEffectivePlanFromSubscription(subscription),
        updatedAt: now,
      })
      .where(eq(businesses.id, params.businessId));

    return subscription;
  });

  invalidatePlanTierCache(params.businessId);

  return subscription;
}

/**
 * Creates a pending subscription while checkout confirmation is pending.
 */
export async function createPendingSubscription(
  params: Omit<ActivateSubscriptionParams, "status">,
): Promise<BusinessSubscriptionRow> {
  return activateSubscription({ ...params, status: "pending" });
}

/**
 * Updates a subscription status from a provider event.
 *
 * The subscription row and the denormalized `businesses.plan` read cache
 * are written in one transaction, so the cache can never drift from the
 * authoritative row. Without the `businesses.plan` sync, a revoked or
 * expired business keeps its paid plan in the column and every reader of
 * that column keeps granting paid entitlements.
 */
export async function updateSubscriptionStatus(
  businessId: string,
  status: SubscriptionStatus,
  updates?: {
    providerSubscriptionId?: string | null;
    providerCustomerId?: string | null;
    paymentMethod?: string | null;
    currentPeriodStart?: Date | null;
    currentPeriodEnd?: Date | null;
    canceledAt?: Date | null;
    providerEventAt?: Date | null;
    /**
     * Conditional expiry guard for the scheduled job. The row is re-read
     * under lock, so a recovery webhook that landed after the job's scan
     * must win instead of being overwritten by the stale batch row.
     */
    guard?: {
      status?: SubscriptionStatus;
      currentPeriodEndBefore?: Date;
    };
  },
): Promise<BusinessSubscriptionRow | null> {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    await lockBusinessSubscription(tx, businessId);

    const [existing] = await tx
      .select()
      .from(businessSubscriptions)
      .where(eq(businessSubscriptions.businessId, businessId))
      .limit(1)
      .for("update");

    if (!existing) {
      return null;
    }

    if (isStaleProviderEvent(updates?.providerEventAt, existing.providerEventAt)) {
      return { row: existing, changed: false };
    }

    if (
      updates?.guard?.status &&
      existing.status !== updates.guard.status
    ) {
      return { row: existing, changed: false };
    }

    if (
      updates?.guard?.currentPeriodEndBefore &&
      existing.currentPeriodEnd &&
      existing.currentPeriodEnd >= updates.guard.currentPeriodEndBefore
    ) {
      return { row: existing, changed: false };
    }

    const [row] = await tx
      .update(businessSubscriptions)
      .set({
        status,
        providerSubscriptionId:
          updates?.providerSubscriptionId ?? existing.providerSubscriptionId,
        providerCustomerId:
          updates?.providerCustomerId ?? existing.providerCustomerId,
        paymentMethod: updates?.paymentMethod ?? existing.paymentMethod,
        currentPeriodStart:
          updates?.currentPeriodStart ?? existing.currentPeriodStart,
        currentPeriodEnd:
          updates?.currentPeriodEnd ?? existing.currentPeriodEnd,
        canceledAt:
          status === "active"
            ? null
            : updates?.canceledAt ?? existing.canceledAt,
        providerEventAt:
          updates?.providerEventAt ?? existing.providerEventAt,
        updatedAt: now,
      })
      .where(eq(businessSubscriptions.id, existing.id))
      .returning();

    if (!row) {
      return null;
    }

    await tx
      .update(businesses)
      .set({
        plan: resolveEffectivePlanFromSubscription(row),
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    return { row, changed: true };
  });

  if (result?.changed) {
    invalidatePlanTierCache(businessId);
  }

  return result?.row ?? null;
}

/**
 * Updates a subscription's payment method (e.g. from a transaction).
 */
export async function updateSubscriptionPaymentMethod(
  businessId: string,
  paymentMethod: string,
): Promise<boolean> {
  const existing = await getBusinessSubscription(businessId);

  if (!existing) {
    return false;
  }

  const [updated] = await db
    .update(businessSubscriptions)
    .set({
      paymentMethod,
      updatedAt: new Date(),
    })
    .where(eq(businessSubscriptions.id, existing.id))
    .returning({ id: businessSubscriptions.id });

  return !!updated;
}

/**
 * Marks a subscription as canceled. The user keeps paid access
 * until `currentPeriodEnd`.
 */
export async function cancelSubscription(
  businessId: string,
): Promise<BusinessSubscriptionRow | null> {
  return updateSubscriptionStatus(businessId, "canceled", {
    canceledAt: new Date(),
  });
}

/**
 * Marks a business subscription as expired and downgrades that business's
 * denormalized plan to free.
 */
export async function expireSubscription(
  businessId: string,
  providerEventAt?: Date | null,
  guard?: {
    status?: SubscriptionStatus;
    currentPeriodEndBefore?: Date;
  },
): Promise<BusinessSubscriptionRow | null> {
  return updateSubscriptionStatus(businessId, "expired", {
    providerEventAt,
    guard,
  });
}

/* ── Polar sync ───────────────────────────────────────────────────────────── */

/**
 * Fetches the latest subscription for a business from Polar and applies
 * it locally. Used after checkout redirect to close the race between
 * the browser redirect and webhook delivery.
 *
 * Returns the activated plan name (e.g. "pro", "business") on success,
 * or `false` if no active subscription was found on Polar's side.
 */
export async function syncSubscriptionFromPolar(
  businessId: string,
): Promise<PlanTier | false> {
  const { env: envVars, isPolarConfigured } = await import("@/lib/env");

  if (!isPolarConfigured || !envVars.POLAR_ACCESS_TOKEN) {
    return false;
  }

  const [{ getPolarClient }, { reversePolarProductId }] = await Promise.all([
    import("@/lib/billing/polar-client"),
    import("@/lib/billing/polar-products"),
  ]);

  const polar = getPolarClient();

  try {
    const page = await polar.subscriptions.list({
      external_customer_id: businessId,
      active: true,
      limit: 1,
    });

    const subscription = page.items[0];

    if (!subscription || subscription.status !== "active") {
      return false;
    }

    const mapping = reversePolarProductId(subscription.product_id);

    if (!mapping) {
      return false;
    }

    await activateSubscription({
      businessId,
      plan: mapping.plan,
      provider: "polar",
      currency: normalizeBillingCurrency(subscription.currency),
      providerCustomerId: subscription.customer_id,
      providerSubscriptionId: subscription.id,
      providerCheckoutId: subscription.checkout_id ?? null,
      currentPeriodStart: subscription.current_period_start
        ? new Date(subscription.current_period_start)
        : null,
      currentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end)
        : null,
      // Respect webhook ordering: Polar's `modified_at` is the
      // subscription's own occurrence timestamp, so a slow post-checkout
      // sync cannot roll back a newer webhook write.
      providerEventAt: subscription.modified_at
        ? new Date(subscription.modified_at)
        : null,
    });

    return mapping.plan;
  } catch (error) {
    console.error("[billing] Failed to sync subscription from Polar:", error);
    return false;
  }
}
