export const auditEntityTypes = [
  "request",
  "quote",
  "business",
  "member",
  "subscription",
  "account",
  "invoice",
  "payment",
] as const;

export const auditSources = ["app", "webhook", "system", "admin"] as const;

export const auditActionLabels = {
  "request.created": "Inquiry created",
  "request.archived": "Inquiry archived",
  "request.trashed": "Inquiry moved to trash",
  "request.restored": "Inquiry restored",
  "request.deleted": "Inquiry permanently deleted",
  "request.updated": "Inquiry updated",
  "request.status_changed": "Inquiry status changed",
  "request.escalated": "Inquiry escalated to human",
  "quote.created": "Quote created",
  "quote.updated": "Quote updated",
  "quote.sent": "Quote sent",
  "quote.accepted": "Quote accepted",
  "quote.voided": "Quote voided",
  "quote.archived": "Quote archived",
  "quote.unarchived": "Quote restored to active",
  "quote.draft_deleted": "Draft quote deleted",
  "quote.canceled_after_acceptance": "Quote canceled after acceptance",
  "quote.work_completed": "Work completed",
  "quote.ai_pricing_acknowledged": "AI pricing confirmed by owner",
  "quote.scope_waived": "Required scope section waived",
  "approval.requested": "Approval requested",
  "approval.decided": "Approval decided",
  "change_order.created": "Change order created",
  "change_order.decided": "Change order decided",
  "schedule.accepted": "Commercial schedule accepted",
  "business.created": "Business created",
  "business.archived": "Business archived",
  "business.trashed": "Business moved to trash",
  "business.restored": "Business restored",
  "business.deletion_scheduled": "Business deletion scheduled",
  "business.deletion_canceled": "Business deletion canceled",
  "business.deleted": "Business deleted",
  "business.ownership_transferred": "Business ownership transferred",
  "business.pack_assigned": "Behavior pack assigned",
  "subscription.checkout_succeeded": "Subscription checkout succeeded",
  "subscription.plan_changed": "Plan changed",
  "subscription.cancellation_requested": "Subscription cancellation requested",
  "subscription.canceled": "Subscription canceled",
  "subscription.reactivated": "Subscription reactivated",
  "member.invited": "Member invited",
  "member.joined": "Member joined",
  "member.removed": "Member removed",
  "member.role_changed": "Member role changed",
  "member.invite_link_regenerated": "Member invite link regenerated",
  "member.invite_canceled": "Member invite canceled",
  "account.deletion_requested": "Account deletion requested",
  "account.deleted": "Account deleted",
  "account.suspended": "Account suspended by support",
  "account.unsuspended": "Account reinstated by support",
  "account.sessions_revoked": "Account sessions revoked by support",
  "account.email_force_verified": "Account email verified by support",
  "invoice.created": "Invoice created",
  "invoice.updated": "Invoice updated",
  "invoice.sent": "Invoice sent",
  "invoice.paid": "Invoice marked paid",
  "invoice.voided": "Invoice voided",
  "payment.recorded": "Payment recorded",
  "payment.voided": "Payment voided",
} as const;

export type AuditEntityType = (typeof auditEntityTypes)[number];
export type AuditSource = (typeof auditSources)[number];
export type AuditAction = keyof typeof auditActionLabels;

export type AuditLogMetadata = Record<string, unknown>;

export type AuditLogFilters = {
  actor: string | null;
  business: string | null;
  action: AuditAction | null;
  entity: AuditEntityType | null;
  from: string | null;
  to: string | null;
  page: number;
};

export type BusinessAuditLogItem = {
  id: string;
  businessId: string;
  businessName: string | null;
  businessSlug: string | null;
  actorUserId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  entityType: AuditEntityType;
  entityId: string | null;
  action: AuditAction;
  metadata: AuditLogMetadata;
  source: AuditSource;
  createdAt: Date;
};

export type BusinessAuditLogPage = {
  items: BusinessAuditLogItem[];
  totalCount: number;
  page: number;
  pageCount: number;
  pageSize: number;
};

export type BusinessAuditLogFilterOption = {
  label: string;
  value: string;
};

export type BusinessAuditLogFiltersView = {
  actors: BusinessAuditLogFilterOption[];
  businesses: BusinessAuditLogFilterOption[];
  actions: Array<{
    label: string;
    value: AuditAction;
  }>;
  entities: Array<{
    label: string;
    value: AuditEntityType;
  }>;
};
