import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { ManagerBodySkeleton } from "@/components/shell/settings-body-skeletons";

export default function BusinessDashboardNewInquiryLoading() {
  return (
    <DashboardPage>
      <PageHeader
        description="Capture the essentials from a call, chat, walk-in, or forwarded message. You can add deeper intake details later."
        eyebrow="New inquiry"
        title="Quick-add inquiry"
      />
      <ManagerBodySkeleton />
    </DashboardPage>
  );
}
