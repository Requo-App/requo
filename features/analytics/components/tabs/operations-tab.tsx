import { Suspense } from "react";

import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import { getOperationsData } from "@/features/analytics/queries";
import type { BusinessPlan } from "@/lib/plans";

import {
  AnalyticsRow,
  AnalyticsSectionGate,
} from "../primitives/analytics-section";
import {
  OperationsAssistantRow,
  OperationsAutomationRow,
  OperationsDeliveryRow,
  OperationsEmptyGuard,
  OperationsFollowUpRow,
} from "../sections/operations";
import {
  AnalyticsChartCardSkeleton,
  AnalyticsListSkeleton,
} from "../states/skeletons";

/**
 * Operations tab composition (Pro).
 *
 * Starts the single cached `getOperationsData` aggregator and passes the same
 * promise into every section, each behind its own Suspense boundary. This
 * component never awaits the promise; sections that have nothing to show hide
 * themselves, so a quiet range still streams a short page.
 *
 * Two sections, each a stack of symmetric six-column rows.
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
  const hasData = (data: Awaited<typeof dataPromise>) => data.hasData;

  return (
    <div className="flex flex-col gap-8">
      <Suspense fallback={null}>
        <OperationsEmptyGuard {...sectionProps} />
      </Suspense>

      <Suspense
        fallback={
          <AnalyticsRow>
            <AnalyticsListSkeleton className="md:col-span-6" />
            <AnalyticsChartCardSkeleton className="md:col-span-6" />
          </AnalyticsRow>
        }
      >
        <AnalyticsSectionGate
          title="Follow-up"
          waitFor={dataPromise}
          when={hasData}
        >
          <OperationsFollowUpRow {...sectionProps} />
          <OperationsAutomationRow {...sectionProps} />
        </AnalyticsSectionGate>
      </Suspense>

      <Suspense
        fallback={
          <AnalyticsRow>
            <AnalyticsListSkeleton className="md:col-span-6" />
            <AnalyticsListSkeleton className="md:col-span-6" />
          </AnalyticsRow>
        }
      >
        <AnalyticsSectionGate
          title="Assistant"
          waitFor={dataPromise}
          when={hasData}
        >
          <OperationsAssistantRow {...sectionProps} />
          <OperationsDeliveryRow {...sectionProps} />
        </AnalyticsSectionGate>
      </Suspense>
    </div>
  );
}
