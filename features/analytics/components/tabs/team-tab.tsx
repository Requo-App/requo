import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getTeamData } from "@/features/analytics/queries";
import type { BusinessPlan } from "@/lib/plans";

import {
  TeamActivityCard,
  TeamBenchmarksCard,
  TeamCohortsCard,
  TeamEmptyGuard,
  TeamMembersCard,
  TeamSlaCard,
  TeamWorkloadCard,
} from "../sections/team";
import {
  AnalyticsChartCardSkeleton,
  AnalyticsListSkeleton,
  AnalyticsTableSkeleton,
} from "../states/skeletons";

/**
 * Team tab composition (Business).
 *
 * Starts the single cached `getTeamData` aggregator and passes the same promise
 * into every section, each behind its own Suspense boundary. This component
 * never awaits the promise; attribution happens in the query layer, so the
 * sections only format what they receive.
 */
export function TeamTab({
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
  const dataPromise = getTeamData({ businessId, window, plan });
  const sectionProps = { dataPromise, businessSlug, window };

  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <TeamEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsTableSkeleton rows={5} />}>
        <TeamMembersCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsListSkeleton rows={3} />}>
        <TeamWorkloadCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton bodyHeight="h-40" />}>
        <TeamSlaCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsListSkeleton rows={3} />}>
        <TeamCohortsCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsListSkeleton rows={4} />}>
        <TeamBenchmarksCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <TeamActivityCard {...sectionProps} />
      </Suspense>
    </div>
  );
}
