import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { NeedsAttentionTabs } from "@/features/businesses/components/needs-attention-tabs";
import { EmptyQueueState } from "@/features/businesses/components/empty-queue-state";
import { buildNeedsAttentionItems } from "@/features/businesses/needs-attention-items";
import { buildHomeKpiStats } from "@/features/businesses/home-content";
import { OwnerAssistantHomeWidget } from "@/features/owner-assistant/components/owner-assistant-home-widget";
import {
  getBusinessOverviewData,
  getBusinessDashboardSummaryData,
  getBusinessMoneySnapshot,
} from "@/features/businesses/queries";
import {
  getFreeAnalytics,
  getDashboardResponseTime,
  getDashboardKpiComparison,
} from "@/features/analytics/queries";
import {
  getBusinessAnalyticsPath,
} from "@/features/businesses/routes";
import { HomeKpiCards } from "@/features/businesses/components/home-kpi-cards";
import { getFollowUpOverviewForBusiness } from "@/features/follow-ups/queries";
import { DashboardTour } from "@/features/onboarding/components/dashboard-tour";
import { getCachedDashboardTourCompleted } from "@/features/onboarding/queries";
import { ActivationLaunchpad } from "@/features/onboarding/components/activation-launchpad";
import { MilestoneCelebrator } from "@/features/onboarding/components/milestone-celebrator";
import type { MilestoneKey } from "@/features/onboarding/milestones";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";

type HomePageProps = {
  params: Promise<{ businessSlug: string }>;
};

export const metadata: Metadata = createNoIndexMetadata({
  title: "Home",
  description: "Your home base for this business.",
});

export const instant = true;

/**
 * Home page — returns the structural shell synchronously.
 *
 * All dynamic reads (params, getAppShellContext, data queries) are pushed into
 * <Suspense>-wrapped child server components so the static shell is prefetchable
 * and sibling navigations paint instantly.
 */
export default function BusinessHomePage({ params }: HomePageProps) {
  return (
    <div className="home-page-container home-entrance">
      {/* Owner Assistant — centred greeting, stats, and composer */}
      <section className="home-entrance-section w-full max-w-5xl mx-auto">
        <Suspense fallback={null}>
          <OwnerAssistantWidgetRegion params={params} />
        </Suspense>
      </section>

      {/* Activation launchpad (hides itself once activation is complete) */}
      <section className="home-entrance-section w-full max-w-5xl mx-auto mt-4">
        <Suspense fallback={null}>
          <ActivationLaunchpadRegion params={params} />
        </Suspense>
      </section>

      {/* KPI row */}
      <section className="home-entrance-section w-full max-w-5xl mx-auto mt-5">
        <Suspense fallback={<KpiFallback />}>
          <KpiRegion params={params} />
        </Suspense>
      </section>

      {/* Priority queue */}
      <section className="home-entrance-section w-full max-w-5xl mx-auto mt-8 pb-24">
        <Suspense fallback={<NeedsAttentionFallback />}>
          <NeedsAttentionRegion params={params} />
        </Suspense>
      </section>


      {/* Dashboard tour */}
      <Suspense fallback={null}>
        <DashboardTourRegion params={params} />
      </Suspense>

      {/* Milestone celebrations */}
      <Suspense fallback={null}>
        <MilestoneRegion params={params} />
      </Suspense>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Suspense-wrapped async child server components
// ---------------------------------------------------------------------------

async function OwnerAssistantWidgetRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { user, businessContext } = await getAppShellContext(businessSlug);
  const businessId = businessContext.business.id;

  const [overview, followUpOverview] = await Promise.all([
    getBusinessOverviewData(businessId),
    getFollowUpOverviewForBusiness(businessId),
  ]);

  return (
    <OwnerAssistantHomeWidget
      businessSlug={businessSlug}
      counts={overview.counts}
      followUpCounts={followUpOverview.counts}
      userName={user.name}
    />
  );
}

async function ActivationLaunchpadRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);

  return (
    <ActivationLaunchpad
      businessName={businessContext.business.name}
      businessSlug={businessSlug}
      businessId={businessContext.business.id}
      publicInquiryEnabled={businessContext.business.publicInquiryEnabled}
    />
  );
}

