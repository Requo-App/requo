import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { Skeleton } from "@/components/ui/skeleton";
import { AdvancedAnalyticsView } from "@/features/analytics/components/advanced-analytics-view";
import { AnalyticsTabsShell } from "@/features/analytics/components/analytics-tabs-shell";
import { BasicAnalyticsView } from "@/features/analytics/components/basic-analytics-view";
import { DateRangeSelector } from "@/features/analytics/components/date-range-selector";
import { LastUpdatedTimestamp } from "@/features/analytics/components/last-updated-timestamp";
import { generateAnalyticsSummary } from "@/features/analytics/ai-summary";
import {
  getBasicSparklineData,
  getBusinessAnalytics,
  getDashboardKpiComparison,
  getFreeAnalytics,
  getProAnalytics,
  getRevenueForecast,
  getTopSources,
} from "@/features/analytics/queries";
import { formatMoney, formatRelativeDelta, resolveDateRangeFromParams } from "@/features/analytics/utils";
import { getInvoiceOverviewForBusiness } from "@/features/invoices/queries";
import { getBusinessHomePath } from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";
import { canViewBusinessAnalytics } from "@/lib/business-members";
import { hasFeatureAccess } from "@/lib/plans";
import { createNoIndexMetadata } from "@/lib/seo/site";
import { FirstVisitTip } from "@/features/onboarding/components/first-visit-tip";
import { featureTips } from "@/features/onboarding/feature-tips";
import { PremiumContentBlur } from "@/features/paywall";

export const instant = true;

type AnalyticsPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};


/**
 * Analytics page — returns the structural shell synchronously.
 *
 * Progressive regions (outermost first):
 * 1. Header + date-range controls (searchParams only — no database reads).
 * 2. Tabs shell (auth + role + plan — fast, no analytics queries).
 * 3. Core metrics (free analytics + sparklines).
 * 4. Advanced charts + AI summary (plan-gated queries; the LLM summary
 *    streams in place behind its own boundary so it never holds back
 *    the charts).
 *
 * Each region has its own Suspense fallback and selective error isolation,
 * so one slow or failed query never blocks the rest of the page. Plan
 * gating and tenant scoping stay server-side inside each region.
 */
