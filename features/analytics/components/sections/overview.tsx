import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FeatureGate } from "@/features/entitlements";
import type { UpgradeActionProps } from "@/features/entitlements/types";
import { chartSemantic } from "@/features/analytics/lib/chart-theme";
import {
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPointsDelta,
  formatRelativeDelta,
  formatSpeedDelta,
  getDeltaSentiment,
} from "@/features/analytics/lib/format";
import { getInvoicesListHref } from "@/features/analytics/lib/links";
import { averageWonInCents } from "@/features/analytics/lib/kpi";
import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import type { OverviewData } from "@/features/analytics/types";
import type { PlanTier } from "@/lib/plans";

import { AgingList } from "../primitives/aging-list";
import { AnalyticsCard } from "../primitives/analytics-card";
import { AnalyticsChartCard } from "../primitives/analytics-chart-card";
import {
  AnalyticsKpiStrip,
  AnalyticsRow,
  analyticsCol,
} from "../primitives/analytics-section";
import { AnalyticsTabbedCard } from "../primitives/analytics-tabbed-card";
import { AttentionList } from "../primitives/attention-list";
import { DataTable } from "../primitives/data-table";
import { EmptyState } from "../primitives/empty-state";
import { Funnel } from "../primitives/funnel";
import { Stat, StatGrid } from "../primitives/stat";
import { UsageMeter } from "../primitives/usage-meter";
import { AnalyticsKpiCard, type AnalyticsKpiStat } from "../kpi/analytics-kpi-card";
import { LazyDonut, LazyRevenueChart, LazyTrendChart } from "../charts/lazy-charts";
import { AnalyticsFirstRunEmpty, AnalyticsRangeEmpty } from "../states/analytics-empty";

