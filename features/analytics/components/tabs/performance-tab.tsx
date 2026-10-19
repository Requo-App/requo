import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getPerformanceData } from "@/features/analytics/queries";
import type { BusinessPlan } from "@/lib/plans";

import {
  PerformanceAcquisitionCard,
  PerformanceAgingCard,
  PerformanceBenchmarksCard,
  PerformanceCollectionsCard,
  PerformanceCustomersCard,
  PerformanceDealValueCard,
  PerformanceEmptyGuard,
  PerformanceQuoteFunnelCard,
  PerformanceReceivablesCard,
  PerformanceReportsCard,
  PerformanceRevenueCard,
  PerformanceServicesCard,
  PerformanceSourcesCard,
  PerformanceTimingCard,
  PerformanceWinRatesCard,
} from "../sections/performance";
import {
  AnalyticsChartCardSkeleton,
  AnalyticsListSkeleton,
  AnalyticsTableSkeleton,
} from "../states/skeletons";

/**
 * Performance tab composition (Pro).
 *
 * Starts the single cached `getPerformanceData` aggregator and passes the same
 * promise into every section, each behind its own Suspense boundary. This
 * component never awaits the promise — the shared query starts on the first
 * section render and every later boundary resolves from the same request.
 */
export function PerformanceTab({
  businessId,
  businessSlug,
  window,
  plan,
}: {
  businessId: string;
  businessSlug: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}) {
  const dataPromise = getPerformanceData({ businessId, businessSlug, window, plan });
  const sectionProps = { dataPromise, businessSlug, window };

  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <PerformanceEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <PerformanceAcquisitionCard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <AnalyticsListSkeleton rows={4} />
            <AnalyticsListSkeleton rows={4} />
          </div>
        }
      >
        <PerformanceSourcesCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsTableSkeleton rows={6} />}>
        <PerformanceServicesCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton bodyHeight="h-32" />}>
        <PerformanceTimingCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <PerformanceQuoteFunnelCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <PerformanceAgingCard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <AnalyticsListSkeleton rows={3} />
            <AnalyticsListSkeleton rows={3} />
          </div>
        }
      >
        <PerformanceDealValueCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <PerformanceWinRatesCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <PerformanceRevenueCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <PerformanceReceivablesCard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <AnalyticsListSkeleton rows={3} />
            <AnalyticsListSkeleton rows={3} />
          </div>
        }
      >
        <PerformanceCollectionsCard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2">
            <AnalyticsListSkeleton rows={3} />
            <AnalyticsListSkeleton rows={3} />
          </div>
        }
      >
        <PerformanceCustomersCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsListSkeleton rows={4} />}>
        <PerformanceBenchmarksCard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <AnalyticsListSkeleton rows={3} />
            <AnalyticsListSkeleton rows={3} />
            <AnalyticsListSkeleton rows={3} />
          </div>
        }
      >
        <PerformanceReportsCard {...sectionProps} />
      </Suspense>
    </div>
  );
}
