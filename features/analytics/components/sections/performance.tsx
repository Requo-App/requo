import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { MobileRecordRow } from "@/components/shared/mobile-record-row";
import { DeltaPill } from "@/components/shared/delta-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { chartSeries } from "@/features/analytics/lib/chart-theme";
import {
  formatDayLabel,
  formatDays,
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
  formatPercentValue,
  formatSpeedDelta,
  getDeltaSentiment,
} from "@/features/analytics/lib/format";
import {
  getInquiriesListHref,
  getQuotesListHref,
} from "@/features/analytics/lib/links";
import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import type {
  AnalyticsGoalRow,
  AnalyticsTimingMetric,
  PerformanceData,
  ServicePerformanceRow,
} from "@/features/analytics/types";
import { cn } from "@/lib/utils";

import { AnalyticsChartCard, ChartDataTable } from "../chart-card";
import { BenchmarkBars } from "../charts/benchmark-bar";
import { FunnelBars } from "../charts/funnel-bars";
import {
  LazyAgingBarChart,
  LazyRevenueTrendChart,
  LazyTrendAreaChart,
} from "../charts/lazy-charts";
import { RankedBarList } from "../charts/ranked-bar-list";
import { AnalyticsMetricTile as MetricTile } from "../metric-tile";
import { AnalyticsRangeEmpty } from "../states/analytics-empty";

/**
 * Performance tab sections (Pro).
 *
 * One section per Suspense boundary: every export awaits the shared
 * `getPerformanceData` promise, so the first boundary to render starts the
 * query and the rest resolve from the same in-flight promise. Sections stay
 * resilient in isolation — each one re-checks the slice it renders. The
 * `PerformanceEmptyGuard` renders the range-empty state once instead of every
 * card repeating "no data".
 */

export type PerformanceSectionProps = {
  dataPromise: Promise<PerformanceData>;
  businessSlug: string;
  window: AnalyticsWindow;
};

/** Renders the quiet-range state; every other section skips its card. */
export async function PerformanceEmptyGuard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (data.hasData) return null;

  return <AnalyticsRangeEmpty />;
}

// ---------------------------------------------------------------------------
// Acquisition
// ---------------------------------------------------------------------------

export async function PerformanceAcquisitionCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData || data.series.length < 2) return null;

  const compare = data.series.some((point) => point.priorVisitors !== null);

  return (
    <AnalyticsChartCard
      title="Acquisition trend"
      description={
        compare
          ? "Form views, visitors, and inquiries per bucket — dashed lines repeat the previous period."
          : "Form views, visitors, and inquiries per bucket."
      }
    >
      <div className="flex flex-col gap-4">
        <LazyTrendAreaChart
          points={data.series}
          showCompare={compare}
          ariaLabel={`Acquisition trend for ${props.window.label}`}
          series={[
            {
              key: "formViews",
              label: "Form views",
              color: chartSeries(0),
            },
            {
              key: "visitors",
              label: "Visitors",
              color: chartSeries(1),
              priorKey: "priorVisitors",
            },
            {
              key: "inquiries",
              label: "Inquiries",
              color: chartSeries(2),
              priorKey: "priorInquiries",
            },
          ]}
        />
        <ChartDataTable
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
      </div>
    </AnalyticsChartCard>
  );
}

export async function PerformanceSourcesCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;
  if (data.sources.length === 0 && data.campaigns.length === 0) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnalyticsChartCard
        title="Where form views come from"
        description="Referrer domains on service-page views. Direct means no referrer was recorded."
      >
        <RankedBarList
          items={data.sources}
          barColor={chartSeries(0)}
          emptyLabel="No form views in this period."
        />
      </AnalyticsChartCard>
      <AnalyticsChartCard
        title="Campaigns"
        description="Views tagged with UTM parameters, grouped by source and campaign."
      >
        <RankedBarList
          items={data.campaigns}
          barColor={chartSeries(1)}
          emptyLabel="No UTM-tagged views in this period."
        />
      </AnalyticsChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

