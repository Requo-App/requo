import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getOverviewData } from "@/features/analytics/queries";
import type { UpgradeActionProps } from "@/features/paywall/types";
import type { BusinessPlan } from "@/lib/plans";

import {
  AnalyticsRow,
  AnalyticsSection,
  AnalyticsSectionGate,
} from "../primitives/analytics-section";
import {
  OverviewEmptyGuard,
  OverviewFunnelCard,
  OverviewKpiSection,
  OverviewLiveCards,
  OverviewOutcomesCard,
  OverviewTrendCards,
  OverviewUsageCard,
  hasWindowActivity,
} from "../sections/overview";
import {
  AnalyticsChartCardSkeleton,
  AnalyticsKpiRowSkeleton,
  AnalyticsListSkeleton,
} from "../states/skeletons";

/**
 * Overview tab composition.
 *
 * Starts the single cached `getOverviewData` aggregator and passes the same
 * promise into every section, each behind its own Suspense boundary. This
 * component never awaits the promise — that is what keeps the boundaries
 * alive and lets the first card paint as soon as the shared query resolves.
 *
 * Two sections: Overview (the period) and Live (the snapshot). Every row is a
 * symmetric split, so no card is stretched to match a neighbour.
 */
export function OverviewTab({
  businessId,
  businessSlug,
  window,
  plan,
  upgradeAction,
}: {
  businessId: string;
  businessSlug: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
  upgradeAction: UpgradeActionProps;
}) {
  const dataPromise = getOverviewData({ businessId, businessSlug, window });
  const sectionProps = { dataPromise, businessSlug, window, plan, upgradeAction };

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <OverviewEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <AnalyticsKpiRowSkeleton />
            <AnalyticsRow>
              <AnalyticsChartCardSkeleton className="md:col-span-6" />
              <AnalyticsChartCardSkeleton className="md:col-span-6" />
            </AnalyticsRow>
            <AnalyticsRow>
              <AnalyticsChartCardSkeleton className="md:col-span-6" />
              <AnalyticsChartCardSkeleton className="md:col-span-6" />
            </AnalyticsRow>
          </div>
        }
      >
        <AnalyticsSectionGate
          title="Overview"
          waitFor={dataPromise}
          when={hasWindowActivity}
        >
          <OverviewKpiSection {...sectionProps} />
          <OverviewTrendCards {...sectionProps} />
          <AnalyticsRow>
            <OverviewFunnelCard {...sectionProps} />
            <OverviewOutcomesCard {...sectionProps} />
          </AnalyticsRow>
        </AnalyticsSectionGate>
      </Suspense>

      <AnalyticsSection title="Live" live>
        <Suspense
          fallback={
            <AnalyticsRow>
              <AnalyticsListSkeleton className="md:col-span-6" />
              <AnalyticsListSkeleton className="md:col-span-6" />
            </AnalyticsRow>
          }
        >
          <OverviewLiveCards {...sectionProps} />
        </Suspense>

        <Suspense fallback={<AnalyticsListSkeleton rows={1} />}>
          <OverviewUsageCard {...sectionProps} />
        </Suspense>
      </AnalyticsSection>
    </div>
  );
}