async function KpiRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const businessId = businessContext.business.id;

  const [money, analytics, responseTime, comparison] = await Promise.all([
    getBusinessMoneySnapshot(businessId),
    getFreeAnalytics(businessId),
    getDashboardResponseTime(businessId),
    getDashboardKpiComparison(businessId),
  ]);

  const hasActivity =
    analytics.inquirySubmissions > 0 ||
    analytics.quotesSent > 0 ||
    analytics.quotesAccepted > 0;

  if (!hasActivity) {
    return null;
  }

  const stats = buildHomeKpiStats({
    money,
    analytics,
    responseTimeHours: responseTime.avgTimeToQuoteHours,
    comparison,
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Last 30 days
        </p>
        <Link
          href={getBusinessAnalyticsPath(businessSlug)}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Full analytics
          <ArrowRight className="size-3" />
        </Link>
      </div>
      <HomeKpiCards stats={stats} />
    </div>
  );
}

async function NeedsAttentionRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const businessId = businessContext.business.id;

  const [overview, followUpOverview] = await Promise.all([
    getBusinessOverviewData(businessId),
    getFollowUpOverviewForBusiness(businessId),
  ]);

  const items = buildNeedsAttentionItems({ businessSlug, overview, followUpOverview });

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between pb-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Priority queue
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Follow up, finish drafts, and confirm wins.
          </p>
        </div>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {items.length}
          </Badge>
        )}
      </div>

      {/* List or empty state */}
      {items.length > 0 ? (
        <NeedsAttentionTabs items={items} />
      ) : (
        <EmptyQueueState businessSlug={businessSlug} />
      )}
    </div>
  );
}

async function DashboardTourRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const dashboardTourCompleted = await getCachedDashboardTourCompleted(
    businessContext.membershipId,
    businessContext.business.id,
  );

  return (
    <DashboardTour
      businessId={businessContext.business.id}
      completed={dashboardTourCompleted}
    />
  );
}

async function MilestoneRegion({
  params,
}: {
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const { businessContext } = await getAppShellContext(businessSlug);
  const businessId = businessContext.business.id;

  const summary = await getBusinessDashboardSummaryData(businessId);

  const achieved: MilestoneKey[] = [];

  if (summary.totalInquiries > 0) achieved.push("first-inquiry");
  if (summary.totalQuotes > 0) achieved.push("first-quote-sent");
  if (summary.wonCount > 0) achieved.push("first-quote-accepted");

  if (achieved.length === 0) return null;

  return <MilestoneCelebrator achieved={achieved} />;
}

// ---------------------------------------------------------------------------
// Static UI components (rendered synchronously in the shell)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Skeleton fallbacks
// ---------------------------------------------------------------------------

export function KpiFallback() {
  return (
    <div className="flex flex-col gap-3">
      <Skeleton className="h-3 w-20 rounded-md" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="flex flex-col rounded-xl border border-border/60 bg-card p-2" key={i}>
            <div className="flex items-start justify-between p-2">
              <Skeleton className="size-9 rounded-xl" />
              <Skeleton className="size-4 rounded-full" />
            </div>
            <div className="flex flex-col gap-1 px-2 pt-2.5 pb-3.5">
              <Skeleton className="h-3.5 w-20 rounded-md" />
              <Skeleton className="h-7 w-24 rounded-md" />
            </div>
            <div className="mt-auto flex items-center justify-between gap-2 rounded-xl bg-muted px-2.5 py-1.5">
              <Skeleton className="h-3 w-16 rounded-md" />
              <Skeleton className="h-5 w-14 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function NeedsAttentionFallback() {
  return (
    <div className="flex flex-col gap-2">
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-1 pt-1">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="flex items-center gap-3.5 px-2 py-2.5" key={index}>
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-3 w-48 rounded-md" />
            </div>
            <Skeleton className="ml-auto h-3 w-20 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}


