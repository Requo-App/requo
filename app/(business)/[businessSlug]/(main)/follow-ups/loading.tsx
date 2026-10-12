import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";

import { FollowUpsPageSkeleton } from "./page";

export default function FollowUpsLoading() {
  return (
    <DashboardPage>
      <PageHeader title="Follow-ups" />
      <FollowUpsPageSkeleton />
    </DashboardPage>
  );
}
