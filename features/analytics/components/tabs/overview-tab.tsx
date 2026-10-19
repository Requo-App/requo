import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getOverviewData } from "@/features/analytics/queries";
import type { UpgradeActionProps } from "@/features/paywall/types";
import type { BusinessPlan } from "@/lib/plans";

import {
  OverviewAttentionCard,
  OverviewEmptyGuard,
  OverviewFunnelCard,
  OverviewKpiSection,
  OverviewMoneyCard,
  OverviewOutcomesCard,
  OverviewTrendCard,
  OverviewUsageCard,
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
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <OverviewEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsKpiRowSkeleton />}>
        <OverviewKpiSection {...sectionProps} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<AnalyticsChartCardSkeleton />}>
          <OverviewFunnelCard {...sectionProps} />
        </Suspense>
        <Suspense fallback={<AnalyticsChartCardSkeleton />}>
          <OverviewOutcomesCard {...sectionProps} />
        </Suspense>
      </div>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <OverviewTrendCard {...sectionProps} />
      </Suspense>

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<AnalyticsListSkeleton rows={2} />}>
          <OverviewMoneyCard {...sectionProps} />
        </Suspense>
        <Suspense fallback={<AnalyticsListSkeleton />}>
          <OverviewAttentionCard {...sectionProps} />
        </Suspense>
      </div>

      <Suspense fallback={<AnalyticsListSkeleton rows={3} />}>
        <OverviewUsageCard {...sectionProps} />
      </Suspense>
    </div>
  );
}
