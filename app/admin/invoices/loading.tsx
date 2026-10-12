import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";

export default function AdminInvoicesLoading() {
  return (
    <DashboardPage>
      <PageHeader
        title="Invoices"
        description="Manual-payment invoices across every business."
      />
      <div className="dashboard-table-shell" data-list-card>
        <AdminListControlsFallback />
        <AdminListContentFallback />
      </div>
    </DashboardPage>
  );
}
