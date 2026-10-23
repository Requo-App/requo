/**
 * Central plan definitions for the Requo pricing system.
 *
 * Plans are attached to businesses (not users). This module is
 * the single source of truth for plan identifiers, labels, and metadata.
 */

export const planTiers = ["free", "pro", "business"] as const;

export type PlanTier = (typeof planTiers)[number];

/** Length of the one-time Pro trial granted per business owner. */
export const PRO_TRIAL_DAYS = 14;
export const PRO_TRIAL_MS = PRO_TRIAL_DAYS * 24 * 60 * 60 * 1000;

export function isPlanTier(value: unknown): value is PlanTier {
  return (
    typeof value === "string" &&
    planTiers.includes(value as PlanTier)
  );
}


export type PlanMeta = {
  label: string;
  description: string;
  ctaLabel: string;
  /** Whether this plan is the currently recommended upsell target. */
  highlighted: boolean;
};

export const planMeta: Record<PlanTier, PlanMeta> = {
  free: {
    label: "Free",
    description:
      "Run the complete inquiry-to-payment workflow for one service business.",
    ctaLabel: "Get started free",
    highlighted: false,
  },
  pro: {
    label: "Pro",
    description:
      "Save time with automatic follow-ups, more AI drafting, custom emails, and advanced insights.",
    ctaLabel: "Upgrade to Pro",
    highlighted: true,
  },
  business: {
    label: "Business",
    description:
      "Give a small team shared access, roles, and higher limits.",
    ctaLabel: "Upgrade to Business",
    highlighted: false,
  },
};

/**
 * Returns the minimum plan that upgrades from the current plan.
 * Returns `null` if the business is already on the highest plan.
 */
export function getUpgradePlan(
  currentPlan: PlanTier,
): PlanTier | null {
  switch (currentPlan) {
    case "free":
      return "pro";
    case "pro":
      return "business";
    case "business":
      return null;
  }
}

/**
 * Returns the CTA label for upgrading from a given plan.
 */
export function getUpgradeCtaLabel(currentPlan: PlanTier): string {
  const upgradePlan = getUpgradePlan(currentPlan);

  if (!upgradePlan) {
    return "You're on the highest plan";
  }

  return planMeta[upgradePlan].ctaLabel;
}
