import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  AdminAiCapacityFallback,
  AdminAiProvidersFallback,
} from "@/features/admin/components/ai/admin-ai-providers";

export default function AdminAiProvidersLoading() {
  return (
    <DashboardPage>
      <PageHeader
        description="Configured providers, routing, and live capacity."
        title="AI providers"
      />
      <div className="flex flex-col gap-6">
        <AdminAiProvidersFallback />
        <AdminAiCapacityFallback />
      </div>
    </DashboardPage>
  );
}
