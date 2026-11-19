import type { AdminAction, AdminTargetType } from "@/features/admin/constants";

/**
 * Human-readable labels for admin audit actions and target types.
 *
 * Both maps are exhaustive `Record`s over the constant unions, so adding an
 * action to `ADMIN_ACTIONS` fails typecheck until it is labelled here. That is
 * deliberate: the alternative is an audit feed that silently renders raw
 * `user.revoke_all_sessions` strings.
 *
 * This is the single source of truth. The audit table and the user-detail
 * audit feed previously each carried their own copy.
 */
export const adminActionLabels: Record<AdminAction, string> = {
  "view.dashboard": "Viewed dashboard",
  "view.users": "Viewed users",
  "view.user": "Viewed user detail",
  "view.businesses": "Viewed businesses",
  "view.business": "Viewed business detail",
  "view.subscriptions": "Viewed subscriptions",
  "view.subscription": "Viewed subscription detail",
  "view.inquiries": "Viewed inquiries",
  "view.inquiry": "Viewed inquiry detail",
  "view.quotes": "Viewed quotes",
  "view.quote": "Viewed quote detail",
  "view.invoices": "Viewed invoices",
  "view.invoice": "Viewed invoice detail",
  "view.ai": "Viewed AI overview",
  "view.ai-requests": "Viewed AI requests",
  "view.ai-providers": "Viewed AI providers",
  "view.ai-errors": "Viewed AI errors",
  "view.emails": "Viewed emails",
  "view.email": "Viewed email detail",
  "view.usage": "Viewed usage",
  "view.audit-logs": "Viewed audit logs",
  "view.settings": "Viewed settings",
  "view.system": "Viewed system",
  "user.force_verify_email": "Force-verified email",
  "user.revoke_all_sessions": "Revoked all sessions",
  "user.suspend": "Suspended user",
  "user.unsuspend": "Reinstated user",
  "user.delete": "Deleted user",
  "user.promote_admin": "Promoted to admin",
  "user.demote_admin": "Removed admin access",
  "admin.bootstrap": "Admin bootstrap",
  "subscription.manual_plan_override": "Overrode subscription plan",
  "subscription.force_cancel": "Force-canceled subscription",
  "business.archive": "Archived business",
  "business.restore": "Restored business",
  "business.delete": "Deleted business",
  "email.retry": "Retried email delivery",
  "impersonation.start": "Started impersonation",
  "impersonation.stop": "Stopped impersonation",
  "confirmation.failed": "Password re-confirmation failed",
};

export const adminTargetTypeLabels: Record<AdminTargetType, string> = {
  user: "User",
  business: "Business",
  subscription: "Subscription",
  inquiry: "Inquiry",
  quote: "Quote",
  invoice: "Invoice",
  "ai-request": "AI request",
  "ai-provider": "AI provider",
  email: "Email",
  usage: "Usage",
  settings: "Settings",
  system: "System",
  "audit-log": "Audit log",
  dashboard: "Dashboard",
};

/**
 * Look up an action label from an untrusted string.
 *
 * `admin_audit_logs.action` is a `text` column, so a row written by an older
 * build can hold a value that is no longer in `ADMIN_ACTIONS`. Rather than
 * render `undefined`, unknown values fall through unchanged.
 */
export function getAdminActionLabel(action: string): string {
  return adminActionLabels[action as AdminAction] ?? action;
}

/** Look up a target-type label from an untrusted string. See above. */
export function getAdminTargetTypeLabel(targetType: string): string {
  return adminTargetTypeLabels[targetType as AdminTargetType] ?? targetType;
}
