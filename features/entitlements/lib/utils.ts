/**
 * Shared entitlement utility helpers.
 *
 * Pure functions usable by both client and server components. The canonical
 * access check lives in `lib/plans/entitlements.ts`; these helpers only shape
 * upgrade copy for feature gates and prompts.
 */

import type { PlanTier } from "@/lib/plans/plans";
import { planMeta } from "@/lib/plans/plans";
import {
  getRequiredPlan,
  planFeatureDescriptions,
  planFeatureLabels,
  type PlanFeature,
} from "@/lib/plans/entitlements";

/**
 * Returns the human-readable benefit description for a feature.
 * Used in upgrade prompts and locked-action popovers to communicate
 * what the user gains by upgrading.
 */
export function getUpgradeDescription(feature: PlanFeature): string {
  return planFeatureDescriptions[feature];
}

/**
 * Returns the human-readable label for a feature.
 */
export function getFeatureLabel(feature: PlanFeature): string {
  return planFeatureLabels[feature];
}

/**
 * Resolves the minimum plan required to unlock a feature.
 * Returns the plan identifier or defaults to "pro" if the feature
 * is somehow not mapped (defensive fallback).
 */
export function getRequiredPlanForUpgrade(feature: PlanFeature): PlanTier {
  const required = getRequiredPlan(feature);
  // If null, the feature is available on all plans (including free).
  // In an entitlement context this shouldn't happen, but default to "pro" defensively.
  return required ?? "pro";
}

/**
 * Returns the display label for the required plan (e.g., "Pro", "Business").
 */
export function getRequiredPlanLabel(feature: PlanFeature): string {
  const plan = getRequiredPlanForUpgrade(feature);
  return planMeta[plan].label;
}

/**
 * Returns the CTA text for upgrading from the current plan.
 * - free → "Upgrade to Pro"
 * - pro → "Upgrade to Business"
 * - business → null (no upgrade available)
 */
export function getUpgradeCtaText(
  currentPlan: PlanTier,
  requiredPlan?: PlanTier,
): string | null {
  if (requiredPlan) {
    if (currentPlan === requiredPlan) {
      return null;
    }
    return `Upgrade to ${planMeta[requiredPlan].label}`;
  }

  switch (currentPlan) {
    case "free":
      return "Upgrade to Pro";
    case "pro":
      return "Upgrade to Business";
    case "business":
      return null;
  }
}
