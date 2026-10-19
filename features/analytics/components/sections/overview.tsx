import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  Inbox,
  Send,
  Target,
} from "lucide-react";

import { DashboardSection } from "@/components/shared/dashboard-layout";
import { Button } from "@/components/ui/button";
import { FeatureGate } from "@/features/paywall";
import type { UpgradeActionProps } from "@/features/paywall/types";
import { chartSeries } from "@/features/analytics/lib/chart-theme";
import {
  formatMoney,
  formatNumber,
  formatPercent,
  formatPointsDelta,
  formatRelativeDelta,
  getDeltaSentiment,
} from "@/features/analytics/lib/format";
import { getInvoicesListHref } from "@/features/analytics/lib/links";
import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import type { OverviewData } from "@/features/analytics/types";
import type { BusinessPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";

import { AnalyticsChartCard, ChartDataTable } from "../chart-card";
import { FunnelBars } from "../charts/funnel-bars";
import {
  LazyQuoteOutcomesDonut,
  LazyTrendAreaChart,
} from "../charts/lazy-charts";
import {
  AnalyticsKpiRow,
  type AnalyticsKpiStat,
} from "../kpi/analytics-kpi-card";
import { AttentionList } from "../lists/attention-list";
import { UsageMeter } from "../meters/usage-meter";
import { AnalyticsFirstRunEmpty, AnalyticsRangeEmpty } from "../states/analytics-empty";

export type OverviewSectionProps = {
  dataPromise: Promise<OverviewData>;
  businessSlug: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
  upgradeAction: UpgradeActionProps;
};

/** Window-level activity gate: the quiet-state copy differs from first-run. */
export function hasWindowActivity(data: OverviewData): boolean {
  const { current } = data;
  return (
    current.visitors > 0 ||
    current.inquiries > 0 ||
    current.quotesSent > 0 ||
    current.invoicedInCents > 0
  );
}

/**
 * Quiet-state guard: first-run and empty-window states render once at the top
 * instead of every card repeating "no data".
 */
export async function OverviewEmptyGuard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasAnyActivity) {
    return <AnalyticsFirstRunEmpty businessSlug={props.businessSlug} />;
  }
  if (!hasWindowActivity(data)) {
    return <AnalyticsRangeEmpty />;
  }
  return null;
}

function buildKpiStats(
  data: OverviewData,
  window: AnalyticsWindow,
  businessSlug: string,
): AnalyticsKpiStat[] {
  const { current, prior, series, currency } = data;
  const compare = prior !== null;
  const caption = compare ? "vs previous period" : window.label;

  const inquiriesDelta = compare
    ? formatRelativeDelta(current.inquiries, prior.inquiries, (value) =>
        `${formatNumber(value)}`,
      )
    : null;
  const quotesDelta = compare
    ? formatRelativeDelta(current.quotesSent, prior.quotesSent, (value) =>
        `${formatNumber(value)}`,
      )
    : null;
  const winRateDelta = compare ? formatPointsDelta(current.winRate, prior.winRate) : null;
  const revenueDelta = compare
    ? formatRelativeDelta(current.revenueWonInCents, prior.revenueWonInCents, (value) =>
        formatMoney(value, currency),
      )
    : null;

  return [
    {
      key: "inquiries",
      label: "Inquiries",
      value: formatNumber(current.inquiries),
      icon: Inbox,
      href: `/${businessSlug}/inquiries`,
      caption,
      hint: "Customer requests submitted through your service page in the selected period.",
      delta: inquiriesDelta?.label,
      deltaDirection: inquiriesDelta?.direction,
      deltaSentiment: inquiriesDelta
        ? getDeltaSentiment(inquiriesDelta.direction)
        : undefined,
      sparkline: series.map((point) => point.inquiries),
      sparklineLabel: "Inquiries per bucket",
    },
    {
      key: "quotes-sent",
      label: "Quotes sent",
      value: formatNumber(current.quotesSent),
      icon: Send,
      href: `/${businessSlug}/quotes?status=sent`,
      caption,
      hint: "Quotes marked as sent during the selected period.",
      delta: quotesDelta?.label,
      deltaDirection: quotesDelta?.direction,
      deltaSentiment: quotesDelta ? getDeltaSentiment(quotesDelta.direction) : undefined,
      sparkline: series.map((point) => point.quotesSent),
      sparklineLabel: "Quotes sent per bucket",
    },
    {
      key: "win-rate",
      label: "Win rate",
      value: formatPercent(current.winRate),
      icon: Target,
      caption,
      hint: "Accepted quotes ÷ decided quotes (accepted + rejected + expired) sent in the period.",
      delta: winRateDelta?.label,
      deltaDirection: winRateDelta?.direction,
      deltaSentiment: winRateDelta
        ? getDeltaSentiment(winRateDelta.direction)
        : undefined,
    },
    {
      key: "revenue-won",
      label: "Revenue won",
      value: formatMoney(current.revenueWonInCents, currency),
      icon: CircleDollarSign,
      href: `/${businessSlug}/quotes?status=accepted`,
      caption,
      hint: "Total value of quotes accepted in the selected period.",
      delta: revenueDelta?.label,
      deltaDirection: revenueDelta?.direction,
      deltaSentiment: revenueDelta
        ? getDeltaSentiment(revenueDelta.direction)
        : undefined,
      sparkline: series.map((point) => point.revenueInCents),
      sparklineLabel: "Revenue won per bucket",
    },
  ];
}

