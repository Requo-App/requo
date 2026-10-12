import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import { AdminAuditListPageShell } from "@/features/admin/components/system/admin-audit-list-sections";

/**
 * Structural loading state for the admin audit logs page.
 *
 * Composes the same fallbacks the page's Suspense boundaries use, so the shell
 * and the resolved page agree.
 */
export default function AdminAuditLogsLoading() {
  return (
    <AdminAuditListPageShell>
      <div className="dashboard-table-shell" data-list-card>
        <AdminListControlsFallback />
        <AdminListContentFallback />
      </div>
    </AdminAuditListPageShell>
  );
}
