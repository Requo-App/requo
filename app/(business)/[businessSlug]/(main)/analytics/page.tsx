import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";

import { DashboardPage } from "@/components/shared/dashboard-layout";
import { PageHeader } from "@/components/shared/page-header";
import { RegionErrorBoundary } from "@/components/shared/region-error-boundary";
import { AnalyticsFreshness } from "@/features/analytics/components/controls/analytics-freshness";
import { AnalyticsTabNav } from "@/features/analytics/components/controls/analytics-tab-nav";
import { AnalyticsToolbar } from "@/features/analytics/components/controls/analytics-toolbar";
import {
  AnalyticsTabLock,
  OperationsTabPreview,
  PerformanceTabPreview,
  TeamTabPreview,
} from "@/features/analytics/components/states/locked-preview";
import {
  AnalyticsContentSkeleton,
  AnalyticsToolbarSkeleton,
} from "@/features/analytics/components/states/skeletons";
import { OperationsTab } from "@/features/analytics/components/tabs/operations-tab";
import { OverviewTab } from "@/features/analytics/components/tabs/overview-tab";
import { PerformanceTab } from "@/features/analytics/components/tabs/performance-tab";
import { TeamTab } from "@/features/analytics/components/tabs/team-tab";
import {
  isAnalyticsTab,
  resolveAnalyticsWindow,
  type AnalyticsTab,
} from "@/features/analytics/lib/window";
import { getAnalyticsBusinessMeta } from "@/features/analytics/queries";
import { getBusinessHomePath } from "@/features/businesses/routes";
import type { UpgradeActionProps } from "@/features/entitlements/types";
import { getAppShellContext } from "@/lib/app-shell/context";
import { canViewBusinessAnalytics } from "@/lib/business-members";
import { hasFeatureAccess } from "@/lib/plans";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const instant = true;

export const metadata: Metadata = createNoIndexMetadata({
  title: "Analytics",
  description: "Pipeline performance analytics for this business.",
});