export async function OverviewKpiSection(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (!hasWindowActivity(data)) return null;

  return (
    <AnalyticsKpiRow stats={buildKpiStats(data, props.window, props.businessSlug)} />
  );
}

export async function OverviewFunnelCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (!hasWindowActivity(data)) return null;

  return (
    <AnalyticsChartCard
      title="How visitors become customers"
      description="Visitors → inquiries → quotes sent → accepted, across the selected period."
    >
      <div className="flex flex-col gap-4">
        <FunnelBars
          steps={data.funnel}
          ariaLabel={`Acquisition funnel for ${props.window.label}`}
        />
        <ChartDataTable
          columns={[
            { key: "step", header: "Stage" },
            { key: "count", header: "Count", align: "end" },
            { key: "share", header: "Of visitors", align: "end" },
          ]}
          rows={data.funnel.map((step) => ({
            step: step.label,
            count: formatNumber(step.count),
            share:
              data.funnel[0]?.count > 0
                ? formatPercent(step.count / data.funnel[0].count)
                : "—",
          }))}
        />
      </div>
    </AnalyticsChartCard>
  );
}

export async function OverviewOutcomesCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  const total = data.outcomes.reduce((sum, slice) => sum + slice.count, 0);
  if (!hasWindowActivity(data) || total === 0) return null;

  return (
    <AnalyticsChartCard
      title="Quote outcomes"
      description="How customers responded to quotes sent in this period."
    >
      <div className="flex flex-col gap-4">
        <LazyQuoteOutcomesDonut
          slices={data.outcomes}
          centerValue={formatNumber(total)}
          centerLabel="Quotes"
          ariaLabel="Quote outcome breakdown"
        />
        <ChartDataTable
          label="View counts as a table"
          columns={[
            { key: "outcome", header: "Outcome" },
            { key: "count", header: "Quotes", align: "end" },
            { key: "share", header: "Share", align: "end" },
          ]}
          rows={data.outcomes.map((slice) => ({
            outcome: slice.label,
            count: formatNumber(slice.count),
            share: formatPercent(slice.share),
          }))}
        />
      </div>
    </AnalyticsChartCard>
  );
}

