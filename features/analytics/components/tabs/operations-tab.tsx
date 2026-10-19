import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getOperationsData } from "@/features/analytics/queries";
import type { BusinessPlan } from "@/lib/plans";

import {
  OperationsAgentCard,
  OperationsAiImpactCard,
  OperationsAutomationCard,
  OperationsEffectivenessCard,
  OperationsEmailCard,
  OperationsEmptyGuard,
  OperationsFollowUpHealthCard,
  OperationsKnowledgeCard,
  OperationsVerticalsCard,
} from "../sections/operations";
import {
  AnalyticsChartCardSkeleton,
  AnalyticsKpiRowSkeleton,
  AnalyticsListSkeleton,
} from "../states/skeletons";

/**
 * Operations tab composition (Pro).
 *
 * Starts the single cached `getOperationsData` aggregator and passes the same
 * promise into every section, each behind its own Suspense boundary. This
 * component never awaits the promise; sections that have nothing to show hide
 * themselves, so a quiet range still streams a short page.
 */
export function OperationsTab({
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
  const dataPromise = getOperationsData({ businessId, window, plan });
  const sectionProps = { dataPromise, businessSlug, window };

  return (
    <div className="flex flex-col gap-4">
      <Suspense fallback={null}>
        <OperationsEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsListSkeleton rows={3} />}>
        <OperationsFollowUpHealthCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <OperationsEffectivenessCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <OperationsAutomationCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <OperationsAiImpactCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <OperationsAgentCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton />}>
        <OperationsKnowledgeCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsChartCardSkeleton bodyHeight="h-24" />}>
        <OperationsEmailCard {...sectionProps} />
      </Suspense>

      <Suspense fallback={<AnalyticsKpiRowSkeleton />}>
        <OperationsVerticalsCard {...sectionProps} />
      </Suspense>
    </div>
  );
}
