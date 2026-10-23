import "server-only";

import { eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

import { detectDisplayCurrency } from "@/lib/billing/region";
import { db } from "@/lib/db/client";
import { listLockCandidatesForDowngrade } from "@/features/businesses/plan-enforcement";
import { businesses } from "@/lib/db/schema/businesses";
import {
  canStartBusinessTrial,
  getCachedBusinessSubscription,
  getBusinessSubscription,
  resolveEffectivePlanFromSubscription,
} from "@/lib/billing/subscription-service";
import {
  getBusinessBillingCacheTags,
  billingShellCacheLife,
} from "@/lib/cache/shell-tags";
import type { BusinessBillingOverview } from "@/features/billing/types";
import type { PlanTier } from "@/lib/plans/plans";

/**
 * Cached business identity (no dynamic APIs like headers()).
 */
async function getCachedBusinessData(businessId: string) {
  "use cache";

  cacheLife(billingShellCacheLife);
  cacheTag(...getBusinessBillingCacheTags(businessId));

  const rows = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      plan: businesses.plan,
      ownerUserId: businesses.ownerUserId,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return rows[0] ?? null;
}

function toBillingSubscriptionView(
  subscription: Awaited<ReturnType<typeof getBusinessSubscription>>,
): BusinessBillingOverview["subscription"] {
  return subscription
    ? {
        status: subscription.status,
        plan: subscription.plan,
        provider: subscription.billingProvider,
        currency: subscription.billingCurrency,
        paymentMethod: subscription.paymentMethod,
        currentPeriodStart: subscription.currentPeriodStart,
        currentPeriodEnd: subscription.currentPeriodEnd,
        trialEndsAt: subscription.trialEndsAt,
        canceledAt: subscription.canceledAt,
        providerSubscriptionId: subscription.providerSubscriptionId,
        providerCustomerId: subscription.providerCustomerId,
      }
    : null;
}

/**
 * The subscription's billing currency is authoritative for an existing
 * subscription because that is what the provider charges. Without one, use
 * the visitor's detected pricing currency, matching the market the checkout
 * will open in. Header lookup failures fall back to USD so billing chrome
 * still renders in contexts without a request (for example, local builds).
 */
async function resolveBillingCurrency(
  subscription: Awaited<ReturnType<typeof getBusinessSubscription>>,
): Promise<BusinessBillingOverview["billingCurrency"]> {
  if (subscription) {
    return subscription.billingCurrency;
  }

  try {
    return await detectDisplayCurrency();
  } catch {
    return "USD";
  }
}

function createEmptyDowngradePreview(): BusinessBillingOverview["downgradePreview"] {
  return {
    targetPlan: "free",
    activeBusinessLimit: null,
    activeBusinesses: [],
    requiresSelection: false,
  };
}

/**
 * Slim shell billing state for dashboard chrome and upgrade buttons.
 * It intentionally skips downgrade preview queries used only by billing pages.
 *
 * Wrapped in `React.cache` so the business shell and the streamed upgrade
 * slot (which both call this from the same layout) share one resolution per
 * request. The inner cached reads are already `"use cache"`-backed.
 */
export const getBusinessBillingShellOverview = cache(
  async (businessId: string): Promise<BusinessBillingOverview | null> => {
    try {
      const businessData = await getCachedBusinessData(businessId);

      if (!businessData) {
        return null;
      }

      const subscription = await getCachedBusinessSubscription(businessId);
      const currentPlan = subscription
        ? resolveEffectivePlanFromSubscription(subscription)
        : (businessData.plan as PlanTier);
      const [canStartTrial, billingCurrency] = await Promise.all([
        canStartBusinessTrial({
          userId: businessData.ownerUserId,
          businessId,
        }),
        resolveBillingCurrency(subscription),
      ]);

      return {
        userId: businessData.ownerUserId,
        businessId: businessData.id,
        businessName: businessData.name,
        businessSlug: businessData.slug,
        currentPlan,
        billingCurrency,
        canStartTrial,
        downgradePreview: createEmptyDowngradePreview(),
        subscription: toBillingSubscriptionView(subscription),
      };
    } catch (error) {
      console.error(
        "Failed to load shell billing overview.",
        { businessId },
        error,
      );

      return null;
    }
  },
);

/**
 * Returns a full billing overview for the business billing UI.
 * Subscription and plan are resolved for the requested business.
 */
export async function getBusinessBillingOverview(
  businessId: string,
): Promise<BusinessBillingOverview | null> {
  try {
    const businessData = await getCachedBusinessData(businessId);

    if (!businessData) {
      return null;
    }

    const subscription = await getBusinessSubscription(businessId);
    const currentPlan = subscription
      ? resolveEffectivePlanFromSubscription(subscription)
      : (businessData.plan as PlanTier);
    const [downgradePreview, canStartTrial, billingCurrency] = await Promise.all([
      currentPlan === "free"
        ? listLockCandidatesForDowngrade({
            ownerUserId: businessData.ownerUserId,
            targetPlan: "free",
          })
        : Promise.resolve({
            activeBusinessLimit: null,
            activeBusinesses: [],
            requiresSelection: false,
          }),
      canStartBusinessTrial({
        userId: businessData.ownerUserId,
        businessId,
      }),
      resolveBillingCurrency(subscription),
    ]);

    return {
      userId: businessData.ownerUserId,
      businessId: businessData.id,
      businessName: businessData.name,
      businessSlug: businessData.slug,
      currentPlan,
      billingCurrency,
      canStartTrial,
      downgradePreview: {
        targetPlan: "free",
        activeBusinessLimit: downgradePreview.activeBusinessLimit,
        activeBusinesses: downgradePreview.activeBusinesses.map((business) => ({
          id: business.id,
          name: business.name,
          slug: business.slug,
          lastOpenedAt: business.lastOpenedAt,
        })),
        requiresSelection: downgradePreview.requiresSelection,
      },
      subscription: toBillingSubscriptionView(subscription),
    };
  } catch (error) {
    console.error(
      "Failed to load business billing overview.",
      { businessId },
      error,
    );

    return null;
  }
}
