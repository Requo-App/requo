import "server-only";

/**
 * Core subscription operations for business-level billing.
 *
 * Subscriptions are owned by businesses. Businesses without a row are
 * implicitly on the free plan.
 */

import { eq } from "drizzle-orm";
import { cacheLife, cacheTag, revalidateTag } from "next/cache";

import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema/businesses";
import { newEntityId } from "@/lib/ids";
import {
  billingShellCacheLife,
  getBusinessBillingCacheTags,
} from "@/lib/cache/shell-tags";
import {
  accountSubscriptions,
  businessSubscriptions,
  type BillingCurrency,
  type BillingProvider,
  type SubscriptionStatus,
} from "@/lib/db/schema/subscriptions";
import type { PlanTier } from "@/lib/plans/plans";

type BusinessSubscriptionRow = typeof businessSubscriptions.$inferSelect;
type AccountSubscriptionRow = typeof accountSubscriptions.$inferSelect;

type SubscriptionLike = {
  status: SubscriptionStatus;
  plan: string;
  currentPeriodEnd: Date | null;
};

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

    case "past_due":
      // Grace period: keep paid access
      return subscription.plan as PlanTier;

    case "pending":
    case "expired":
    case "incomplete":
    case "free":
    default:
      return "free";
  }
}

/** Legacy account row retained for admin override metadata and history. */
export async function getAccountSubscription(
  userId: string,
): Promise<AccountSubscriptionRow | null> {
  const [row] = await db
    .select()
    .from(accountSubscriptions)
    .where(eq(accountSubscriptions.userId, userId))
    .limit(1);

  return row ?? null;
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
    const [existing] = await tx
      .select()
      .from(businessSubscriptions)
      .where(eq(businessSubscriptions.businessId, params.businessId))
      .limit(1);

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
  },
): Promise<BusinessSubscriptionRow | null> {
  const existing = await getBusinessSubscription(businessId);

  if (!existing) {
    return null;
  }

  const now = new Date();

  const updated = await db.transaction(async (tx) => {
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
        canceledAt: updates?.canceledAt ?? existing.canceledAt,
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

    return row;
  });

  if (updated) {
    invalidatePlanTierCache(businessId);
  }

  return updated;
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
 * Marks a subscription as expired and downgrades all businesses to free.
 */
export async function expireSubscription(
  businessId: string,
): Promise<BusinessSubscriptionRow | null> {
  return updateSubscriptionStatus(businessId, "expired");
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

  const { Polar } = await import("@polar-sh/sdk");
  const { reversePolarProductId } = await import(
    "@/lib/billing/polar-products"
  );

  const polar = new Polar({
    accessToken: envVars.POLAR_ACCESS_TOKEN,
    server: envVars.POLAR_SERVER,
  });

  try {
    // PageIterator — grab the first active subscription for this business.
    let subscription: {
      id: string;
      status: string;
      productId: string;
      customerId: string;
      checkoutId: string | null;
      currency: string;
      currentPeriodStart: Date | string | null;
      currentPeriodEnd: Date | string | null;
    } | null = null;

    const pages = await polar.subscriptions.list({
      externalCustomerId: businessId,
      active: true,
      limit: 1,
    });

    for await (const page of pages) {
      const item = page.result?.items?.[0];
      if (item) {
        subscription = item;
      }
      break;
    }

    if (!subscription || subscription.status !== "active") {
      return false;
    }

    const mapping = reversePolarProductId(subscription.productId);

    if (!mapping) {
      return false;
    }

    await activateSubscription({
      businessId,
      plan: mapping.plan,
      provider: "polar",
      currency: (subscription.currency ?? "usd") as BillingCurrency,
      providerCustomerId: subscription.customerId,
      providerSubscriptionId: subscription.id,
      providerCheckoutId: subscription.checkoutId ?? null,
      currentPeriodStart: subscription.currentPeriodStart
        ? new Date(subscription.currentPeriodStart)
        : null,
      currentPeriodEnd: subscription.currentPeriodEnd
        ? new Date(subscription.currentPeriodEnd)
        : null,
    });

    return mapping.plan;
  } catch (error) {
    console.error("[billing] Failed to sync subscription from Polar:", error);
    return false;
  }
}