export type OverviewSectionProps = {
  dataPromise: Promise<OverviewData>;
  businessSlug: string;
  window: AnalyticsWindow;
  plan: PlanTier;
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

/** The KPI tiles for the overview strip. */
function buildKpiStats(
  data: OverviewData,
  window: AnalyticsWindow,
  businessSlug: string,
): AnalyticsKpiStat[] {
  const { current, prior, series, currency, firstResponse } = data;
  const compare = prior !== null;
  const caption = compare ? "vs previous period" : window.label;

  const inquiriesDelta = compare
    ? formatRelativeDelta(current.inquiries, prior.inquiries, (value) =>
        formatNumber(value),
      )
    : null;
  const quotesDelta = compare
    ? formatRelativeDelta(current.quotesSent, prior.quotesSent, (value) =>
        formatNumber(value),
      )
    : null;
  const winRateDelta = compare
    ? formatPointsDelta(current.winRate, prior.winRate)
    : null;
  const revenueDelta = compare
    ? formatRelativeDelta(
        current.revenueWonInCents,
        prior.revenueWonInCents,
        (value) => formatMoney(value, currency),
      )
    : null;

  // Won value and the quote count behind it come from the same population:
  // quotes accepted inside the selected period.
  const avgWon = averageWonInCents(
    current.revenueWonInCents,
    current.quotesWon,
  );
  const priorAvgWon = prior
    ? averageWonInCents(prior.revenueWonInCents, prior.quotesWon)
    : 0;
  const avgWonDelta = compare
    ? formatRelativeDelta(avgWon, priorAvgWon, (value) =>
        formatMoney(value, currency),
      )
    : null;

  const responseDelta = compare
    ? formatSpeedDelta(firstResponse.hours, data.priorFirstResponse?.hours ?? null)
    : null;

  // The average only covers the inquiries that got a reply — say so.
  const responseCaption =
    firstResponse.total > 0
      ? `${formatNumber(firstResponse.answered)} of ${formatNumber(firstResponse.total)} answered`
      : caption;

  return [
    {
      key: "inquiries",
      label: "Inquiries",
      value: formatNumber(current.inquiries),
      href: `/${businessSlug}/inquiries`,
      hint: "Customer requests submitted through your service page in the selected period.",
      delta: inquiriesDelta?.label,
      deltaDirection: inquiriesDelta?.direction,
      deltaSentiment: inquiriesDelta
        ? getDeltaSentiment(inquiriesDelta.direction)
        : undefined,
      caption,
      sparkline: series.map((point) => point.inquiries),
      sparklineLabel: "Inquiries per bucket",
    },
    {
      key: "quotes-sent",
      label: "Quotes sent",
      value: formatNumber(current.quotesSent),
      href: `/${businessSlug}/quotes?status=sent`,
      hint: "Quotes marked as sent during the selected period.",
      delta: quotesDelta?.label,
      deltaDirection: quotesDelta?.direction,
      deltaSentiment: quotesDelta
        ? getDeltaSentiment(quotesDelta.direction)
        : undefined,
      caption,
      sparkline: series.map((point) => point.quotesSent),
      sparklineLabel: "Quotes sent per bucket",
    },
    {
      key: "win-rate",
      label: "Win rate",
      value: formatPercent(current.winRate),
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
      href: `/${businessSlug}/quotes?status=accepted`,
      caption,
      hint: "Total value of quotes accepted in the selected period, including quotes sent before it.",
      delta: revenueDelta?.label,
      deltaDirection: revenueDelta?.direction,
      deltaSentiment: revenueDelta
        ? getDeltaSentiment(revenueDelta.direction)
        : undefined,
      sparkline: series.map((point) => point.revenueInCents),
      sparklineLabel: "Revenue won per bucket",
    },
    {
      key: "avg-won-deal",
      label: "Avg won deal",
      value: formatMoney(avgWon, currency),
      caption,
      hint: "Won value ÷ quotes accepted in the selected period.",
      delta: avgWonDelta?.label,
      deltaDirection: avgWonDelta?.direction,
      deltaSentiment: avgWonDelta
        ? getDeltaSentiment(avgWonDelta.direction)
        : undefined,
    },
    {
      key: "first-response",
      label: "First response",
      value: formatDuration(firstResponse.hours),
      caption: compare ? `${responseCaption} · ${caption}` : responseCaption,
      hint: "Average time from an inquiry being submitted to the first team response. Lower is better. Counts only the inquiries that got a reply.",
      delta: responseDelta?.label,
      deltaDirection: responseDelta?.direction,
      deltaSentiment: responseDelta
        ? getDeltaSentiment(responseDelta.direction, true)
        : undefined,
    },
  ];
}

export async function OverviewKpiSection(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (!hasWindowActivity(data)) return null;

  const stats = buildKpiStats(data, props.window, props.businessSlug);

  return (
    <AnalyticsKpiStrip>
      {stats.map((stat) => (
        <AnalyticsKpiCard key={stat.key} stat={stat} />
      ))}
    </AnalyticsKpiStrip>
  );
}

export async function OverviewTrendCards(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (!hasWindowActivity(data) || data.series.length < 2) return null;

  const compare = data.prior !== null;
  const { currency } = data;

  const pipelineTable = (
    <DataTable
      columns={[
        { key: "bucket", header: "Period" },
        { key: "inquiries", header: "Inquiries", align: "end" },
        { key: "quotesSent", header: "Quotes sent", align: "end" },
        { key: "accepted", header: "Accepted", align: "end" },
      ]}
      rows={data.series.map((point) => ({
        bucket: point.label,
        inquiries: formatNumber(point.inquiries),
        quotesSent: formatNumber(point.quotesSent),
        accepted: formatNumber(point.quotesAccepted),
      }))}
    />
  );

  const trafficTable = (
    <DataTable
      columns={[
        { key: "bucket", header: "Period" },
        { key: "formViews", header: "Form views", align: "end" },
        { key: "visitors", header: "Visitors", align: "end" },
        { key: "inquiries", header: "Inquiries", align: "end" },
      ]}
      rows={data.series.map((point) => ({
        bucket: point.label,
        formViews: formatNumber(point.formViews),
        visitors: formatNumber(point.visitors),
        inquiries: formatNumber(point.inquiries),
      }))}
    />
  );

  const revenueTable = (
    <DataTable
      columns={[
        { key: "bucket", header: "Period" },
        { key: "revenue", header: "Revenue won", align: "end" },
        { key: "accepted", header: "Accepted", align: "end" },
        { key: "avgDeal", header: "Avg deal", align: "end" },
      ]}
      rows={data.series.map((point) => ({
        bucket: point.label,
        revenue: formatMoney(point.revenueInCents, currency),
        accepted: formatNumber(point.quotesAccepted),
        avgDeal:
          point.quotesAccepted > 0
            ? formatMoney(
                Math.round(point.revenueInCents / point.quotesAccepted),
                currency,
              )
            : "—",
      }))}
    />
  );

  return (
    <AnalyticsRow>
      <AnalyticsTabbedCard
        className={analyticsCol(6)}
        title="Activity"
        description={
          compare
            ? "Inquiries, quotes sent, and accepted quotes per bucket — the dashed line repeats the previous period."
            : "Inquiries, quotes sent, and accepted quotes per bucket."
        }
        info="Bucketed from the selected date range. The previous period repeats the same buckets one window earlier."
        tabs={[
          {
            id: "pipeline",
            label: "Pipeline",
            chart: (
              <LazyTrendChart
                points={data.series}
                showCompare={compare}
                currency={currency}
                ariaLabel={`Pipeline activity for ${props.window.label}`}
                series={[
                  {
                    key: "inquiries",
                    label: "Inquiries",
                    color: "var(--chart-series-1)",
                    priorKey: "priorInquiries",
                    format: "number",
                  },
                  {
                    key: "quotesSent",
                    label: "Quotes sent",
                    color: "var(--chart-series-2)",
                    priorKey: "priorQuotesSent",
                    format: "number",
                  },
                  {
                    key: "quotesAccepted",
                    label: "Accepted",
                    color: "var(--chart-series-3)",
                    format: "number",
                  },
                ]}
              />
            ),
            table: pipelineTable,
          },
          {
            id: "traffic",
            label: "Traffic",
            chart: (
              <LazyTrendChart
                points={data.series}
                showCompare={compare}
                currency={currency}
                ariaLabel={`Traffic activity for ${props.window.label}`}
                series={[
                  {
                    key: "formViews",
                    label: "Form views",
                    color: "var(--chart-series-1)",
                    format: "number",
                  },
                  {
                    key: "visitors",
                    label: "Visitors",
                    color: "var(--chart-series-2)",
                    priorKey: "priorVisitors",
                    format: "number",
                  },
                  {
                    key: "inquiries",
                    label: "Inquiries",
                    color: "var(--chart-series-3)",
                    format: "number",
                  },
                ]}
              />
            ),
            table: trafficTable,
          },
        ]}
      />

      <AnalyticsChartCard
        className={analyticsCol(6)}
        title="Revenue trend"
        description="Won value per bucket, with the average accepted deal as a line."
        info="Bars are the value of quotes accepted in each bucket. The line is the average size of those quotes."
        chart={
          <LazyRevenueChart
            points={data.series}
            currency={currency}
            ariaLabel={`Revenue won for ${props.window.label}`}
          />
        }
        table={revenueTable}
      />
    </AnalyticsRow>
  );
}

export async function OverviewFunnelCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (!hasWindowActivity(data)) return null;

  const first = data.funnel[0]?.count ?? 0;

  return (
    <AnalyticsChartCard
      className={analyticsCol(6)}
      title="Visitors to customers"
      description="Visitors → inquiries → quotes sent → accepted, across the selected period."
      info="Each bar is sized against the first stage. The muted line under a stage is the conversion from the stage before it."
      chart={
        <Funnel
          steps={data.funnel}
          ariaLabel={`Acquisition funnel for ${props.window.label}`}
        />
      }
      table={
        <DataTable
          columns={[
            { key: "step", header: "Stage" },
            { key: "count", header: "Count", align: "end" },
            { key: "share", header: "Of visitors", align: "end" },
          ]}
          rows={data.funnel.map((step) => ({
            step: step.label,
            count: formatNumber(step.count),
            share: first > 0 ? formatPercent(step.count / first) : "—",
          }))}
        />
      }
    />
  );
}

