/**
 * Pure QR Ph eligibility rules.
 *
 * PayMongo handles QR Ph only. Polar remains the subscription provider for
 * cards, wallets, plan changes, and the customer portal. QR Ph is offered to
 * Philippine visitors who do not already have a live Polar subscription, and a
 * business on an active prepaid term can renew the same plan but cannot switch
 * plans until that term ends.
 */

import type {
  BillingProvider,
  PaidPlan,
  SubscriptionStatus,
} from "@/lib/billing/types";

export const PAYMONGO_COUNTRY_CODE = "PH";

export type PaymongoSubscriptionLike = {
  status: SubscriptionStatus;
  plan: string;
  billingProvider: BillingProvider;
  currentPeriodEnd: Date | null;
};

export type PaymongoIneligibilityReason =
  | "country"
  | "not_configured"
  | "polar_subscription"
  | "plan_change";

export type PaymongoEligibility = {
  available: boolean;
  reason: PaymongoIneligibilityReason | null;
  /**
   * When a prepaid term is active, only this plan may be renewed. `null` means
   * any paid plan can be bought.
   */
  renewablePlan: PaidPlan | null;
  /** Plan changes are locked until this date while a prepaid term is active. */
  lockedUntil: Date | null;
};

export function isPaidPlan(value: string | null | undefined): value is PaidPlan {
  return value === "pro" || value === "business";
}

/**
 * Whether the row is a paid Polar subscription that still occupies billing.
 * A local trial is explicitly *not* paid: QR Ph is allowed during a trial.
 */
export function isPaidPolarSubscription(
  subscription: PaymongoSubscriptionLike | null | undefined,
  now = new Date(),
): boolean {
  if (!subscription || subscription.billingProvider !== "polar") {
    return false;
  }

  switch (subscription.status) {
    case "active":
    case "past_due":
    case "paused":
    case "pending":
      return true;
    case "canceled":
      return (
        subscription.currentPeriodEnd !== null &&
        subscription.currentPeriodEnd > now
      );
    default:
      return false;
  }
}

/**
 * Whether the row is an active prepaid term. An `active` PayMongo row past its
 * end is already effectively free while the daily expiry job catches up.
 */
export function isActivePrepaidSubscription(
  subscription: PaymongoSubscriptionLike | null | undefined,
  now = new Date(),
): boolean {
  if (
    !subscription ||
    subscription.billingProvider !== "paymongo" ||
    !isPaidPlan(subscription.plan)
  ) {
    return false;
  }

  if (subscription.status !== "active" && subscription.status !== "canceled") {
    return false;
  }

  return (
    subscription.currentPeriodEnd !== null &&
    subscription.currentPeriodEnd > now
  );
}

export function resolvePaymongoEligibility({
  countryCode,
  configured,
  subscription,
  now = new Date(),
}: {
  countryCode: string | null | undefined;
  configured: boolean;
  subscription: PaymongoSubscriptionLike | null | undefined;
  now?: Date;
}): PaymongoEligibility {
  if (!configured) {
    return unavailable("not_configured");
  }

  if (countryCode?.trim().toUpperCase() !== PAYMONGO_COUNTRY_CODE) {
    return unavailable("country");
  }

  if (isPaidPolarSubscription(subscription, now)) {
    return unavailable("polar_subscription");
  }

  if (isActivePrepaidSubscription(subscription, now)) {
    return {
      available: true,
      reason: null,
      renewablePlan: subscription!.plan as PaidPlan,
      lockedUntil: subscription!.currentPeriodEnd,
    };
  }

  return {
    available: true,
    reason: null,
    renewablePlan: null,
    lockedUntil: null,
  };
}

/**
 * Whether a specific plan may be bought with QR Ph. A different plan while a
 * prepaid term is active is a plan change, which stays on Polar and is locked
 * until the term ends.
 */
export function canBuyPlanWithPaymongo(
  eligibility: PaymongoEligibility,
  plan: PaidPlan,
): { allowed: true } | { allowed: false; reason: PaymongoIneligibilityReason } {
  if (!eligibility.available) {
    return {
      allowed: false,
      reason: eligibility.reason ?? "not_configured",
    };
  }

  if (eligibility.renewablePlan && eligibility.renewablePlan !== plan) {
    return { allowed: false, reason: "plan_change" };
  }

  return { allowed: true };
}

function unavailable(
  reason: PaymongoIneligibilityReason,
): PaymongoEligibility {
  return {
    available: false,
    reason,
    renewablePlan: null,
    lockedUntil: null,
  };
}

const ineligibilityCopy: Record<PaymongoIneligibilityReason, string> = {
  country:
    "QR Ph is available only to businesses paying from the Philippines.",
  not_configured: "QR Ph is not available right now.",
  polar_subscription:
    "This business already has a card subscription. Manage it from the billing portal.",
  plan_change:
    "Your prepaid term is active. You can renew the same plan or switch plans after it ends.",
};

export function getPaymongoIneligibilityMessage(
  reason: PaymongoIneligibilityReason,
): string {
  return ineligibilityCopy[reason];
}