export async function OverviewTrendCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (!hasWindowActivity(data) || data.series.length < 2) return null;

  const compare = data.prior !== null;

  return (
    <AnalyticsChartCard
      title="Pipeline trend"
      description={
        compare
          ? "Inquiries, quotes sent, and accepted quotes per bucket — dashed lines repeat the previous period."
          : "Inquiries, quotes sent, and accepted quotes per bucket."
      }
    >
      <div className="flex flex-col gap-4">
        <LazyTrendAreaChart
          points={data.series}
          showCompare={compare}
          ariaLabel={`Pipeline trend for ${props.window.label}`}
          series={[
            {
              key: "inquiries",
              label: "Inquiries",
              color: chartSeries(0),
              priorKey: "priorInquiries",
            },
            {
              key: "quotesSent",
              label: "Quotes sent",
              color: chartSeries(1),
              priorKey: "priorQuotesSent",
            },
            { key: "quotesAccepted", label: "Accepted", color: chartSeries(2) },
          ]}
        />
        <ChartDataTable
          columns={[
            { key: "bucket", header: "Period" },
            { key: "inquiries", header: "Inquiries", align: "end" },
            { key: "quotesSent", header: "Quotes sent", align: "end" },
            { key: "accepted", header: "Accepted", align: "end" },
            { key: "revenue", header: "Revenue won", align: "end" },
          ]}
          rows={data.series.map((point) => ({
            bucket: point.label,
            inquiries: formatNumber(point.inquiries),
            quotesSent: formatNumber(point.quotesSent),
            accepted: formatNumber(point.quotesAccepted),
            revenue: formatMoney(point.revenueInCents, data.currency),
          }))}
        />
      </div>
    </AnalyticsChartCard>
  );
}

export async function OverviewMoneyCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  const { receivables, currency } = data;

  return (
    <DashboardSection
      title="Money in"
      description="Current unpaid invoices — a live snapshot, not limited to the selected range."
      action={
        <Button asChild variant="ghost" size="sm">
          <Link href={getInvoicesListHref(props.businessSlug)}>
            View invoices
            <ArrowRight data-icon="inline-end" aria-hidden />
          </Link>
        </Button>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={getInvoicesListHref(props.businessSlug)}
          className="soft-panel flex flex-col gap-1 rounded-xl border border-border/60 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="meta-label">Outstanding</span>
          <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatMoney(receivables.outstandingInCents, currency)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatNumber(receivables.outstandingCount)}{" "}
            {receivables.outstandingCount === 1 ? "invoice" : "invoices"} awaiting payment
          </span>
        </Link>
        <Link
          href={getInvoicesListHref(props.businessSlug, { status: "overdue" })}
          className="soft-panel flex flex-col gap-1 rounded-xl border border-border/60 outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="meta-label">Overdue</span>
          <span
            className={cn(
              "text-2xl font-semibold tracking-tight tabular-nums",
              receivables.overdueInCents > 0 ? "text-destructive" : "text-foreground",
            )}
          >
            {formatMoney(receivables.overdueInCents, currency)}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatNumber(receivables.overdueCount)}{" "}
            {receivables.overdueCount === 1 ? "invoice" : "invoices"} past due
          </span>
        </Link>
      </div>
    </DashboardSection>
  );
}

export async function OverviewAttentionCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;

  return (
    <DashboardSection
      title="Needs your attention"
      description="Live counts across all time — the lists behind them are one click away."
    >
      <AttentionList items={data.attention} />
    </DashboardSection>
  );
}

export async function OverviewUsageCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (data.usage.length === 0) return null;

  return (
    <DashboardSection
      title="Plan usage this month"
      description="Allowances reset at the start of each calendar month."
    >
      <div className="grid gap-5 lg:grid-cols-2">
        {data.usage.map((meter) => (
          <UsageMeter
            key={meter.key}
            meter={meter}
            action={
              meter.upgradeFeature ? (
                <FeatureGate
                  feature={meter.upgradeFeature}
                  plan={props.plan}
                  variant="action"
                  upgradeAction={props.upgradeAction}
                  description={meter.hint}
                >
                  <Button variant="outline" size="sm">
                    Unlock
                  </Button>
                </FeatureGate>
              ) : null
            }
          />
        ))}
      </div>
    </DashboardSection>
  );
}