export async function OverviewOutcomesCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  const total = data.outcomes.reduce((sum, slice) => sum + slice.count, 0);
  if (!hasWindowActivity(data)) return null;

  const { currency } = data;

  const slices = data.outcomes.map((slice) => ({
    key: slice.key,
    label: slice.label,
    count: slice.count,
    share: slice.share,
    color: chartSemantic(
      slice.key === "accepted"
        ? "accepted"
        : slice.key === "rejected"
          ? "rejected"
          : slice.key === "expired"
            ? "expired"
            : "pending",
    ),
    value:
      slice.valueInCents === undefined
        ? undefined
        : formatMoney(slice.valueInCents, currency),
  }));

  return (
    <AnalyticsChartCard
      className={analyticsCol(6)}
      title="Quote outcomes"
      description="How customers responded to the quotes sent in this period."
      info="Every quote sent in the period, split by the response it received. The value is the money behind each outcome — a quote sent earlier and accepted now lands under Revenue won instead."
      footer={
        <>
          <span>
            {formatNumber(total)} quotes sent
          </span>
          <span aria-hidden>·</span>
          <span>
            {formatPercent(
              data.outcomes.find((slice) => slice.key === "accepted")?.share ?? 0,
            )}{" "}
            accepted
          </span>
        </>
      }
      chart={
        total === 0 ? (
          <EmptyState label="No quotes sent in this period." />
        ) : (
          <LazyDonut
            slices={slices}
            centerValue={formatNumber(total)}
            centerLabel="Quotes"
            ariaLabel="Quote outcome breakdown"
          />
        )
      }
      table={
        <DataTable
          columns={[
            { key: "outcome", header: "Outcome" },
            { key: "count", header: "Quotes", align: "end" },
            { key: "share", header: "Share", align: "end" },
            { key: "value", header: "Value", align: "end" },
          ]}
          rows={data.outcomes.map((slice) => ({
            outcome: slice.label,
            count: formatNumber(slice.count),
            share: formatPercent(slice.share),
            value:
              slice.valueInCents === undefined
                ? "—"
                : formatMoney(slice.valueInCents, currency),
          }))}
        />
      }
    />
  );
}

