import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";
import { AdminEmailQuotasFallback } from "@/features/admin/components/operations/emails/admin-email-quotas";

export default function AdminEmailsLoading() {
  return (
    <DashboardPage>
      <PageHeader
        description="Transactional email delivery and failures."
        title="Emails"
      />
      <AdminEmailQuotasFallback />
      <div className="dashboard-table-shell" data-list-card>
        <AdminListControlsFallback />
        <AdminListContentFallback />
      </div>
    </DashboardPage>
  );
}
