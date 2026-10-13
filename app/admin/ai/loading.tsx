import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { AdminSectionsFallback } from "@/features/admin/components/admin-sections-fallback";

export default function AdminAiLoading() {
  return (
    <DashboardPage>
      <PageHeader
        description="Model usage, cost, and reliability at a glance."
        title="AI overview"
      />
      <AdminSectionsFallback />
    </DashboardPage>
  );
}
