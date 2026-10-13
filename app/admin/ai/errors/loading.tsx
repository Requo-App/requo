import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminAiSecurityEventsFallback } from "@/features/admin/components/ai/admin-ai-errors-sections";
import { AdminListContentFallback } from "@/features/admin/components/list/admin-list-content-fallback";
import { AdminListControlsFallback } from "@/features/admin/components/list/admin-list-controls-fallback";

export default function AdminAiErrorsLoading() {
  return (
    <DashboardPage>
      <PageHeader
        description="Failed AI calls and security events."
        title="AI errors"
      />
      <div className="dashboard-table-shell" data-list-card>
        <AdminListControlsFallback />
        <AdminListContentFallback />
      </div>
      <AdminAiSecurityEventsFallback />
    </DashboardPage>
  );
}
