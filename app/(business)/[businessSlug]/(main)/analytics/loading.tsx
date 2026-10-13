import { DashboardPage } from "@/components/shared/dashboard-layout";

import {
  AnalyticsHeaderSkeleton,
  AnalyticsTabsSkeleton,
} from "./page";

export default function AnalyticsLoading() {
  return (
    <DashboardPage className="bg-surface-default">
      <AnalyticsHeaderSkeleton />
      <AnalyticsTabsSkeleton />
    </DashboardPage>
  );
}
