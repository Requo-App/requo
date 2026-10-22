/**
 * Admin console constants.
 *
 * Shared identifiers for audit actions, audit target types, and list
 * page sizes. The value arrays are the source of truth; derived union
 * types are re-exported for use across `features/admin/**`.
 */

/**
 * Every mutation and view action the admin console is allowed to write
 * to `admin_audit_logs`. Keep this list exhaustive — `writeAdminAuditLog`
 * and `admin_audit_logs` filters rely on it.
 */
export const ADMIN_ACTIONS = [
  // Views
  "view.dashboard",
  "view.users",
  "view.user",
  "view.businesses",
  "view.business",
  "view.subscriptions",
  "view.subscription",
  "view.inquiries",
  "view.inquiry",
  "view.quotes",
  "view.quote",
  "view.invoices",
  "view.invoice",
  "view.ai",
  "view.ai-requests",
  "view.ai-providers",
  "view.ai-errors",
  "view.emails",
  "view.email",
  "view.usage",
  "view.audit-logs",
  "view.settings",
  "view.system",
  // User mutations
  "user.force_verify_email",
  "user.revoke_all_sessions",
  "user.suspend",
  "user.unsuspend",
  "user.delete",
  "user.promote_admin",
  "user.demote_admin",
  // Bootstrap
  "admin.bootstrap",
  // Subscription mutations
  "subscription.manual_plan_override",
  "subscription.force_cancel",
  // Business lifecycle mutations (soft state only — no hard deletes)
  "business.archive",
  "business.restore",
  "business.delete",
  // Impersonation lifecycle
  "impersonation.start",
  "impersonation.stop",
  // Password re-confirmation failures
  "confirmation.failed",
] as const;

export type AdminAction = (typeof ADMIN_ACTIONS)[number];

/**
 * Target types recorded on admin audit log rows. `"dashboard"` is used
 * for list/index views that do not target a specific record.
 */
export const ADMIN_TARGET_TYPES = [
  "user",
  "business",
  "subscription",
  "inquiry",
  "quote",
  "invoice",
  "ai-request",
  "ai-provider",
  "email",
  "usage",
  "settings",
  "system",
  "audit-log",
  "dashboard",
] as const;

export type AdminTargetType = (typeof ADMIN_TARGET_TYPES)[number];

/**
 * Placeholder `targetId` used on view-style audit entries where there
 * is no single record being targeted (e.g. list pages).
 */
export const ADMIN_DASHBOARD_TARGET_ID = "-" as const;

/** Default page size for most admin lists. */
export const ADMIN_DEFAULT_PAGE_SIZE = 25;

/** Page size for the audit log feed (tends to be scanned rather than read). */
export const ADMIN_AUDIT_PAGE_SIZE = 50;

/** Upper bound used when coercing user-supplied page size values. */
export const ADMIN_MAX_PAGE_SIZE = 100;

/**
 * Default number of rows in the Overview activity feed.
 *
 * The feed merges four sources, so this is also the per-source `LIMIT` — each
 * query pulls at most this many rows and the merged list is truncated back
 * down after sorting.
 */
export const ADMIN_RECENT_ACTIVITY_LIMIT = 12;

/**
 * Hard ceiling for the activity feed's `limit`. The value is clamped rather
 * than rejected so a malformed link still renders something useful.
 */
export const ADMIN_MAX_RECENT_ACTIVITY_LIMIT = 50;

/**
 * How many of the newest `ai_security_events` rows the AI errors page
 * shows. The table has no usable index, so this stays a small fixed
 * window rather than a paginated list.
 */
export const ADMIN_AI_SECURITY_EVENTS_LIMIT = 20;

/**
 * Provider ids the admin AI surface knows about.
 *
 * Mirrors the registry in `lib/ai/registry.ts` exactly: groq, google (Gemini),
 * cloudflare, nvidia, openrouter. Whether each one is actually
 * configured is env-driven and resolved per request.
 */
export const ADMIN_AI_PROVIDERS = [
  "groq",
  "google",
  "cloudflare",
  "nvidia",
  "openrouter",
] as const;

export type AdminAiProviderId = (typeof ADMIN_AI_PROVIDERS)[number];

/** Display labels matching `getConfiguredAiProviderLabels`. */
export const ADMIN_AI_PROVIDER_LABELS: Record<AdminAiProviderId, string> = {
  groq: "Groq",
  google: "Gemini",
  cloudflare: "Cloudflare",
  nvidia: "NVIDIA NIM",
  openrouter: "OpenRouter",
};

/**
 * Password re-confirmation TTL. Tokens expire this many seconds after
 * issue per Requirement 9.5.
 */
export const ADMIN_PASSWORD_CONFIRM_TTL_SECONDS = 5 * 60;

/**
 * Impersonation session duration passed to the Better Auth admin plugin
 * (seconds). Kept here so UI copy and the plugin config stay in sync.
 */
export const ADMIN_IMPERSONATION_SESSION_DURATION_SECONDS = 60 * 60;