export async function OverviewLiveCards(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  const { receivables, currency } = data;

  return (
    <AnalyticsRow>
      <AnalyticsCard
        className={analyticsCol(6)}
        title="Needs your attention"
        description="Live counts across all time — the lists behind them are one click away."
        bodyClassName="gap-0"
      >
        <AttentionList items={data.attention} />
      </AnalyticsCard>

      <AnalyticsCard
        className={analyticsCol(6)}
        title="Receivables"
        description="Unpaid invoices right now — a live snapshot, not the selected range."
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href={getInvoicesListHref(props.businessSlug)}>
              Invoices
              <ArrowRight data-icon="inline-end" aria-hidden />
            </Link>
          </Button>
        }
        footer={
          <>
            <span>
              {formatNumber(receivables.outstandingCount)}{" "}
              {receivables.outstandingCount === 1 ? "invoice" : "invoices"} open
            </span>
            <span aria-hidden>·</span>
            <span>
              {formatNumber(receivables.overdueCount)}{" "}
              {receivables.overdueCount === 1 ? "invoice" : "invoices"} past due
            </span>
          </>
        }
      >
        <StatGrid columns={2}>
          <Stat
            label="Outstanding"
            value={formatMoney(receivables.outstandingInCents, currency)}
            caption="Awaiting payment"
            href={getInvoicesListHref(props.businessSlug)}
          />
          <Stat
            label="Overdue"
            value={formatMoney(receivables.overdueInCents, currency)}
            caption="Past the due date"
            href={getInvoicesListHref(props.businessSlug, { status: "overdue" })}
            valueClassName={
              receivables.overdueInCents > 0 ? "text-destructive" : undefined
            }
          />
        </StatGrid>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="meta-label">By days past due</span>
          <AgingList
            buckets={data.arAging}
            currency={currency}
            emptyLabel="Nothing outstanding."
          />
        </div>
      </AnalyticsCard>
    </AnalyticsRow>
  );
}

export async function OverviewUsageCard(props: OverviewSectionProps) {
  const data = await props.dataPromise;
  if (data.usage.length === 0) return null;

  return (
    <AnalyticsCard
      title="Plan usage this month"
      description="Allowances reset at the start of each calendar month."
    >
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
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
    </AnalyticsCard>
  );
}
