import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import {
  AnalyticsContentSkeleton,
  AnalyticsToolbarSkeleton,
} from "@/features/analytics/components/states/skeletons";

/**
 * Structural loading state for analytics.
 *
 * Mirrors `analytics/page.tsx`: the same shared fallbacks the page's Suspense
 * boundaries use, the same header copy, and the same order — toolbar, tab bar,
 * then the default Overview tab. Route loading cannot read `searchParams`, so
 * the skeleton always shows Overview; the resolved page swaps in the selected
 * tab without changing the surrounding layout.
 */
export default function AnalyticsLoading() {
  return (
    <DashboardPage>
      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-6">
        <PageHeader
          eyebrow="Analytics"
          title="Pipeline analytics"
          description="How inquiries arrive, how quotes move through the pipeline, and where follow-up and automation make a difference."
          actions={<AnalyticsToolbarSkeleton />}
        />
        <AnalyticsContentSkeleton />
      </div>
    </DashboardPage>
  );
}