function ServiceMobileRow({
  row,
  businessSlug,
  currency,
}: {
  row: ServicePerformanceRow;
  businessSlug: string;
  currency: string;
}) {
  return (
    <MobileRecordRow
      id={row.formSlug}
      href={getInquiriesListHref(businessSlug, { form: row.formSlug })}
      title={row.name}
      subtitle={`${formatPercent(row.winRate)} win rate · ${formatMoney(row.avgAcceptedValueInCents, currency)} average won`}
      statusBadge={<Badge variant="secondary">{formatNumber(row.quotesSent)} quotes</Badge>}
      metadata={
        <>
          <span>{formatNumber(row.visitors)} visitors</span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span>{formatNumber(row.inquiries)} submissions</span>
          <span aria-hidden className="text-muted-foreground/40">·</span>
          <span>{formatPercent(row.conversionRate)} conversion</span>
        </>
      }
    />
  );
}

export async function PerformanceServicesCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData || data.services.length === 0) return null;
  const { currency } = data;

  return (
    <AnalyticsChartCard
      title="Service performance"
      description="How each service page converts visitors into inquiries, quotes, and won work."
      contentClassName="gap-0"
    >
      <div className="flex flex-col gap-2.5 lg:hidden">
        {data.services.map((row) => (
          <ServiceMobileRow
            key={row.formSlug}
            row={row}
            businessSlug={props.businessSlug}
            currency={currency}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto no-scrollbar lg:block">
        <Table className="min-w-[46rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Service</TableHead>
              <TableHead className="text-right">Visitors</TableHead>
              <TableHead className="text-right">Submissions</TableHead>
              <TableHead className="text-right">Conv.</TableHead>
              <TableHead className="text-right">Quotes</TableHead>
              <TableHead className="text-right">Win rate</TableHead>
              <TableHead className="text-right">Avg won</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.services.map((row) => (
              <TableRow key={row.formSlug}>
                <TableCell className="font-medium text-foreground">
                  <Link
                    href={getInquiriesListHref(props.businessSlug, { form: row.formSlug })}
                    className="inline-flex items-center gap-1 rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {row.name}
                    <ArrowRight className="size-3.5 text-muted-foreground/70" aria-hidden />
                  </Link>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.visitors)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.inquiries)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(row.conversionRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(row.quotesSent)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercent(row.winRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(row.avgAcceptedValueInCents, currency)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------

function TimingTile({ metric }: { metric: AnalyticsTimingMetric }) {
  const delta = formatSpeedDelta(metric.hours, metric.priorHours);
  const hasCompare = metric.hours !== null && metric.priorHours !== null;

  return (
    <div className="soft-panel flex flex-col gap-1 rounded-xl border border-border/60">
      <span className="meta-label">{metric.label}</span>
      <span className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
        {formatDuration(metric.hours)}
      </span>
      <span className="text-xs text-muted-foreground">{metric.description}</span>
      {hasCompare ? (
        <div className="mt-1 w-fit">
          <DeltaPill
            delta={delta.label}
            direction={delta.direction}
            sentiment={getDeltaSentiment(delta.direction, true)}
          />
        </div>
      ) : null}
    </div>
  );
}

export async function PerformanceTimingCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;
  if (data.timing.every((metric) => metric.hours === null)) return null;

  return (
    <AnalyticsChartCard
      title="Response and turnaround times"
      description="Averages from inquiry submitted to each milestone. Lower is better."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {data.timing.map((metric) => (
          <TimingTile key={metric.key} metric={metric} />
        ))}
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Quote funnel, aging, discounts
// ---------------------------------------------------------------------------

export async function PerformanceQuoteFunnelCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;

  const first = data.quoteFunnel[0]?.count ?? 0;

  return (
    <AnalyticsChartCard
      title="Quote funnel"
      description="Sent → viewed → responded → accepted, with step conversion so drop-off is visible."
    >
      <div className="flex flex-col gap-4">
        <FunnelBars
          steps={data.quoteFunnel}
          ariaLabel={`Quote funnel for ${props.window.label}`}
        />
        <ChartDataTable
          columns={[
            { key: "step", header: "Stage" },
            { key: "count", header: "Quotes", align: "end" },
            { key: "share", header: "Of sent", align: "end" },
          ]}
          rows={data.quoteFunnel.map((step) => ({
            step: step.label,
            count: formatNumber(step.count),
            share: first > 0 ? formatPercent(step.count / first) : "—",
          }))}
        />
      </div>
    </AnalyticsChartCard>
  );
}

export async function PerformanceAgingCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const agingTotal = data.aging.reduce((sum, bucket) => sum + bucket.count, 0);
  const hasExpiring = data.expiring.count > 0;
  if (agingTotal === 0 && !hasExpiring) return null;
  const { currency } = data;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnalyticsChartCard
        title="Open quote aging"
        description="Unanswered quotes by age since they were sent — the live backlog, not the selected range."
      >
        <div className="flex flex-col gap-4">
          <LazyAgingBarChart
            buckets={data.aging}
            currency={currency}
            ariaLabel="Open quotes by age bucket"
          />
          <ChartDataTable
            columns={[
              { key: "bucket", header: "Age" },
              { key: "count", header: "Open quotes", align: "end" },
              { key: "value", header: "Value", align: "end" },
            ]}
            rows={data.aging.map((bucket) => ({
              bucket: bucket.label,
              count: formatNumber(bucket.count),
              value: formatMoney(bucket.valueInCents, currency),
            }))}
          />
        </div>
      </AnalyticsChartCard>

      <AnalyticsChartCard
        title="Expiring within 7 days"
        description="Sent quotes approaching their valid-until date. Reach out before they lapse."
        action={
          <Link
            href={getQuotesListHref(props.businessSlug, { status: "sent" })}
            className="text-sm font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            View sent quotes
          </Link>
        }
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="Quotes"
            value={formatNumber(data.expiring.count)}
            caption="Awaiting a response, expiring soon"
          />
          <MetricTile
            label="Value at risk"
            value={formatMoney(data.expiring.valueInCents, currency)}
            caption="Total value of expiring quotes"
            tone="warning"
          />
        </div>
      </AnalyticsChartCard>
    </div>
  );
}

export async function PerformanceDealValueCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;
  const { currency, values, discounts } = data;
  const discountShare =
    discounts.quotedCount > 0 ? discounts.discountedCount / discounts.quotedCount : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnalyticsChartCard
        title="Quote value"
        description="Value sent and how it resolved in this period, plus invoice averages."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="Quoted"
            value={formatMoney(values.quotedInCents, currency)}
            caption="Total of quotes sent"
          />
          <MetricTile
            label="Accepted"
            value={formatMoney(values.acceptedInCents, currency)}
            caption="Won value in this period"
            tone="positive"
          />
          <MetricTile
            label="Rejected"
            value={formatMoney(values.rejectedInCents, currency)}
            caption="Lost to declines"
          />
          <MetricTile
            label="Expired"
            value={formatMoney(values.expiredInCents, currency)}
            caption="Lapsed without a decision"
          />
          <MetricTile
            label="Avg accepted deal"
            value={formatMoney(values.averageAcceptedInCents, currency)}
            caption="Average won quote value"
          />
          <MetricTile
            label="Avg invoice"
            value={formatMoney(values.averageInvoiceInCents, currency)}
            caption={`Includes ${formatMoney(values.taxInCents, currency)} tax`}
          />
        </div>
      </AnalyticsChartCard>

      <AnalyticsChartCard
        title="Discounting"
        description="How often quotes carry a discount and how deep it goes."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="Discounted quotes"
            value={formatNumber(discounts.discountedCount)}
            caption={`of ${formatNumber(discounts.quotedCount)} sent (${formatPercent(discountShare)})`}
          />
          <MetricTile
            label="Average discount"
            value={formatPercentValue(discounts.averageDiscountPercent)}
            caption="Discount ÷ subtotal across sent quotes"
          />
          <MetricTile
            label="Total discount"
            value={formatMoney(discounts.totalDiscountInCents, currency)}
            caption="Value given away in this period"
            tone="warning"
          />
        </div>
      </AnalyticsChartCard>
    </div>
  );
}

export async function PerformanceWinRatesCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;
  if (data.winRates.byService.length === 0 && data.winRates.bySource.length === 0) {
    return null;
  }

  const formatWinRate = (item: { share: number }) => formatPercent(item.share);

  return (
    <AnalyticsChartCard
      title="Win rate breakdown"
      description="Accepted ÷ decided (accepted + rejected + expired) for quotes sent in this period."
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-sm font-medium text-foreground">By service</h3>
          <RankedBarList
            items={data.winRates.byService}
            formatValue={formatWinRate}
            barColor={chartSeries(0)}
            emptyLabel="No decided quotes by service yet."
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-sm font-medium text-foreground">By inquiry source</h3>
          <RankedBarList
            items={data.winRates.bySource}
            formatValue={formatWinRate}
            barColor={chartSeries(3)}
            emptyLabel="No decided quotes by source yet."
          />
        </div>
      </div>
    </AnalyticsChartCard>
  );
}

export async function PerformanceRevenueCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData || data.series.length < 2) return null;
  const { currency } = data;

  return (
    <AnalyticsChartCard
      title="Revenue trend"
      description="Won value per bucket, with the average accepted deal size as a line."
    >
      <div className="flex flex-col gap-4">
        <LazyRevenueTrendChart
          points={data.series}
          currency={currency}
          ariaLabel={`Revenue won for ${props.window.label}`}
        />
        <ChartDataTable
          columns={[
            { key: "bucket", header: "Period" },
            { key: "revenue", header: "Revenue won", align: "end" },
            { key: "quotes", header: "Accepted", align: "end" },
            { key: "avgDeal", header: "Avg deal", align: "end" },
          ]}
          rows={data.series.map((point) => ({
            bucket: point.label,
            revenue: formatMoney(point.revenueInCents, currency),
            quotes: formatNumber(point.quotesAccepted),
            avgDeal:
              point.quotesAccepted > 0
                ? formatMoney(
                    Math.round(point.revenueInCents / point.quotesAccepted),
                    currency,
                  )
                : "—",
          }))}
        />
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

export async function PerformanceReceivablesCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const total = data.arAging.reduce((sum, bucket) => sum + bucket.count, 0);
  if (total === 0) return null;
  const { currency } = data;

  return (
    <AnalyticsChartCard
      title="Accounts receivable aging"
      description="Outstanding balances by days past due — a live snapshot, not limited to the selected range."
    >
      <div className="flex flex-col gap-4">
        <LazyAgingBarChart
          buckets={data.arAging}
          currency={currency}
          ariaLabel="Outstanding invoice balances by age bucket"
        />
        <ChartDataTable
          columns={[
            { key: "bucket", header: "Bucket" },
            { key: "count", header: "Invoices", align: "end" },
            { key: "value", header: "Balance", align: "end" },
          ]}
          rows={data.arAging.map((bucket) => ({
            bucket: bucket.label,
            count: formatNumber(bucket.count),
            value: formatMoney(bucket.valueInCents, currency),
          }))}
        />
      </div>
    </AnalyticsChartCard>
  );
}

