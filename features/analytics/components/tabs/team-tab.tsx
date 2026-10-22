import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getTeamData } from "@/features/analytics/queries";
import type { PlanTier } from "@/lib/plans";

import { AnalyticsSectionGate } from "../primitives/analytics-section";
import {
  TeamBenchmarksRow,
  TeamCohortRow,
  TeamEmptyGuard,
  TeamMembersCard,
  TeamWorkloadRow,
} from "../sections/team";
import {
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
  plan: PlanTier;
}) {
  const dataPromise = getTeamData({ businessId, window, plan });
  const sectionProps = { dataPromise, businessSlug, window };
  const hasActivity = (data: Awaited<typeof dataPromise>) =>
    data.members.length > 0 ||
    data.workload.openInquiries > 0 ||
    data.sla.byMember.length > 0 ||
    data.cohorts.some((cohort) => cohort.size > 0);

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <TeamEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <div className="flex flex-col gap-4">
            <AnalyticsTableSkeleton rows={5} />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
              <AnalyticsListSkeleton className="md:col-span-6" />
              <AnalyticsListSkeleton className="md:col-span-6" />
            </div>
          </div>
        }
      >
        <AnalyticsSectionGate
          title="Team"
          waitFor={dataPromise}
          when={hasActivity}
        >
          <TeamMembersCard {...sectionProps} />
          <TeamWorkloadRow {...sectionProps} />
          <TeamCohortRow {...sectionProps} />
          <TeamBenchmarksRow {...sectionProps} />
        </AnalyticsSectionGate>
      </Suspense>
    </div>
  );
}