export default function AnalyticsPage({ params, searchParams }: AnalyticsPageProps) {
  return (
    <DashboardPage className="bg-surface-default">
      <Suspense fallback={<AnalyticsHeaderSkeleton />}>
        <AnalyticsHeaderRegion searchParams={searchParams} />
      </Suspense>

      <FirstVisitTip {...featureTips.analytics} className="mb-4" />

      <Suspense fallback={<AnalyticsTabsSkeleton />}>
        <RegionErrorBoundary fallback={<AnalyticsErrorFallback />}>
          <AnalyticsTabsRegion params={params} searchParams={searchParams} />
        </RegionErrorBoundary>
      </Suspense>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Header region — searchParams only, no database reads
// ---------------------------------------------------------------------------

async function AnalyticsHeaderRegion({
  searchParams,
}: Pick<AnalyticsPageProps, "searchParams">) {
  const resolvedSearchParams = await searchParams;
  const { preset, customSince, customUntil } =
    resolveDateRangeFromParams(resolvedSearchParams);

  return (
    <PageHeader
      title="Analytics"
      actions={
        <DateRangeSelector
          currentPreset={preset}
          customSince={customSince}
          customUntil={customUntil}
        />
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Tabs region — auth, role gate, and plan only (no analytics queries)
// ---------------------------------------------------------------------------

async function AnalyticsTabsRegion({ params, searchParams }: AnalyticsPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { user, businessContext } = await getAppShellContext(businessSlug);

  if (!canViewBusinessAnalytics(businessContext.role)) {
    redirect(getBusinessHomePath(businessContext.business.slug));
  }

  const { business } = businessContext;
  const businessId = business.id;
  const plan = business.plan;

  const hasPerformance = hasFeatureAccess(plan, "analyticsConversion");
  const hasOperations = hasFeatureAccess(plan, "analyticsWorkflow");
  const canViewAdvanced = hasPerformance || hasOperations;

  const { since, until } = resolveDateRangeFromParams(resolvedSearchParams);

  const upgradeAction = {
    userId: user.id,
    businessId,
    businessSlug: business.slug,
    currentPlan: plan,
  } as const;

  return (
    <>
      <LastUpdatedTimestamp lastUpdatedAt={new Date()} />

      <AnalyticsTabsShell
        basicContent={
          <Suspense fallback={<CoreAnalyticsSkeleton />}>
            <RegionErrorBoundary fallback={<AnalyticsErrorFallback />}>
              <CoreAnalyticsRegion
                businessId={businessId}
                businessSlug={business.slug}
                currency={business.defaultCurrency}
                plan={plan}
                since={since}
                until={until}
                hasPerformance={hasPerformance}
                hasOperations={hasOperations}
                upgradeAction={{ ...upgradeAction }}
              />
            </RegionErrorBoundary>
          </Suspense>
        }
        advancedContent={
          <Suspense fallback={<AdvancedAnalyticsSkeleton />}>
            <RegionErrorBoundary fallback={<AnalyticsErrorFallback />}>
              <AdvancedAnalyticsRegion
                businessId={businessId}
                businessSlug={business.slug}
                currency={business.defaultCurrency}
                plan={plan}
                since={since}
                until={until}
                hasPerformance={hasPerformance}
                hasOperations={hasOperations}
                upgradeAction={{ ...upgradeAction }}
              />
            </RegionErrorBoundary>
          </Suspense>
        }
        defaultTab={canViewAdvanced ? "advanced" : "basic"}
        canAccessAdvanced={canViewAdvanced}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Core region — free analytics + sparklines (fast, ungated)
// ---------------------------------------------------------------------------

async function CoreAnalyticsRegion({
  businessId,
  businessSlug,
  currency,
  plan,
  since,
  until,
  hasPerformance,
  hasOperations,
  upgradeAction,
}: {
  businessId: string;
  businessSlug: string;
  currency: string;
  plan: Parameters<typeof hasFeatureAccess>[0];
  since: Date;
  until: Date;
  hasPerformance: boolean;
  hasOperations: boolean;
  upgradeAction: {
    userId: string;
    businessId: string;
    businessSlug: string;
    currentPlan: Parameters<typeof hasFeatureAccess>[0];
  };
}) {
  // Gated queries only run when the plan entitles them; free users get the
  // free pipeline plus locked placeholders (no premium data in the DOM).
  // The revenue comparison covers a fixed 30-day window, so its delta only
  // applies when the selected range matches it. Invoice balances are core
  // product data and load for every plan.
  const rangeDays = Math.round((until.getTime() - since.getTime()) / (1000 * 60 * 60 * 24));
  const [freeData, sparklineData, proData, businessData, invoiceOverviewData, kpiComparison] =
    await Promise.all([
      getFreeAnalytics(businessId, since, until),
      getBasicSparklineData(businessId, since, until),
      hasPerformance ? getProAnalytics(businessId, since, until) : Promise.resolve(null),
      hasOperations ? getBusinessAnalytics(businessId, since, until) : Promise.resolve(null),
      getInvoiceOverviewForBusiness({ businessId }).catch(() => null),
      hasOperations && rangeDays >= 28 && rangeDays <= 32
        ? getDashboardKpiComparison(businessId)
        : Promise.resolve(null),
    ]);

  const revenueDelta =
    businessData && kpiComparison
      ? formatRelativeDelta(
          businessData.revenue.acceptedValueInCents,
          kpiComparison.wonInCentsPrior,
          (v) => formatMoney(v, currency),
        )
      : null;

  return (
    <BasicAnalyticsView
      data={freeData}
      sparklines={sparklineData}
      businessSlug={businessSlug}
      since={since}
      until={until}
      currency={currency}
      plan={plan}
      hasPerformance={hasPerformance}
      hasOperations={hasOperations}
      pro={proData}
      revenue={businessData?.revenue ?? null}
      revenueDelta={revenueDelta}
      invoiceOverview={invoiceOverviewData}
      upgradeAction={upgradeAction}
    />
  );
}

// ---------------------------------------------------------------------------
// Advanced region — plan-gated queries; AI summary streams in place
// ---------------------------------------------------------------------------

async function AdvancedAnalyticsRegion({
  businessId,
  businessSlug,
  currency,
  plan,
  since,
  until,
  hasPerformance,
  hasOperations,
  upgradeAction,
}: {
  businessId: string;
  businessSlug: string;
  currency: string;
  plan: Parameters<typeof hasFeatureAccess>[0];
  since: Date;
  until: Date;
  hasPerformance: boolean;
  hasOperations: boolean;
  upgradeAction: {
    userId: string;
    businessId: string;
    businessSlug: string;
    currentPlan: Parameters<typeof hasFeatureAccess>[0];
  };
}) {
  // Plan gate stays server-side: free users see the upgrade surface, and no
  // restricted query runs for them.
  if (!hasPerformance && !hasOperations) {
    return (
      <PremiumContentBlur
        feature="analyticsConversion"
        plan={plan}
        upgradeAction={upgradeAction}
      >
        <div />
      </PremiumContentBlur>
    );
  }

  const [freeData, proData, businessData, topSourcesData, revenueForecastData] =
    await Promise.all([
      getFreeAnalytics(businessId, since, until),
      hasPerformance ? getProAnalytics(businessId, since, until) : Promise.resolve(null),
      hasOperations ? getBusinessAnalytics(businessId, since, until) : Promise.resolve(null),
      hasPerformance ? getTopSources(businessId, since, until) : Promise.resolve(null),
      hasOperations ? getRevenueForecast(businessId) : Promise.resolve(null),
    ]);

  // Kick off the LLM summary without awaiting it: the charts paint first and
  // the insight card streams in place via `aiSummaryPromise`.
  const aiSummaryPromise =
    hasOperations && freeData
      ? generateAnalyticsSummary(freeData, businessData, proData?.priorPeriod)
      : Promise.resolve(null);

  return (
    <AdvancedAnalyticsView
      plan={plan}
      businessId={businessId}
      businessSlug={businessSlug}
      currency={currency}
      data={{ free: freeData, pro: proData, business: businessData }}
      aiSummaryPromise={aiSummaryPromise}
      revenueForecast={revenueForecastData}
      topSources={topSourcesData}
      upgradeAction={upgradeAction}
    />
  );
}

// ---------------------------------------------------------------------------
// Skeletons and error fallback (reuse existing visual language)
// ---------------------------------------------------------------------------

export function AnalyticsHeaderSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-44 rounded-lg" />
      </div>
      <div className="flex items-center gap-1">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-14 rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export function AnalyticsTabsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg bg-surface-muted p-1">
        <Skeleton className="h-9 w-48 rounded-lg" />
      </div>
      <CoreAnalyticsSkeleton />
    </div>
  );
}

export function CoreAnalyticsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 sm:gap-5">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="h-4 w-72 rounded-md" />
      </div>
      {/* Hero KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex min-h-28 flex-col gap-2.5 rounded-xl border border-border/60 bg-muted/40 p-4"
          >
            <Skeleton className="size-7 rounded-lg" />
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className="h-6 w-20 rounded-md" />
          </div>
        ))}
      </div>
      {/* Funnel + outcomes cards */}
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-xl" />
        <Skeleton className="h-56 w-full rounded-xl" />
      </div>
      {/* Trend card */}
      <Skeleton className="h-72 w-full rounded-xl" />
      {/* Money-in card */}
      <Skeleton className="h-36 w-full rounded-xl" />
    </div>
  );
}

export function AdvancedAnalyticsSkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[280px] rounded-xl" />
      </div>
    </div>
  );
}

function AnalyticsErrorFallback() {
  return (
    <div className="rounded-xl bg-surface-muted p-6 text-center text-sm text-muted-foreground">
      Unable to load analytics data. Please try again later.
    </div>
  );
}

export const metadata: Metadata = createNoIndexMetadata({
  title: "Analytics",
  description: "Pipeline performance analytics for this business.",
});