type AnalyticsPageProps = {
  params: Promise<{ businessSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const DAY_IN_MS = 86_400_000;

/** Repeated `?key=` params degrade to the default instead of guessing. */
function firstValue(value: string | string[] | undefined): string | null {
  return typeof value === "string" ? value : null;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Analytics page — the structural shell renders synchronously.
 *
 * Regions, outermost first:
 * 1. Header + toolbar (params, shell context, plan only — no analytics reads).
 * 2. Content: role gate, window resolution, then the active tab's sections.
 *
 * Locked tabs are decided before any data function runs, so a plan that is not
 * entitled to Performance/Operations/Team never executes those queries; it
 * gets the static demo preview instead. Content sections own their own
 * Suspense boundaries (see the tab components), so this page only needs one
 * boundary for the region as a whole.
 */
export default function AnalyticsPage({ params, searchParams }: AnalyticsPageProps) {
  return (
    <DashboardPage>
      <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-6">
        <PageHeader
          eyebrow="Analytics"
          title="Pipeline analytics"
          description="How inquiries arrive, how quotes move through the pipeline, and where follow-up and automation make a difference."
          actions={
            <Suspense fallback={<AnalyticsToolbarSkeleton />}>
              <AnalyticsToolbarRegion params={params} searchParams={searchParams} />
            </Suspense>
          }
        />

        <Suspense fallback={<AnalyticsContentSkeleton />}>
          <RegionErrorBoundary fallback={<AnalyticsErrorFallback />}>
            <AnalyticsContentRegion params={params} searchParams={searchParams} />
          </RegionErrorBoundary>
        </Suspense>
      </div>
    </DashboardPage>
  );
}

// ---------------------------------------------------------------------------
// Toolbar region — params, plan, and business meta only
// ---------------------------------------------------------------------------

async function AnalyticsToolbarRegion({ params, searchParams }: AnalyticsPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { user, businessContext } = await getAppShellContext(businessSlug);
  const { business } = businessContext;
  const meta = await getAnalyticsBusinessMeta(business.id);

  const plan = meta.plan;
  const from = firstValue(resolvedSearchParams.from);
  const to = firstValue(resolvedSearchParams.to);
  const window = resolveAnalyticsWindow({
    plan,
    range: firstValue(resolvedSearchParams.range),
    from,
    to,
    compare: firstValue(resolvedSearchParams.compare),
    earliest: meta.createdAt,
  });

  const hasPerformance = hasFeatureAccess(plan, "analyticsPerformance");

  return (
    <AnalyticsToolbar
      plan={plan}
      range={window.preset}
      from={from}
      to={to}
      compare={window.comparison !== null}
      label={window.label}
      canCompare={hasPerformance}
      canExport={hasPerformance}
      canExportDaily={hasFeatureAccess(plan, "analyticsTeam")}
      canManageReports={hasPerformance}
      reportRecipientLimit={
        hasFeatureAccess(plan, "analyticsTeam") ? 5 : 1
      }
      businessSlug={business.slug}
      exportSince={toIsoDate(window.since)}
      exportUntil={toIsoDate(new Date(window.until.getTime() - DAY_IN_MS))}
      upgradeAction={{
        userId: user.id,
        businessId: business.id,
        businessSlug: business.slug,
        currentPlan: plan,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Content region — role gate, window resolution, active tab
// ---------------------------------------------------------------------------

async function AnalyticsContentRegion({ params, searchParams }: AnalyticsPageProps) {
  const [{ businessSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const { user, businessContext } = await getAppShellContext(businessSlug);

  if (!canViewBusinessAnalytics(businessContext.role)) {
    redirect(getBusinessHomePath(businessContext.business.slug));
  }

  const { business } = businessContext;
  const meta = await getAnalyticsBusinessMeta(business.id);
  const plan = meta.plan;

  const tabParam = firstValue(resolvedSearchParams.tab);
  const tab: AnalyticsTab = isAnalyticsTab(tabParam) ? tabParam : "overview";
  const compare = firstValue(resolvedSearchParams.compare);
  const window = resolveAnalyticsWindow({
    plan,
    range: firstValue(resolvedSearchParams.range),
    from: firstValue(resolvedSearchParams.from),
    to: firstValue(resolvedSearchParams.to),
    compare,
    earliest: meta.createdAt,
  });

  const hasPerformance = hasFeatureAccess(plan, "analyticsPerformance");
  const hasOperations = hasFeatureAccess(plan, "analyticsOperations");
  const hasTeam = hasFeatureAccess(plan, "analyticsTeam");

  const lockedTabs: AnalyticsTab[] = [];
  if (!hasPerformance) lockedTabs.push("performance");
  if (!hasOperations) lockedTabs.push("operations");
  if (!hasTeam) lockedTabs.push("team");

  const upgradeAction: UpgradeActionProps = {
    userId: user.id,
    businessId: business.id,
    businessSlug: business.slug,
    currentPlan: plan,
  };

  const tabProps = {
    businessId: business.id,
    businessSlug: business.slug,
    window,
    plan,
  };

  let content: ReactNode;
  if (tab === "performance") {
    content = hasPerformance ? (
      <PerformanceTab {...tabProps} />
    ) : (
      <AnalyticsTabLock
        feature="analyticsPerformance"
        plan={plan}
        upgradeAction={upgradeAction}
        description="See where inquiries come from, how services and quotes perform, and where revenue leaks."
        preview={<PerformanceTabPreview />}
      />
    );
  } else if (tab === "operations") {
    content = hasOperations ? (
      <OperationsTab {...tabProps} />
    ) : (
      <AnalyticsTabLock
        feature="analyticsOperations"
        plan={plan}
        upgradeAction={upgradeAction}
        description="Track follow-up effectiveness, automated sequences, the public assistant, and workflow packs."
        preview={<OperationsTabPreview />}
      />
    );
  } else if (tab === "team") {
    content = hasTeam ? (
      <TeamTab {...tabProps} />
    ) : (
      <AnalyticsTabLock
        feature="analyticsTeam"
        plan={plan}
        upgradeAction={upgradeAction}
        description="Compare members, response-time SLA, inquiry cohorts, and size-tier benchmarks."
        preview={<TeamTabPreview />}
      />
    );
  } else {
    content = <OverviewTab {...tabProps} upgradeAction={upgradeAction} />;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <AnalyticsTabNav
          businessSlug={business.slug}
          activeTab={tab}
          lockedTabs={lockedTabs}
          range={window.preset}
          from={window.preset === "custom" ? firstValue(resolvedSearchParams.from) : null}
          to={window.preset === "custom" ? firstValue(resolvedSearchParams.to) : null}
          compare={compare}
        />
        <AnalyticsFreshness updatedAt={new Date().getTime()} />
      </div>

      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error fallback
// ---------------------------------------------------------------------------

function AnalyticsErrorFallback() {
  return (
    <div className="analytics-card px-4 py-10 text-center text-sm text-muted-foreground sm:px-5">
      Could not load analytics right now. Refresh the page to try again.
    </div>
  );
}
