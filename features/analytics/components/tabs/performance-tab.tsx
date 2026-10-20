import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getPerformanceData } from "@/features/analytics/queries";
import type { BusinessPlan } from "@/lib/plans";

import {
  AnalyticsRow,
  AnalyticsSectionGate,
} from "../primitives/analytics-section";
import {
  PerformanceAudienceRow,
  PerformanceBenchmarksRow,
  PerformanceCollectionsRow,
  PerformanceEmptyGuard,
  PerformanceFunnelRow,
  PerformanceLiveRow,
  PerformanceReportsRow,
  PerformanceServicesRow,
  PerformanceTimingRow,
} from "../sections/performance";
import {
  AnalyticsBarsSkeleton,
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
 *
 * Three blocks: Performance (the period), Audience (who is converting), and
 * the live snapshot. Every row is a symmetric split.
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
  const hasData = (data: Awaited<typeof dataPromise>) => data.hasData;

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <PerformanceEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <AnalyticsRow>
              <AnalyticsChartCardSkeleton className="md:col-span-6" />
              <AnalyticsListSkeleton className="md:col-span-6" />
            </AnalyticsRow>
            <AnalyticsTableSkeleton rows={6} />
          </div>
        }
      >
        <AnalyticsSectionGate
          title="Performance"
          waitFor={dataPromise}
          when={hasData}
        >
          <PerformanceFunnelRow {...sectionProps} />
          <PerformanceServicesRow {...sectionProps} />
          <PerformanceTimingRow {...sectionProps} />
          <PerformanceCollectionsRow {...sectionProps} />
          <PerformanceBenchmarksRow {...sectionProps} />
          <PerformanceReportsRow {...sectionProps} />
        </AnalyticsSectionGate>
      </Suspense>

      <Suspense
        fallback={
          <AnalyticsRow>
            <AnalyticsBarsSkeleton className="md:col-span-4" />
            <AnalyticsListSkeleton className="md:col-span-4" />
            <AnalyticsBarsSkeleton className="md:col-span-4" />
          </AnalyticsRow>
        }
      >
        <AnalyticsSectionGate
          title="Audience"
          waitFor={dataPromise}
          when={hasData}
        >
          <PerformanceAudienceRow {...sectionProps} />
        </AnalyticsSectionGate>
      </Suspense>

      <Suspense
        fallback={
          <AnalyticsRow>
            <AnalyticsBarsSkeleton className="md:col-span-6" />
            <AnalyticsBarsSkeleton className="md:col-span-6" />
          </AnalyticsRow>
        }
      >
        <AnalyticsSectionGate
          waitFor={dataPromise}
          when={hasData}
        >
          <PerformanceLiveRow {...sectionProps} />
        </AnalyticsSectionGate>
      </Suspense>
    </div>
  );
}
