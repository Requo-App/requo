import {
  AuditLogFiltersFallback,
  AuditLogTableFallback,
} from "@/features/audit/components/business-audit-log-fallbacks";

/**
 * Loading skeleton for the business audit log settings page.
 *
 * Same shared fallbacks as the page's inner Suspense boundaries (see
 * page.tsx): static filter labels and table headers paint instantly, only
 * DB-backed controls and rows show skeletons — no full-page gray flash.
 */
export default function BusinessAuditLogSettingsLoading() {
  return (
    <div className="flex flex-col gap-6">
      <AuditLogFiltersFallback />
      <AuditLogTableFallback />
    </div>
  );
}