export async function PerformanceCollectionsCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const { collections, paymentMix } = data;
  const paidCount = collections.onTimeCount + collections.lateCount;
  if (paidCount === 0 && collections.partialCount === 0 && paymentMix.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnalyticsChartCard
        title="Collection velocity"
        description="How quickly payments land after an invoice is sent and due."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="Avg days to pay"
            value={formatDays(collections.averageDaysToPay)}
            caption="Invoice sent → payment received"
          />
          <MetricTile
            label="Avg days late"
            value={formatDays(collections.averageDaysLate)}
            caption="Only for payments past the due date"
            tone={collections.averageDaysLate && collections.averageDaysLate > 0 ? "warning" : "default"}
          />
          <MetricTile
            label="On time"
            value={formatNumber(collections.onTimeCount)}
            caption="Payments on or before the due date"
            tone="positive"
          />
          <MetricTile
            label="Late"
            value={formatNumber(collections.lateCount)}
            caption="Payments after the due date"
            tone={collections.lateCount > 0 ? "warning" : "default"}
          />
          <MetricTile
            label="Partially paid"
            value={formatNumber(collections.partialCount)}
            caption="Invoices with an open balance"
          />
        </div>
      </AnalyticsChartCard>

      <AnalyticsChartCard
        title="Payment mix"
        description="Recorded payments in this period by method."
      >
        <RankedBarList
          items={paymentMix}
          barColor={chartSeries(4)}
          emptyLabel="No payments recorded in this period."
        />
      </AnalyticsChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function PerformanceCustomersCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;
  const { currency, repeat, topCustomers } = data;
  const returningShare =
    repeat.revenueInCents > 0
      ? repeat.returningRevenueInCents / repeat.revenueInCents
      : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <AnalyticsChartCard
        title="New vs returning customers"
        description="Returning means the email had an earlier inquiry with this workspace."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="New inquiries"
            value={formatNumber(repeat.newInquiries)}
            caption={`${formatPercent(repeat.newWinRate)} win rate`}
          />
          <MetricTile
            label="Returning inquiries"
            value={formatNumber(repeat.returningInquiries)}
            caption={`${formatPercent(repeat.returningWinRate)} win rate`}
            tone="positive"
          />
          <MetricTile
            label="Returning revenue"
            value={formatMoney(repeat.returningRevenueInCents, currency)}
            caption={`${formatPercent(returningShare)} of won value`}
          />
          <MetricTile
            label="Total won"
            value={formatMoney(repeat.revenueInCents, currency)}
            caption="Accepted value in this period"
          />
        </div>
      </AnalyticsChartCard>

      <AnalyticsChartCard
        title="Top customers"
        description="Won value by customer in this period."
        action={
          <Link
            href={getQuotesListHref(props.businessSlug, { status: "accepted" })}
            className="text-sm font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            View won quotes
          </Link>
        }
      >
        <RankedBarList
          items={topCustomers}
          barColor={chartSeries(2)}
          emptyLabel="No won quotes in this period."
        />
      </AnalyticsChartCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Benchmarks & reports
// ---------------------------------------------------------------------------

export async function PerformanceBenchmarksCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (data.benchmarks.length === 0) return null;

  return (
    <AnalyticsChartCard
      title="How you compare"
      description="Your numbers against the median for similar businesses. Benchmarks publish once at least 10 businesses share data."
    >
      <BenchmarkBars rows={data.benchmarks} />
    </AnalyticsChartCard>
  );
}

