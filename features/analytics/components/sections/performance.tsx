import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { MobileRecordRow } from "@/components/shared/mobile-record-row";
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
  PerformanceData,
  ServicePerformanceRow,
} from "@/features/analytics/types";
import { cn } from "@/lib/utils";

import { AgingList } from "../primitives/aging-list";
import { AnalyticsCard } from "../primitives/analytics-card";
import { AnalyticsChartCard } from "../primitives/analytics-chart-card";
import {
  AnalyticsRow,
  analyticsCol,
} from "../primitives/analytics-section";
import { AnalyticsTabbedCard } from "../primitives/analytics-tabbed-card";
import { BarList, type BarListItem } from "../primitives/bar-list";
import { DataTable } from "../primitives/data-table";
import { EmptyState } from "../primitives/empty-state";
import { Funnel } from "../primitives/funnel";
import { Stat, StatGrid } from "../primitives/stat";
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
 *
 * Rows are symmetric: two cards of six columns, one card of twelve, or three
 * cards of four. A row whose second card has no data gives its remaining
 * card the full width instead of leaving a hole.
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
// Quote funnel and win-rate breakdown
// ---------------------------------------------------------------------------

export async function PerformanceFunnelRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;

  const first = data.quoteFunnel[0]?.count ?? 0;
  const hasWinRates =
    data.winRates.byService.length > 0 || data.winRates.bySource.length > 0;

  const funnelCard = (
    <AnalyticsChartCard
      className={analyticsCol(hasWinRates ? 6 : 12)}
      title="Quote funnel"
      description="Sent → viewed → responded → accepted, with step conversion so drop-off is visible."
      info="Every quote sent in the period, in order. The muted line under a stage is the conversion from the stage before it."
      chart={
        <Funnel
          steps={data.quoteFunnel}
          ariaLabel={`Quote funnel for ${props.window.label}`}
        />
      }
      table={
        <DataTable
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
      }
    />
  );

  if (!hasWinRates) {
    return <AnalyticsRow>{funnelCard}</AnalyticsRow>;
  }

  const serviceItems: BarListItem[] = data.winRates.byService.map((item) => ({
    key: `service-${item.label}`,
    label: item.label,
    value: formatPercent(item.share),
    share: item.share,
    href: item.href,
    meta: item.detail,
  }));

  const sourceItems: BarListItem[] = data.winRates.bySource.map((item) => ({
    key: `source-${item.label}`,
    label: item.label,
    value: formatPercent(item.share),
    share: item.share,
    href: item.href,
    meta: item.detail,
  }));

  return (
    <AnalyticsRow>
      {funnelCard}
      <AnalyticsCard
        className={analyticsCol(6)}
        title="Win rate by service and source"
        description="Accepted ÷ decided (accepted + rejected + expired) for quotes sent in this period."
        info="Win rate is accepted quotes ÷ decided quotes. A quote is decided once it is accepted, rejected, or expired — quotes still awaiting a decision are excluded."
        bodyClassName="gap-5"
      >
        <div className="flex min-w-0 flex-col gap-2">
          <span className="meta-label">By service</span>
          <BarList
            items={serviceItems}
            emptyLabel="No decided quotes by service yet."
          />
        </div>
        <div className="flex min-w-0 flex-col gap-2">
          <span className="meta-label">By inquiry source</span>
          <BarList
            items={sourceItems}
            emptyLabel="No decided quotes by source yet."
          />
        </div>
      </AnalyticsCard>
    </AnalyticsRow>
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

export async function PerformanceServicesRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData || data.services.length === 0) return null;
  const { currency } = data;

  return (
    <AnalyticsRow>
      <AnalyticsCard
        className={analyticsCol(12)}
        title="Service performance"
        description="How each service page converts visitors into inquiries, quotes, and won work."
        info="Win rate here is accepted quotes ÷ quotes sent, which is not the same as the win rate over decided quotes."
        bodyClassName="gap-0"
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

        <div className="hidden min-w-0 lg:block">
          <DataTable
            minWidthClassName="min-w-[46rem]"
            columns={[
              { key: "service", header: "Service" },
              { key: "visitors", header: "Visitors", align: "end" },
              { key: "submissions", header: "Submissions", align: "end" },
              { key: "conversion", header: "Conv.", align: "end" },
              { key: "quotes", header: "Quotes", align: "end" },
              {
                key: "winRate",
                header: "Win rate",
                align: "end",
                headerHint:
                  "Accepted quotes ÷ quotes sent for this service in the selected period.",
              },
              { key: "avgWon", header: "Avg won", align: "end" },
            ]}
            rows={data.services.map((row) => ({
              service: (
                <Link
                  href={getInquiriesListHref(props.businessSlug, { form: row.formSlug })}
                  className="inline-flex items-center gap-1 rounded-sm outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {row.name}
                </Link>
              ),
              visitors: formatNumber(row.visitors),
              submissions: formatNumber(row.inquiries),
              conversion: formatPercent(row.conversionRate),
              quotes: formatNumber(row.quotesSent),
              winRate: formatPercent(row.winRate),
              avgWon: formatMoney(row.avgAcceptedValueInCents, currency),
            }))}
          />
        </div>
      </AnalyticsCard>
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Timing, quote value, discounting
// ---------------------------------------------------------------------------

function TimingStat({
  metric,
}: {
  metric: PerformanceData["timing"][number];
}) {
  const delta = formatSpeedDelta(metric.hours, metric.priorHours);
  const hasCompare = metric.hours !== null && metric.priorHours !== null;

  return (
    <Stat
      label={metric.label}
      value={formatDuration(metric.hours)}
      caption={metric.description}
      delta={hasCompare ? delta.label : null}
      deltaDirection={delta.direction}
      deltaSentiment={getDeltaSentiment(delta.direction, true)}
    />
  );
}

export async function PerformanceTimingRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;
  if (data.timing.every((metric) => metric.hours === null)) return null;

  const { currency, values, discounts } = data;
  const discountShare =
    discounts.quotedCount > 0
      ? discounts.discountedCount / discounts.quotedCount
      : 0;

  return (
    <AnalyticsRow>
      <AnalyticsCard
        className={analyticsCol(6)}
        title="Response and turnaround"
        description="Averages from inquiry submitted to each milestone. Lower is better."
        info="Each figure is the average time between the inquiry arriving and the milestone being reached."
      >
        <StatGrid columns={2}>
          {data.timing.map((metric) => (
            <TimingStat key={metric.key} metric={metric} />
          ))}
        </StatGrid>
      </AnalyticsCard>

      <AnalyticsCard
        className={analyticsCol(6)}
        title="Quote value and discounting"
        description="What was quoted in this period, and how much of it was given away."
        info="Quoted is the total value of the quotes sent. Discounts are measured against the subtotal of those quotes."
        footer={
          <>
            <span>
              Accepted {formatMoney(values.acceptedInCents, currency)}
            </span>
            <span aria-hidden>·</span>
            <span>Rejected {formatMoney(values.rejectedInCents, currency)}</span>
            <span aria-hidden>·</span>
            <span>Expired {formatMoney(values.expiredInCents, currency)}</span>
          </>
        }
      >
        <StatGrid columns={3}>
          <Stat
            label="Quoted"
            value={formatMoney(values.quotedInCents, currency)}
            caption="Total value of quotes sent"
          />
          <Stat
            label="Avg accepted deal"
            value={formatMoney(values.averageAcceptedInCents, currency)}
            caption="Average won quote value"
          />
          <Stat
            label="Avg invoice"
            value={formatMoney(values.averageInvoiceInCents, currency)}
            caption={`Includes ${formatMoney(values.taxInCents, currency)} tax`}
          />
          <Stat
            label="Discounted quotes"
            value={formatNumber(discounts.discountedCount)}
            caption={`of ${formatNumber(discounts.quotedCount)} sent (${formatPercent(discountShare)})`}
          />
          <Stat
            label="Average discount"
            value={formatPercentValue(discounts.averageDiscountPercent)}
            caption="Discount ÷ subtotal across sent quotes"
          />
          <Stat
            label="Total discount"
            value={formatMoney(discounts.totalDiscountInCents, currency)}
            caption="Value given away in this period"
          />
        </StatGrid>
      </AnalyticsCard>
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Collections and payment mix
// ---------------------------------------------------------------------------

export async function PerformanceCollectionsRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const { collections, paymentMix } = data;
  const paidCount = collections.onTimeCount + collections.lateCount;
  if (paidCount === 0 && collections.partialCount === 0 && paymentMix.length === 0) {
    return null;
  }

  const mixItems: BarListItem[] = paymentMix.map((item) => ({
    key: item.label,
    label: item.label,
    value: formatNumber(item.count),
    share: item.share,
    href: item.href,
    meta: item.detail,
  }));

  return (
    <AnalyticsRow>
      <AnalyticsCard
        className={analyticsCol(6)}
        title="Collection velocity"
        description="How quickly payments land after an invoice is sent and due."
      >
        <StatGrid columns={2}>
          <Stat
            label="Avg days to pay"
            value={formatDays(collections.averageDaysToPay)}
            caption="Invoice sent → payment received"
          />
          <Stat
            label="Avg days late"
            value={formatDays(collections.averageDaysLate)}
            caption="Only for payments past the due date"
            valueClassName={
              collections.averageDaysLate && collections.averageDaysLate > 0
                ? "text-warning"
                : undefined
            }
          />
          <Stat
            label="On time"
            value={formatNumber(collections.onTimeCount)}
            caption="Payments on or before the due date"
            valueClassName="text-success"
          />
          <Stat
            label="Late"
            value={formatNumber(collections.lateCount)}
            caption="Payments after the due date"
            valueClassName={
              collections.lateCount > 0 ? "text-warning" : undefined
            }
          />
        </StatGrid>
      </AnalyticsCard>

      <AnalyticsCard
        className={analyticsCol(6)}
        title="Payment mix"
        description="Recorded payments in this period by method."
      >
        <BarList
          items={mixItems}
          emptyLabel="No payments recorded in this period."
        />
      </AnalyticsCard>
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Benchmarks and goals
// ---------------------------------------------------------------------------

export async function PerformanceBenchmarksRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const hasBenchmarks = data.benchmarks.length > 0;
  const hasGoals = data.goals.length > 0;
  if (!hasBenchmarks && !hasGoals) return null;

  const { currency } = data;

  const benchmarkItems: BarListItem[] = data.benchmarks.map((row) => ({
    key: row.key,
    label: row.label,
    value:
      row.format === "percent"
        ? formatPercentValue(row.yours ?? 0)
        : formatDuration(row.yours ?? null),
    share:
      row.yours !== null && row.median !== null && row.median > 0
        ? Math.min(row.yours / row.median, 1)
        : 0,
    meta: `Median ${row.format === "percent" ? formatPercentValue(row.median ?? 0) : formatDuration(row.median ?? null)} · ${row.businessCount ?? 0} businesses`,
  }));

  return (
    <AnalyticsRow>
      {hasBenchmarks ? (
        <AnalyticsCard
          className={analyticsCol(hasGoals ? 6 : 12)}
          title="How you compare"
          description="Your numbers against the median for similar businesses. Benchmarks publish once at least 10 businesses share data."
        >
          <BarList items={benchmarkItems} />
        </AnalyticsCard>
      ) : null}

      {hasGoals ? (
        <AnalyticsCard
          className={analyticsCol(hasBenchmarks ? 6 : 12)}
          title="Goals"
          description="Targets configured for this workspace, measured against the selected period."
        >
          <ul className="flex flex-col gap-5">
            {data.goals.map((goal) => (
              <GoalProgressRow
                key={goal.metricKey}
                goal={goal}
                currency={currency}
              />
            ))}
          </ul>
        </AnalyticsCard>
      ) : null}
    </AnalyticsRow>
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
      <div className="analytics-track h-1.5 w-full overflow-hidden rounded-full">
        <div
          className={cn("h-full rounded-full", met ? "bg-success" : "bg-primary")}
          style={{ width: `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">
        {met ? "Target met" : goal.lowerIsBetter ? "Above target" : "In progress"}
      </p>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Tracking notes and scheduled reports
// ---------------------------------------------------------------------------

export async function PerformanceReportsRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const hasNotes = data.annotations.length > 0;
  const hasReports = data.scheduledReports.length > 0;
  if (!hasNotes && !hasReports) return null;

  return (
    <AnalyticsRow>
      {hasNotes ? (
        <AnalyticsCard
          className={analyticsCol(hasReports ? 6 : 12)}
          title="Tracking notes"
          description="Annotations recorded inside this period."
          bodyClassName="gap-0"
        >
          <ul className="flex flex-col">
            {data.annotations.map((annotation) => (
              <li
                key={annotation.id}
                className="flex items-center gap-2.5 border-b border-border/50 py-2.5 last:border-0"
              >
                <span
                  className="size-2.5 shrink-0 rounded-full bg-primary"
                  style={
                    annotation.color ? { backgroundColor: annotation.color } : undefined
                  }
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
        </AnalyticsCard>
      ) : null}

      {hasReports ? (
        <AnalyticsCard
          className={analyticsCol(hasNotes ? 6 : 12)}
          title="Scheduled reports"
          description="Digests emailed to your team on a schedule."
        >
          <ul className="flex flex-col gap-4">
            {data.scheduledReports.map((report) => (
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
        </AnalyticsCard>
      ) : null}
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Audience
// ---------------------------------------------------------------------------

export async function PerformanceAudienceRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  if (!data.hasData) return null;

  const { currency, repeat, topCustomers } = data;
  const returningShare =
    repeat.revenueInCents > 0
      ? repeat.returningRevenueInCents / repeat.revenueInCents
      : 0;

  const hasCustomers = topCustomers.length > 0;

  const sourceItems: BarListItem[] = data.sources.map((item) => ({
    key: `source-${item.label}`,
    label: item.label,
    value: formatNumber(item.count),
    share: item.share,
    href: item.href,
  }));

  const campaignItems: BarListItem[] = data.campaigns.map((item) => ({
    key: `campaign-${item.label}`,
    label: item.label,
    value: formatNumber(item.count),
    share: item.share,
    href: item.href,
  }));

  const customerItems: BarListItem[] = topCustomers.map((item) => ({
    key: `customer-${item.label}`,
    label: item.label,
    value: formatMoney(item.valueInCents ?? 0, currency),
    share: item.share,
    href: item.href,
    meta: item.detail
      ? `${item.detail} · ${formatNumber(item.count)} ${
          item.count === 1 ? "quote" : "quotes"
        }`
      : `${formatNumber(item.count)} ${item.count === 1 ? "quote" : "quotes"}`,
  }));

  return (
    <AnalyticsRow>
      <AnalyticsTabbedCard
        className={analyticsCol(4)}
        title="Traffic sources"
        description="Where the service-page views came from. Direct means no referrer was recorded."
        info="Referrer domains on service-page views. Campaign rows come from UTM-tagged views, grouped by source and campaign."
        tabs={[
          {
            id: "referrers",
            label: "Referrers",
            chart: (
              <BarList
                items={sourceItems}
                emptyLabel="No form views in this period."
              />
            ),
          },
          {
            id: "campaigns",
            label: "Campaigns",
            chart: (
              <BarList
                items={campaignItems}
                emptyLabel="No UTM-tagged views in this period."
              />
            ),
          },
        ]}
      />

      <AnalyticsCard
        className={analyticsCol(4)}
        title="New vs returning"
        description="Returning means the email had an earlier inquiry with this workspace."
      >
        <StatGrid columns={2}>
          <Stat
            label="New inquiries"
            value={formatNumber(repeat.newInquiries)}
            caption={`${formatPercent(repeat.newWinRate)} win rate`}
          />
          <Stat
            label="Returning inquiries"
            value={formatNumber(repeat.returningInquiries)}
            caption={`${formatPercent(repeat.returningWinRate)} win rate`}
          />
          <Stat
            label="Returning revenue"
            value={formatMoney(repeat.returningRevenueInCents, currency)}
            caption={`${formatPercent(returningShare)} of won value`}
          />
          <Stat
            label="Total won"
            value={formatMoney(repeat.revenueInCents, currency)}
            caption="Accepted value in this period"
          />
        </StatGrid>
      </AnalyticsCard>

      <AnalyticsCard
        className={analyticsCol(4)}
        title="Top customers"
        description="Won value by customer in this period."
        action={
          <Link
            href={getQuotesListHref(props.businessSlug, { status: "accepted" })}
            className="text-sm font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Won quotes
          </Link>
        }
      >
        <BarList
          items={customerItems}
          emptyLabel={
            hasCustomers ? "No won quotes in this period." : "No won quotes yet."
          }
        />
      </AnalyticsCard>
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Live: receivables and quote backlog
// ---------------------------------------------------------------------------

export async function PerformanceLiveRow(props: PerformanceSectionProps) {
  const data = await props.dataPromise;
  const { currency } = data;

  const backlogTotal = data.aging.reduce((sum, bucket) => sum + bucket.count, 0);
  const backlogValue = data.aging.reduce(
    (sum, bucket) => sum + bucket.valueInCents,
    0,
  );
  const hasBacklog = backlogTotal > 0 || data.expiring.count > 0;

  if (!hasBacklog) return null;

  return (
    <AnalyticsRow>
      <AnalyticsCard
        className={analyticsCol(12)}
        title="Open quote backlog"
        description="Unanswered quotes by age since they were sent — the live backlog, not the selected range."
        action={
          <Link
            href={getQuotesListHref(props.businessSlug, { status: "sent" })}
            className="text-sm font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
          >
            Sent quotes
          </Link>
        }
        footer={
          <>
            <span>
              {formatNumber(data.expiring.count)}{" "}
              {data.expiring.count === 1 ? "quote" : "quotes"} worth{" "}
              {formatMoney(data.expiring.valueInCents, currency)} at risk
            </span>
            <span aria-hidden>·</span>
            <span>expiring within 7 days</span>
          </>
        }
        bodyClassName="gap-6 lg:flex-row lg:items-start lg:gap-10"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <span className="meta-label">By age</span>
          {backlogTotal > 0 ? (
            <AgingList
              buckets={data.aging}
              currency={currency}
              emptyLabel="No unanswered quotes."
            />
          ) : (
            <EmptyState label="No unanswered quotes right now." />
          )}
        </div>
        <div className="flex min-w-0 shrink-0 flex-col gap-4 lg:w-64">
          <Stat
            label="Open quotes"
            value={formatNumber(backlogTotal)}
            caption="Sent and still unanswered"
          />
          <Stat
            label="Value at risk"
            value={formatMoney(backlogValue, currency)}
            caption="Total value of the open backlog"
          />
          <Stat
            label="Expiring in 7 days"
            value={formatNumber(data.expiring.count)}
            caption={formatMoney(data.expiring.valueInCents, currency)}
            valueClassName={
              data.expiring.count > 0 ? "text-warning" : undefined
            }
          />
        </div>
      </AnalyticsCard>
    </AnalyticsRow>
  );
}
