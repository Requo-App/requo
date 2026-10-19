/**
 * Paywall UI System
 *
 * Unified, composable paywall components for Requo.
 * Replaces inconsistent paywall patterns (full-page blurs, ad-hoc upgrade buttons,
 * custom locked states) with a consistent "visible feature preview + locked premium action" approach.
 *
 * @see .kiro/specs/paywall-ui-system/design.md
 */

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  UpgradePromptVariant,
  UpgradePromptSize,
  UpgradeActionProps,
} from "./types";

// ── Placeholder Data ─────────────────────────────────────────────────────────
export {
  getPlaceholderData,
  hasPlaceholderData,
  placeholderAiData,
  placeholderReportData,
} from "./lib/placeholder-data";
export type {
  PlaceholderFeature,
  PlaceholderDataMap,
  PlaceholderAiData,
  PlaceholderReportData,
} from "./lib/placeholder-data";

// ── Components (exported as they are implemented) ────────────────────────────
export { FeatureGate } from "./components/feature-gate";
export { UpgradePrompt } from "./components/upgrade-prompt";
export { LockedAction } from "./components/locked-action";
export { FeaturePreviewPaywall } from "./components/feature-preview-paywall";
export { PremiumContentBlur } from "./components/premium-content-blur";
export { UsageLimitBanner } from "./components/usage-limit-banner";