function formatGoalValue(goal: AnalyticsGoalRow, value: number, currency: string) {
  if (goal.format === "percent") return formatPercentValue(value);
  if (goal.format === "currency") return formatMoney(Math.round(value * 100), currency);
  if (goal.metricKey === "avgResponseHours") return formatDuration(value);
  return formatNumber(value);
}

function GoalProgressRow({
  goal,
  currency,
}: {
  goal: AnalyticsGoalRow;
  currency: string;
}) {
  const met = goal.lowerIsBetter ? goal.current <= goal.target : goal.current >= goal.target;
  const ratio =
    goal.target > 0
      ? goal.lowerIsBetter
        ? Math.min(goal.target / Math.max(goal.current, 0.0001), 1)
        : Math.min(goal.current / goal.target, 1)
      : goal.current > 0
        ? 1
        : 0;

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground">{goal.label}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatGoalValue(goal, goal.current, currency)}
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            of {formatGoalValue(goal, goal.target, currency)}
          </span>
        </span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full", met ? "bg-success" : "bg-chart-1")}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {met ? "Target met" : goal.lowerIsBetter ? "Above target" : "In progress"}
      </p>
    </li>
  );
}

export async function PerformanceReportsCard(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const { goals, annotations, scheduledReports } = data;
  if (goals.length === 0 && annotations.length === 0 && scheduledReports.length === 0) {
    return null;
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
      {goals.length > 0 ? (
        <AnalyticsChartCard
          title="Goals"
          description="Targets configured for this workspace, measured against the selected period."
        >
          <ul className="flex flex-col gap-5">
            {goals.map((goal) => (
              <GoalProgressRow key={goal.metricKey} goal={goal} currency={data.currency} />
            ))}
          </ul>
        </AnalyticsChartCard>
      ) : null}

      {annotations.length > 0 ? (
        <AnalyticsChartCard
          title="Tracking notes"
          description="Annotations recorded inside this period."
        >
          <ul className="flex flex-col">
            {annotations.map((annotation) => (
              <li
                key={annotation.id}
                className="flex items-center gap-2.5 border-b border-border/60 py-2.5 last:border-0"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: annotation.color ?? chartSeries(0) }}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                  {annotation.label}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatDayLabel(annotation.date)}
                </span>
              </li>
            ))}
          </ul>
        </AnalyticsChartCard>
      ) : null}

      {scheduledReports.length > 0 ? (
        <AnalyticsChartCard
          title="Scheduled reports"
          description="Digests emailed to your team on a schedule."
        >
          <ul className="flex flex-col gap-4">
            {scheduledReports.map((report) => (
              <li key={report.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-foreground">
                    {report.recipientEmails.join(", ")}
                  </span>
                  <Badge variant={report.enabled ? "secondary" : "outline"}>
                    {report.enabled ? "Enabled" : "Paused"}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {report.schedule} · {report.timezone}
                  {report.lastSentAt
                    ? ` · Last sent ${formatDayLabel(report.lastSentAt.slice(0, 10))}`
                    : " · Never sent yet"}
                </p>
              </li>
            ))}
          </ul>
        </AnalyticsChartCard>
      ) : null}
    </div>
  );
}
