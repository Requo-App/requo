import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminSectionsFallback } from "@/features/admin/components/admin-sections-fallback";

export default function AdminUsageLoading() {
  return (
    <DashboardPage>
      <PageHeader
        description="Who is consuming platform resources."
        title="Usage"
      />
      <AdminSectionsFallback />
    </DashboardPage>
  );
}
