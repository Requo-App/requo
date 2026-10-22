import type { PlanTier } from "@/lib/plans";

/**
 * Layout variant for the UpgradePrompt component.
 *
 * - inline: CTA + description in a flex row, no card wrapper
 * - card: wrapped in Card with CardHeader + CardContent
 * - banner: full-width horizontal strip
 * - empty-state: centered vertical layout with icon, description, and CTA
 * - modal: content rendered inside Dialog overlay
 */
export type UpgradePromptVariant =
  | "inline"
  | "card"
  | "banner"
  | "empty-state"
  | "modal";

/**
 * Size scale for the UpgradePrompt component.
 * Defaults to "md" when not specified.
 */
export type UpgradePromptSize = "sm" | "md" | "lg";

/**
 * Props required to wire up the UpgradeButton checkout integration.
 * When provided, entitlement components render the full checkout flow.
 * When omitted, components fall back to navigating to the billing page.
 */
export type UpgradeActionProps = {
  userId: string;
  businessId: string;
  businessSlug: string;
  currentPlan: PlanTier;
  /** Optional CTA override, used by page-level gates with feature-specific copy. */
  ctaLabel?: string;
};
