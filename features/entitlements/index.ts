/**
 * Entitlement Gating UI
 *
 * Shared components for rendering plan-gated actions, blocks, and pages.
 * Entitlement rules live in `lib/plans/entitlements.ts`; this module owns
 * only the presentation and upgrade flow.
 */

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  UpgradePromptVariant,
  UpgradePromptSize,
  UpgradeActionProps,
} from "./types";

// ── Components ───────────────────────────────────────────────────────────────
export { FeatureGate } from "./components/feature-gate";
export { UpgradePrompt } from "./components/upgrade-prompt";
export { UpgradeNoticeButton } from "./components/upgrade-notice-button";
