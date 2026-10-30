import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";

import { DiscussionsPageSkeleton } from "./page";

export default function DiscussionsLoading() {
  return (
    <DashboardPage>
      <PageHeader title="Discussions" />
      <DiscussionsPageSkeleton />
    </DashboardPage>
  );
}
