import "server-only";

import { and, asc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import {
  getBusinessAnalyticsCacheTags,
  hotBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { withCircuitBreaker } from "@/lib/db/circuit-breaker";
import { db, executeRows } from "@/lib/db/client";
import {
  activityLogs,
  aiAgentSessions,
  analyticsAnnotations,
  analyticsBenchmarks,
  analyticsDailyRollups,
  analyticsEvents,
  analyticsGoalThresholds,
  analyticsScheduledReports,
  approvals,
  businessInquiryForms,
  businessKnowledgeFiles,
  businessMembers,
  businessMemories,
  businesses,
  changeOrders,
  commercialScheduleItems,
  commercialSchedules,
  emailOutbox,
  followUps,
  inquiries,
  invoices,
  payments,
  quoteScopeBlocks,
  quotes,
  user,
} from "@/lib/db/schema";
import type { BusinessPlan } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import {
  getActiveAutoFollowUpCount,
  getMonthlyAutoFollowUpSendCount,
  getMonthlyRequoDocumentSendCount,
} from "@/lib/plans/usage";
import { getMonthlyUsageSummary } from "@/lib/ai/usage-limiter";
import {
  buildAnalyticsBuckets,
  formatBucketLabel,
  type AnalyticsWindow,
} from "@/features/analytics/lib/window";
import { formatDayLabel, formatMonthLabel } from "@/features/analytics/lib/format";
import {
  ANALYTICS_GOAL_METRICS,
  type AnalyticsGoalMetricKey,
} from "@/features/analytics/lib/goal-metrics";
import {
  getBusinessFollowUpsPath,
  getBusinessInquiriesPath,
  getBusinessQuotesPath,
} from "@/features/businesses/routes";
import type {
  AiImpactData,
  AnalyticsAgingBucket,
  AnalyticsAnnotation,
  AnalyticsAttentionItem,
  AnalyticsBenchmarkRow,
  AnalyticsCohortRow,
  AnalyticsFunnelStep,
  AnalyticsGoalRow,
  AnalyticsOutcomeSlice,
  AnalyticsRankedItem,
  AnalyticsScheduledReport,
  AnalyticsSeriesPoint,
  AnalyticsTimingMetric,
  AnalyticsUsageMeter,
  AgentFunnelData,
  AutomationHealthData,
  EmailDeliveryData,
  FollowUpEffectivenessData,
  FollowUpCohort,
  FollowUpHealthData,
  FirstResponseMetric,
  KnowledgeData,
  OperationsData,
  OverviewData,
  OverviewPeriod,
  OverviewReceivables,
  PerformanceData,
  ServicePerformanceRow,
  TeamData,
  TeamMemberRole,
  TeamMemberRow,
  VerticalWorkflowData,
} from "@/features/analytics/types";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const RESPONSE_SLA_HOURS = 24;

function num(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
}

function rate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function todayStartUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Cache-key suffix for a resolved window. Presets are stable for the whole
 * UTC day; custom ranges never reach a cached function.
 */
function windowCacheSuffix(window: AnalyticsWindow): string {
  return [
    window.preset,
    window.bucket,
    toIso(window.since),
    toIso(window.until),
    window.comparison ? "cmp" : "nocmp",
  ].join(":");
}

function emptyOverviewPeriod(): OverviewPeriod {
  return {
    visitors: 0,
    formViews: 0,
    inquiries: 0,
    inquiriesWithQuote: 0,
    quotesSent: 0,
    quotesViewed: 0,
    quotesResponded: 0,
    quotesAccepted: 0,
    quotesRejected: 0,
    quotesExpired: 0,
    winRate: 0,
    acceptanceRate: 0,
    revenueWonInCents: 0,
    quotesWon: 0,
    quotedValueInCents: 0,
    collectedInCents: 0,
    invoicedInCents: 0,
    acceptedValueInCents: 0,
    rejectedValueInCents: 0,
    expiredValueInCents: 0,
  };
}

// ---------------------------------------------------------------------------
// Business metadata
// ---------------------------------------------------------------------------

export type AnalyticsBusinessMeta = {
  currency: string;
  plan: BusinessPlan;
  industryCategory: string | null;
  createdAt: Date;
};

async function getAnalyticsBusinessMetaUncached(
  businessId: string,
): Promise<AnalyticsBusinessMeta> {
  const [row] = await db
    .select({
      currency: businesses.defaultCurrency,
      plan: businesses.plan,
      industryCategory: businesses.industryCategory,
      createdAt: businesses.createdAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return {
    currency: row?.currency ?? "USD",
    plan: (row?.plan as BusinessPlan | null) ?? "free",
    industryCategory: row?.industryCategory ?? null,
    createdAt: row?.createdAt ?? new Date(),
  };
}

export async function getAnalyticsBusinessMeta(
  businessId: string,
): Promise<AnalyticsBusinessMeta> {
  return withCircuitBreaker(`analytics:meta:${businessId}`, () =>
    getAnalyticsBusinessMetaCached(businessId),
  );
}

async function getAnalyticsBusinessMetaCached(
  businessId: string,
): Promise<AnalyticsBusinessMeta> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessAnalyticsCacheTags(businessId));

  return getAnalyticsBusinessMetaUncached(businessId);
}

// ---------------------------------------------------------------------------
// Daily series (rollups + live supplement for today)
// ---------------------------------------------------------------------------

type DailyMetricRow = {
  date: string;
  formViews: number;
  uniqueVisitors: number;
  inquirySubmissions: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesRejected: number;
  revenueCents: number;
};

function emptyDailyRow(date: string): DailyMetricRow {
  return {
    date,
    formViews: 0,
    uniqueVisitors: 0,
    inquirySubmissions: 0,
    quotesSent: 0,
    quotesAccepted: 0,
    quotesRejected: 0,
    revenueCents: 0,
  };
}

async function loadRollupDailies(
  businessId: string,
  sinceIso: string,
  untilIso: string,
): Promise<Map<string, DailyMetricRow>> {
  const rows = await db
    .select({
      date: analyticsDailyRollups.date,
      formViews: analyticsDailyRollups.formViews,
      uniqueVisitors: analyticsDailyRollups.uniqueVisitors,
      inquirySubmissions: analyticsDailyRollups.inquirySubmissions,
      quotesSent: analyticsDailyRollups.quotesSent,
      quotesAccepted: analyticsDailyRollups.quotesAccepted,
      quotesRejected: analyticsDailyRollups.quotesRejected,
      revenueCents: analyticsDailyRollups.revenueCents,
    })
    .from(analyticsDailyRollups)
    .where(
      and(
        eq(analyticsDailyRollups.businessId, businessId),
        gte(analyticsDailyRollups.date, sinceIso),
        lt(analyticsDailyRollups.date, untilIso),
      ),
    )
    .orderBy(asc(analyticsDailyRollups.date));

  const map = new Map<string, DailyMetricRow>();
  for (const row of rows) {
    map.set(row.date, {
      date: row.date,
      formViews: row.formViews,
      uniqueVisitors: row.uniqueVisitors,
      inquirySubmissions: row.inquirySubmissions,
      quotesSent: row.quotesSent,
      quotesAccepted: row.quotesAccepted,
      quotesRejected: row.quotesRejected,
      revenueCents: row.revenueCents,
    });
  }
  return map;
}

/**
 * Today's counters straight from the source tables. Rollups only cover
 * complete past days, so the current (partial) day is always read live.
 */
async function loadLiveDayDaily(
  businessId: string,
  dayStart: Date,
): Promise<DailyMetricRow> {
  const dayStartIso = dayStart.toISOString();
  const row: DailyMetricRow = emptyDailyRow(toIso(dayStart));

  const [viewRows, inquiryRows, quoteRows, acceptedRows, revenueRows] =
    await Promise.all([
      executeRows<{ form_views: string | number; unique_visitors: string | number }>(sql`
        select
          count(*)::int as form_views,
          count(distinct visitor_hash)::int as unique_visitors
        from (
          select ${analyticsEvents.visitorHash} as visitor_hash
          from ${analyticsEvents}
          where ${analyticsEvents.businessId} = ${businessId}
            and ${analyticsEvents.eventType} = 'inquiry_form_viewed'
            and ${analyticsEvents.businessInquiryFormId} is not null
            and ${analyticsEvents.occurredAt} >= ${dayStartIso}
          group by
            ${analyticsEvents.businessInquiryFormId},
            ${analyticsEvents.visitorHash},
            date_trunc('second', ${analyticsEvents.occurredAt})
        ) deduped
      `),
      db
        .select({ value: sql<number>`count(*)` })
        .from(inquiries)
        .where(
          and(
            eq(inquiries.businessId, businessId),
            isNull(inquiries.deletedAt),
            gte(inquiries.submittedAt, dayStart),
          ),
        ),
      db
        .select({
          sent: sql<number>`count(*)`,
          rejected: sql<number>`count(*) filter (where ${quotes.status} = 'rejected')`,
        })
        .from(quotes)
        .where(
          and(
            eq(quotes.businessId, businessId),
            isNull(quotes.deletedAt),
            isNotNull(quotes.sentAt),
            gte(quotes.sentAt, dayStart),
          ),
        ),
      db
        .select({ value: sql<number>`count(*)` })
        .from(quotes)
        .where(
          and(
            eq(quotes.businessId, businessId),
            isNull(quotes.deletedAt),
            gte(quotes.acceptedAt, dayStart),
          ),
        ),
      db
        .select({ value: sql<number>`coalesce(sum(${quotes.totalInCents}), 0)` })
        .from(quotes)
        .where(
          and(
            eq(quotes.businessId, businessId),
            isNull(quotes.deletedAt),
            gte(quotes.acceptedAt, dayStart),
          ),
        ),
    ]);

  row.formViews = num(viewRows[0]?.form_views);
  row.uniqueVisitors = num(viewRows[0]?.unique_visitors);
  row.inquirySubmissions = num(inquiryRows[0]?.value);
  row.quotesSent = num(quoteRows[0]?.sent);
  row.quotesRejected = num(quoteRows[0]?.rejected);
  row.quotesAccepted = num(acceptedRows[0]?.value);
  row.revenueCents = num(revenueRows[0]?.value);
  return row;
}

/**
 * Live per-day metrics for the days the rollup has not covered.
 *
 * `analytics_daily_rollups` only covers the days the nightly rollup job has
 * processed. Anything the job has not reached yet — a workspace seeded with
 * history, a window that predates the job, a fresh install — would read as a
 * flat zero series. This query mirrors the rollup's definitions and is used
 * to fill the days the rollup is missing, so the trend chart always shows the
 * activity that actually happened.
 *
 * Every metric joins onto one date spine, so a day always lands on exactly
 * one row with all of its numbers. Chaining `full outer join`s instead split
 * a day without a form view across several rows, and the reader kept only
 * the last of them.
 *
 * `dates` is the ascending list of `YYYY-MM-DD` days to read.
 */
async function loadLiveDailies(
  businessId: string,
  dates: string[],
): Promise<Map<string, DailyMetricRow>> {
  if (dates.length === 0) return new Map();

  // One comma-joined parameter, split back into the day list in Postgres.
  const dateList = dates.join(",");
  // The scan is bounded to the requested span; the spine keeps the exact
  // days so a sparse list does not pull in the days between them.
  const rangeStart = `${dates[0]!}T00:00:00.000Z`;
  const rangeEnd = `${toIso(addUtcDays(new Date(`${dates[dates.length - 1]!}T00:00:00Z`), 1))}T00:00:00.000Z`;

  const rows = await executeRows<{
    date: string;
    form_views: string | number;
    unique_visitors: string | number;
    inquiry_submissions: string | number;
    quotes_sent: string | number;
    quotes_accepted: string | number;
    quotes_rejected: string | number;
    revenue_cents: string | number;
  }>(sql`
    with dates as (
      select unnest(string_to_array(${dateList}, ',')) as date
    ),
    view_days as (
      select
        to_char(deduped.occurred_at::date, 'YYYY-MM-DD') as date,
        count(*)::int as form_views,
        count(distinct deduped.visitor_hash)::int as unique_visitors
      from (
        select
          date_trunc('second', ${analyticsEvents.occurredAt} at time zone 'UTC') as occurred_at,
          ${analyticsEvents.visitorHash} as visitor_hash
        from ${analyticsEvents}
        where ${analyticsEvents.businessId} = ${businessId}
          and ${analyticsEvents.eventType} = 'inquiry_form_viewed'
          and ${analyticsEvents.businessInquiryFormId} is not null
          and ${analyticsEvents.occurredAt} >= ${rangeStart}
          and ${analyticsEvents.occurredAt} < ${rangeEnd}
        group by 1, 2
      ) deduped
      group by 1
    ),
    inquiry_days as (
      select
        to_char((${inquiries.submittedAt} at time zone 'UTC')::date, 'YYYY-MM-DD') as date,
        count(*)::int as inquiry_submissions
      from ${inquiries}
      where ${inquiries.businessId} = ${businessId}
        and ${inquiries.deletedAt} is null
        and ${inquiries.submittedAt} >= ${rangeStart}
        and ${inquiries.submittedAt} < ${rangeEnd}
      group by 1
    ),
    sent_days as (
      select
        to_char((${quotes.sentAt} at time zone 'UTC')::date, 'YYYY-MM-DD') as date,
        count(*)::int as quotes_sent
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} is not null
        and ${quotes.sentAt} >= ${rangeStart}
        and ${quotes.sentAt} < ${rangeEnd}
      group by 1
    ),
    accepted_days as (
      select
        to_char((${quotes.acceptedAt} at time zone 'UTC')::date, 'YYYY-MM-DD') as date,
        count(*)::int as quotes_accepted,
        coalesce(sum(${quotes.totalInCents}), 0)::bigint as revenue_cents
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.status} = 'accepted'
        and ${quotes.acceptedAt} >= ${rangeStart}
        and ${quotes.acceptedAt} < ${rangeEnd}
      group by 1
    ),
    rejected_days as (
      select
        to_char((${quotes.customerRespondedAt} at time zone 'UTC')::date, 'YYYY-MM-DD') as date,
        count(*)::int as quotes_rejected
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.status} = 'rejected'
        and ${quotes.customerRespondedAt} is not null
        and ${quotes.customerRespondedAt} >= ${rangeStart}
        and ${quotes.customerRespondedAt} < ${rangeEnd}
      group by 1
    )
    select
      d.date,
      coalesce(v.form_views, 0)::int as form_views,
      coalesce(v.unique_visitors, 0)::int as unique_visitors,
      coalesce(i.inquiry_submissions, 0)::int as inquiry_submissions,
      coalesce(s.quotes_sent, 0)::int as quotes_sent,
      coalesce(a.quotes_accepted, 0)::int as quotes_accepted,
      coalesce(r.quotes_rejected, 0)::int as quotes_rejected,
      coalesce(a.revenue_cents, 0)::bigint as revenue_cents
    from dates d
    left join view_days v on v.date = d.date
    left join inquiry_days i on i.date = d.date
    left join sent_days s on s.date = d.date
    left join accepted_days a on a.date = d.date
    left join rejected_days r on r.date = d.date
    order by d.date
  `);

  const map = new Map<string, DailyMetricRow>();
  for (const row of rows) {
    if (!row.date) continue;
    map.set(row.date, {
      date: row.date,
      formViews: num(row.form_views),
      uniqueVisitors: num(row.unique_visitors),
      inquirySubmissions: num(row.inquiry_submissions),
      quotesSent: num(row.quotes_sent),
      quotesAccepted: num(row.quotes_accepted),
      quotesRejected: num(row.quotes_rejected),
      revenueCents: num(row.revenue_cents),
    });
  }
  return map;
}

/**
 * Fills the days the rollup has not processed with live source-table numbers.
 *
 * The rollup stays the fast path; this only runs when the window contains
 * days the job never covered. Only those days are read — the rollup's own
 * numbers are left alone.
 */
async function fillMissingRollupDays(
  businessId: string,
  since: Date,
  until: Date,
  dailies: Map<string, DailyMetricRow>,
): Promise<void> {
  const todayIso = toIso(todayStartUtc());
  const sinceIso = toIso(since);
  const untilIso = toIso(until);

  // Only completed days are expected to have a rollup row; today is always
  // read live.
  const lastCompleted = todayIso < untilIso ? todayIso : untilIso;

  // The rollup writes a row for every business on every day it has processed,
  // so a missing row means the job never reached that day.
  const missing: string[] = [];
  for (
    let cursor = sinceIso;
    cursor < lastCompleted;
    cursor = toIso(addUtcDays(new Date(`${cursor}T00:00:00Z`), 1))
  ) {
    if (!dailies.has(cursor)) missing.push(cursor);
  }

  if (missing.length === 0) return;

  const live = await loadLiveDailies(businessId, missing);
  for (const [date, row] of live) {
    if (!dailies.has(date)) {
      dailies.set(date, row);
    }
  }
}

function sumDailies(
  buckets: ReturnType<typeof buildAnalyticsBuckets>,
  dailies: Map<string, DailyMetricRow>,
): DailyMetricRow[] {
  return buckets.map((bucket) => {
    const startIso = toIso(bucket.start);
    const endIso = toIso(bucket.end);
    const sum = emptyDailyRow(bucket.key);

    for (const daily of dailies.values()) {
      if (daily.date >= startIso && daily.date < endIso) {
        sum.formViews += daily.formViews;
        sum.uniqueVisitors += daily.uniqueVisitors;
        sum.inquirySubmissions += daily.inquirySubmissions;
        sum.quotesSent += daily.quotesSent;
        sum.quotesAccepted += daily.quotesAccepted;
        sum.quotesRejected += daily.quotesRejected;
        sum.revenueCents += daily.revenueCents;
      }
    }

    return sum;
  });
}

async function buildSeries(
  businessId: string,
  window: AnalyticsWindow,
): Promise<AnalyticsSeriesPoint[]> {
  const currentBuckets = buildAnalyticsBuckets(window);
  const currentDailies = await loadRollupDailies(
    businessId,
    toIso(window.since),
    toIso(window.until),
  );
  await fillMissingRollupDays(
    businessId,
    window.since,
    window.until,
    currentDailies,
  );

  const today = todayStartUtc();
  const todayIso = toIso(today);
  if (todayIso >= toIso(window.since) && todayIso < toIso(window.until)) {
    currentDailies.set(todayIso, await loadLiveDayDaily(businessId, today));
  }

  const currentSums = sumDailies(currentBuckets, currentDailies);

  let priorSums: DailyMetricRow[] | null = null;
  if (window.comparison) {
    const priorWindow = {
      since: window.comparison.since,
      until: window.comparison.until,
      bucket: window.bucket,
    };
    const priorBuckets = buildAnalyticsBuckets(priorWindow);
    const priorDailies = await loadRollupDailies(
      businessId,
      toIso(priorWindow.since),
      toIso(priorWindow.until),
    );
    await fillMissingRollupDays(
      businessId,
      priorWindow.since,
      priorWindow.until,
      priorDailies,
    );
    priorSums = sumDailies(priorBuckets, priorDailies);
  }

  return currentBuckets.map((bucket, index) => {
    const current = currentSums[index] ?? emptyDailyRow(bucket.key);
    const prior = priorSums?.[index] ?? null;

    return {
      key: bucket.key,
      label: formatBucketLabel(bucket.key, window.bucket, {
        day: formatDayLabel,
        month: formatMonthLabel,
      }),
      visitors: current.uniqueVisitors,
      formViews: current.formViews,
      inquiries: current.inquirySubmissions,
      quotesSent: current.quotesSent,
      quotesAccepted: current.quotesAccepted,
      quotesRejected: current.quotesRejected,
      revenueInCents: current.revenueCents,
      priorVisitors: prior ? prior.uniqueVisitors : null,
      priorInquiries: prior ? prior.inquirySubmissions : null,
      priorQuotesSent: prior ? prior.quotesSent : null,
      priorRevenueInCents: prior ? prior.revenueCents : null,
    };
  });
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

export async function getOverviewPeriodRows(
  businessId: string,
  since: Date,
  until: Date,
): Promise<OverviewPeriod> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  const sinceDate = toIso(since);
  const untilDate = toIso(until);

  const [views, inquiryRows, quoteRows, acceptedRows, collectedRows, invoicedRows] =
    await Promise.all([
      executeRows<{ form_views: string | number; visitors: string | number }>(sql`
        select
          count(*)::int as form_views,
          count(distinct visitor_hash)::int as visitors
        from (
          select ${analyticsEvents.visitorHash} as visitor_hash
          from ${analyticsEvents}
          where ${analyticsEvents.businessId} = ${businessId}
            and ${analyticsEvents.eventType} = 'inquiry_form_viewed'
            and ${analyticsEvents.businessInquiryFormId} is not null
            and ${analyticsEvents.occurredAt} >= ${sinceIso}
            and ${analyticsEvents.occurredAt} < ${untilIso}
          group by
            ${analyticsEvents.businessInquiryFormId},
            ${analyticsEvents.visitorHash},
            date_trunc('second', ${analyticsEvents.occurredAt})
        ) deduped
      `),
      executeRows<{ inquiries: string | number; with_quote: string | number }>(sql`
        select
          count(*)::int as inquiries,
          count(*) filter (where exists (
            select 1 from ${quotes}
            where ${quotes.inquiryId} = ${inquiries.id}
              and ${quotes.deletedAt} is null
              and ${quotes.sentAt} is not null
          ))::int as with_quote
        from ${inquiries}
        where ${inquiries.businessId} = ${businessId}
          and ${inquiries.deletedAt} is null
          and ${inquiries.submittedAt} >= ${sinceIso}
          and ${inquiries.submittedAt} < ${untilIso}
      `),
      executeRows<{
        sent: string | number;
        viewed: string | number;
        responded: string | number;
        accepted: string | number;
        rejected: string | number;
        expired: string | number;
        quoted_value: string | number;
        accepted_value: string | number;
        rejected_value: string | number;
        expired_value: string | number;
      }>(sql`
        select
          count(*)::int as sent,
          count(*) filter (where ${quotes.publicViewedAt} is not null)::int as viewed,
          count(*) filter (where ${quotes.customerRespondedAt} is not null)::int as responded,
          count(*) filter (where ${quotes.status} = 'accepted')::int as accepted,
          count(*) filter (where ${quotes.status} = 'rejected')::int as rejected,
          count(*) filter (where ${quotes.status} = 'expired')::int as expired,
          coalesce(sum(${quotes.totalInCents}), 0)::bigint as quoted_value,
          coalesce(sum(${quotes.totalInCents}) filter (where ${quotes.status} = 'accepted'), 0)::bigint as accepted_value,
          coalesce(sum(${quotes.totalInCents}) filter (where ${quotes.status} = 'rejected'), 0)::bigint as rejected_value,
          coalesce(sum(${quotes.totalInCents}) filter (where ${quotes.status} = 'expired'), 0)::bigint as expired_value
        from ${quotes}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.sentAt} is not null
          and ${quotes.sentAt} >= ${sinceIso}
          and ${quotes.sentAt} < ${untilIso}
      `),
      executeRows<{ accepted: string | number; value: string | number }>(sql`
        select
          count(*)::int as accepted,
          coalesce(sum(${quotes.totalInCents}), 0)::bigint as value
        from ${quotes}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.status} = 'accepted'
          and ${quotes.acceptedAt} >= ${sinceIso}
          and ${quotes.acceptedAt} < ${untilIso}
      `),
      executeRows<{ collected: string | number }>(sql`
        select coalesce(sum(${payments.amountInCents}), 0)::bigint as collected
        from ${payments}
        where ${payments.businessId} = ${businessId}
          and ${payments.voidedAt} is null
          and ${payments.paymentDate} >= ${sinceDate}
          and ${payments.paymentDate} < ${untilDate}
      `),
      executeRows<{ invoiced: string | number }>(sql`
        select coalesce(sum(${invoices.totalInCents}), 0)::bigint as invoiced
        from ${invoices}
        where ${invoices.businessId} = ${businessId}
          and ${invoices.deletedAt} is null
          and ${invoices.status} not in ('draft', 'voided')
          and ${invoices.issueDate} >= ${sinceDate}
          and ${invoices.issueDate} < ${untilDate}
      `),
    ]);

  const sent = num(quoteRows[0]?.sent);
  const accepted = num(quoteRows[0]?.accepted);
  const rejected = num(quoteRows[0]?.rejected);
  const expired = num(quoteRows[0]?.expired);

  return {
    visitors: num(views[0]?.visitors),
    formViews: num(views[0]?.form_views),
    inquiries: num(inquiryRows[0]?.inquiries),
    inquiriesWithQuote: num(inquiryRows[0]?.with_quote),
    quotesSent: sent,
    quotesViewed: num(quoteRows[0]?.viewed),
    quotesResponded: num(quoteRows[0]?.responded),
    quotesAccepted: accepted,
    quotesRejected: rejected,
    quotesExpired: expired,
    winRate: rate(accepted, accepted + rejected + expired),
    acceptanceRate: rate(accepted, sent),
    revenueWonInCents: num(acceptedRows[0]?.value),
    /** Quotes accepted in the period — the same population as the revenue. */
    quotesWon: num(acceptedRows[0]?.accepted),
    quotedValueInCents: num(quoteRows[0]?.quoted_value),
    collectedInCents: num(collectedRows[0]?.collected),
    invoicedInCents: num(invoicedRows[0]?.invoiced),
    acceptedValueInCents: num(quoteRows[0]?.accepted_value),
    rejectedValueInCents: num(quoteRows[0]?.rejected_value),
    expiredValueInCents: num(quoteRows[0]?.expired_value),
  };
}

type ReceivablesSnapshot = OverviewReceivables;

async function getReceivablesSnapshot(
  businessId: string,
): Promise<ReceivablesSnapshot> {
  const today = toIso(todayStartUtc());

  const [row] = await executeRows<{
    outstanding: string | number;
    outstanding_count: string | number;
    overdue: string | number;
    overdue_count: string | number;
  }>(sql`
    with balances as (
      select
        ${invoices.id} as id,
        ${invoices.totalInCents} as total_in_cents,
        ${invoices.dueDate} as due_date,
        coalesce((
          select sum(${payments.amountInCents})
          from ${payments}
          where ${payments.invoiceId} = ${invoices.id}
            and ${payments.businessId} = ${invoices.businessId}
            and ${payments.voidedAt} is null
        ), 0) as paid
      from ${invoices}
      where ${invoices.businessId} = ${businessId}
        and ${invoices.deletedAt} is null
        and ${invoices.status} not in ('draft', 'voided')
    )
    select
      coalesce(sum(total_in_cents - paid), 0)::bigint as outstanding,
      count(*)::int as outstanding_count,
      coalesce(sum(total_in_cents - paid) filter (where due_date < ${today}), 0)::bigint as overdue,
      count(*) filter (where due_date < ${today})::int as overdue_count
    from balances
    where paid < total_in_cents
  `);

  return {
    outstandingInCents: num(row?.outstanding),
    outstandingCount: num(row?.outstanding_count),
    overdueInCents: num(row?.overdue),
    overdueCount: num(row?.overdue_count),
  };
}

async function getOverviewAttention(
  businessId: string,
  businessSlug: string,
): Promise<{ attention: AnalyticsAttentionItem[]; followUpsPending: number; followUpsOverdue: number }> {
  const today = todayStartUtc();
  const todayIso = toIso(today);
  const soonIso = toIso(addUtcDays(today, 7));
  const staleCutoff = new Date(Date.now() - 48 * 3_600_000);
  const pendingCutoff = new Date(Date.now() - 7 * 86_400_000);

  const [unviewedRows, staleRows, expiringRows, pendingRows, followUpRows] =
    await Promise.all([
      executeRows<{ value: string | number }>(sql`
        select count(*)::int as value
        from ${inquiries}
        where ${inquiries.businessId} = ${businessId}
          and ${inquiries.deletedAt} is null
          and ${inquiries.archivedAt} is null
          and ${inquiries.firstViewedAt} is null
      `),
      executeRows<{ value: string | number }>(sql`
        select count(*)::int as value
        from ${inquiries}
        where ${inquiries.businessId} = ${businessId}
          and ${inquiries.deletedAt} is null
          and ${inquiries.archivedAt} is null
          and ${inquiries.status} in ('new', 'waiting')
          and ${inquiries.firstViewedAt} is not null
          and ${inquiries.submittedAt} < ${staleCutoff.toISOString()}
      `),
      executeRows<{ value: string | number }>(sql`
        select count(*)::int as value
        from ${quotes}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.status} = 'sent'
          and ${quotes.customerRespondedAt} is null
          and ${quotes.validUntil} >= ${todayIso}
          and ${quotes.validUntil} < ${soonIso}
      `),
      executeRows<{ value: string | number }>(sql`
        select count(*)::int as value
        from ${quotes}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.status} = 'sent'
          and ${quotes.customerRespondedAt} is null
          and ${quotes.sentAt} is not null
          and ${quotes.sentAt} < ${pendingCutoff.toISOString()}
      `),
      executeRows<{ pending: string | number; overdue: string | number }>(sql`
        select
          count(*) filter (where ${followUps.status} = 'pending')::int as pending,
          count(*) filter (
            where ${followUps.status} = 'pending' and ${followUps.dueAt} < now()
          )::int as overdue
        from ${followUps}
        where ${followUps.businessId} = ${businessId}
          and ${followUps.deletedAt} is null
      `),
    ]);

  const followUpsPending = num(followUpRows[0]?.pending);
  const followUpsOverdue = num(followUpRows[0]?.overdue);

  const attention: AnalyticsAttentionItem[] = [
    {
      key: "unviewed-inquiries",
      label: "Unviewed inquiries",
      description: "No one has opened these yet.",
      count: num(unviewedRows[0]?.value),
      href: getBusinessInquiriesPath(businessSlug),
      tone: "warning",
      icon: "inquiry",
    },
    {
      key: "stale-inquiries",
      label: "Stale inquiries",
      description: "Viewed but still sitting for more than 2 days.",
      count: num(staleRows[0]?.value),
      href: `${getBusinessInquiriesPath(businessSlug)}?status=waiting`,
      tone: "warning",
      icon: "inquiry",
    },
    {
      key: "quotes-expiring",
      label: "Quotes expiring this week",
      description: "Sent quotes whose validity ends within 7 days.",
      count: num(expiringRows[0]?.value),
      href: `${getBusinessQuotesPath(businessSlug)}?status=sent`,
      tone: "info",
      icon: "quote",
    },
    {
      key: "quotes-awaiting-decision",
      label: "Quotes awaiting a decision",
      description: "Sent more than 7 days ago and still unanswered.",
      count: num(pendingRows[0]?.value),
      href: `${getBusinessQuotesPath(businessSlug)}?status=sent`,
      tone: "warning",
      icon: "quote",
    },
    {
      key: "overdue-follow-ups",
      label: "Overdue follow-ups",
      description: "Past their due date and still pending.",
      count: followUpsOverdue,
      href: `${getBusinessFollowUpsPath(businessSlug)}?view=list&due=overdue`,
      tone: "negative",
      icon: "follow-up",
    },
  ];

  return { attention, followUpsPending, followUpsOverdue };
}

async function getOverviewUsageMeters(
  businessId: string,
  plan: BusinessPlan,
): Promise<AnalyticsUsageMeter[]> {
  const [ai, quoteEmails, autoFollowUpActive, autoFollowUpEmails, agentSessions] =
    await Promise.all([
      getMonthlyUsageSummary(businessId, plan),
      getMonthlyRequoDocumentSendCount(businessId),
      getActiveAutoFollowUpCount(businessId),
      getMonthlyAutoFollowUpSendCount(businessId),
      db
        .select({ value: sql<number>`count(*)` })
        .from(aiAgentSessions)
        .where(
          and(
            eq(aiAgentSessions.businessId, businessId),
            gte(
              aiAgentSessions.createdAt,
              new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)),
            ),
          ),
        ),
    ]);

  const quoteEmailLimit = getUsageLimit(plan, "requoDocumentEmailsPerMonth");
  const activeLimit = getUsageLimit(plan, "activeAutoFollowUpsPerBusiness");
  const agentLimit = getUsageLimit(plan, "agentSessionsPerMonth");

  const meters: AnalyticsUsageMeter[] = [
    {
      key: "ai-drafts",
      label: "AI quote drafts",
      used: ai.used,
      limit: ai.limit,
      unit: "credits",
      hint: "Weighted credits used this month.",
      href: null,
      upgradeFeature: null,
    },
    {
      key: "quote-emails",
      label: "Requo email sends",
      used: quoteEmails,
      limit: quoteEmailLimit,
      unit: "sends",
      hint: "Quote and invoice emails sent through Requo this month.",
      href: null,
      upgradeFeature: null,
    },
    {
      key: "auto-follow-ups",
      label: "Active auto follow-ups",
      used: autoFollowUpActive,
      limit: activeLimit,
      unit: "sequences",
      hint:
        autoFollowUpEmails > 0
          ? `${autoFollowUpEmails} automatic emails sent this month.`
          : "Sequences that send follow-up emails for you.",
      href: null,
      upgradeFeature: activeLimit === 0 ? "autoFollowUps" : null,
    },
  ];

  if (agentLimit !== 0) {
    meters.push({
      key: "agent-sessions",
      label: "AI agent sessions",
      used: num(agentSessions[0]?.value),
      limit: agentLimit,
      unit: "sessions",
      hint: "Public chat sessions handled by your AI agent this month.",
      href: null,
      upgradeFeature: agentLimit === 0 ? "aiAgent" : null,
    });
  }

  return meters;
}

async function computeOverviewData(
  businessId: string,
  businessSlug: string,
  window: AnalyticsWindow,
): Promise<OverviewData> {
  const meta = await getAnalyticsBusinessMetaUncached(businessId);

  const [
    current,
    prior,
    series,
    receivables,
    arAging,
    attention,
    usage,
    firstResponse,
    priorFirstResponse,
  ] = await Promise.all([
    getOverviewPeriodRows(businessId, window.since, window.until),
    window.comparison
      ? getOverviewPeriodRows(businessId, window.comparison.since, window.comparison.until)
      : Promise.resolve(null),
    buildSeries(businessId, window),
    getReceivablesSnapshot(businessId),
    getArAging(businessId),
    getOverviewAttention(businessId, businessSlug),
    getOverviewUsageMeters(businessId, meta.plan),
    getFirstResponseMetric(businessId, window.since, window.until),
    window.comparison
      ? getFirstResponseMetric(
          businessId,
          window.comparison.since,
          window.comparison.until,
        )
      : Promise.resolve(null),
  ]);

  const period = prior ?? emptyOverviewPeriod();

  const funnel: AnalyticsFunnelStep[] = [
    {
      key: "visitors",
      label: "Visitors",
      count: current.visitors,
      href: null,
    },
    {
      key: "inquiries",
      label: "Inquiries",
      count: current.inquiries,
      href: getBusinessInquiriesPath(businessSlug),
    },
    {
      key: "quotes-sent",
      label: "Quotes sent",
      count: current.quotesSent,
      href: `${getBusinessQuotesPath(businessSlug)}?status=sent`,
    },
    {
      key: "won",
      label: "Won",
      count: current.quotesAccepted,
      href: `${getBusinessQuotesPath(businessSlug)}?status=accepted`,
    },
  ];

  const openQuotes = Math.max(
    current.quotesSent - current.quotesAccepted - current.quotesRejected - current.quotesExpired,
    0,
  );
  const outcomeTotal =
    current.quotesAccepted + current.quotesRejected + current.quotesExpired + openQuotes;
  const outcomes: AnalyticsOutcomeSlice[] = [
    {
      key: "accepted",
      label: "Accepted",
      count: current.quotesAccepted,
      share: rate(current.quotesAccepted, outcomeTotal),
      valueInCents: current.acceptedValueInCents,
    },
    {
      key: "open",
      label: "Awaiting decision",
      count: openQuotes,
      share: rate(openQuotes, outcomeTotal),
    },
    {
      key: "rejected",
      label: "Rejected",
      count: current.quotesRejected,
      share: rate(current.quotesRejected, outcomeTotal),
      valueInCents: current.rejectedValueInCents,
    },
    {
      key: "expired",
      label: "Expired",
      count: current.quotesExpired,
      share: rate(current.quotesExpired, outcomeTotal),
      valueInCents: current.expiredValueInCents,
    },
  ];

  return {
    currency: meta.currency,
    current,
    prior: window.comparison ? period : null,
    firstResponse,
    priorFirstResponse,
    series,
    funnel,
    outcomes,
    receivables,
    arAging,
    attention: attention.attention,
    usage,
    hasAnyActivity:
      current.inquiries > 0 ||
      current.invoicedInCents > 0 ||
      current.quotesSent > 0 ||
      current.visitors > 0 ||
      receivables.outstandingCount > 0 ||
      attention.followUpsPending > 0,
  };
}

export async function getOverviewData({
  businessId,
  businessSlug,
  window,
}: {
  businessId: string;
  businessSlug: string;
  window: AnalyticsWindow;
}): Promise<OverviewData> {
  const suffix = windowCacheSuffix(window);

  if (window.preset === "custom") {
    return withCircuitBreaker(`analytics:overview:${businessId}:${suffix}`, () =>
      computeOverviewData(businessId, businessSlug, window),
    );
  }

  return withCircuitBreaker(`analytics:overview:${businessId}:${suffix}`, () =>
    getOverviewDataCached(businessId, businessSlug, window),
  );
}

async function getOverviewDataCached(
  businessId: string,
  businessSlug: string,
  window: AnalyticsWindow,
): Promise<OverviewData> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(
    ...getBusinessAnalyticsCacheTags(businessId, `overview:${windowCacheSuffix(window)}`),
  );

  return computeOverviewData(businessId, businessSlug, window);
}

// ---------------------------------------------------------------------------
// Performance
// ---------------------------------------------------------------------------

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  gcash: "GCash",
  maya: "Maya",
  check: "Check",
  other: "Other",
};

function rankedItem(
  label: string,
  count: number,
  total: number,
  options: { detail?: string; href?: string | null } = {},
): AnalyticsRankedItem {
  return {
    label,
    count,
    detail: options.detail,
    share: rate(count, total),
    href: options.href ?? null,
  };
}

async function getReferrerSources(
  businessId: string,
  since: Date,
  until: Date,
): Promise<AnalyticsRankedItem[]> {
  const rows = await executeRows<{ label: string; count: string | number }>(sql`
    select
      case
        when ${analyticsEvents.metadata} ->> 'referrer' is null
          or ${analyticsEvents.metadata} ->> 'referrer' = ''
          or ${analyticsEvents.metadata} ->> 'referrer' = 'direct'
        then 'Direct'
        else ${analyticsEvents.metadata} ->> 'referrer'
      end as label,
      count(*)::int as count
    from ${analyticsEvents}
    where ${analyticsEvents.businessId} = ${businessId}
      and ${analyticsEvents.eventType} = 'inquiry_form_viewed'
      and ${analyticsEvents.occurredAt} >= ${since.toISOString()}
      and ${analyticsEvents.occurredAt} < ${until.toISOString()}
    group by 1
    order by count(*) desc
    limit 8
  `);

  const total = rows.reduce((sum, row) => sum + num(row.count), 0);
  return rows.map((row) => rankedItem(row.label, num(row.count), total));
}

async function getCampaignRows(
  businessId: string,
  since: Date,
  until: Date,
): Promise<AnalyticsRankedItem[]> {
  const rows = await executeRows<{
    source: string;
    campaign: string;
    count: string | number;
  }>(sql`
    select
      ${analyticsEvents.metadata} ->> 'utmSource' as source,
      coalesce(nullif(${analyticsEvents.metadata} ->> 'utmCampaign', ''), '(none)') as campaign,
      count(*)::int as count
    from ${analyticsEvents}
    where ${analyticsEvents.businessId} = ${businessId}
      and ${analyticsEvents.eventType} = 'inquiry_form_viewed'
      and ${analyticsEvents.metadata} ->> 'utmSource' is not null
      and ${analyticsEvents.metadata} ->> 'utmSource' <> ''
      and ${analyticsEvents.occurredAt} >= ${since.toISOString()}
      and ${analyticsEvents.occurredAt} < ${until.toISOString()}
    group by 1, 2
    order by count(*) desc
    limit 8
  `);

  const total = rows.reduce((sum, row) => sum + num(row.count), 0);
  return rows.map((row) =>
    rankedItem(`${row.source} · ${row.campaign}`, num(row.count), total),
  );
}

async function getServiceRows(
  businessId: string,
  businessSlug: string,
  since: Date,
  until: Date,
): Promise<ServicePerformanceRow[]> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const rows = await executeRows<{
    form_slug: string;
    name: string;
    views: string | number;
    visitors: string | number;
    inquiries: string | number;
    sent: string | number;
    accepted: string | number;
    accepted_value: string | number;
  }>(sql`
    with deduped_views as (
      select
        ${analyticsEvents.businessInquiryFormId} as form_id,
        ${analyticsEvents.visitorHash} as visitor_hash
      from ${analyticsEvents}
      where ${analyticsEvents.businessId} = ${businessId}
        and ${analyticsEvents.eventType} = 'inquiry_form_viewed'
        and ${analyticsEvents.businessInquiryFormId} is not null
        and ${analyticsEvents.occurredAt} >= ${sinceIso}
        and ${analyticsEvents.occurredAt} < ${untilIso}
      group by
        ${analyticsEvents.businessInquiryFormId},
        ${analyticsEvents.visitorHash},
        date_trunc('second', ${analyticsEvents.occurredAt})
    ),
    view_stats as (
      select form_id, count(*)::int as views, count(distinct visitor_hash)::int as visitors
      from deduped_views
      group by form_id
    ),
    inquiry_stats as (
      select ${inquiries.businessInquiryFormId} as form_id, count(*)::int as inquiries
      from ${inquiries}
      where ${inquiries.businessId} = ${businessId}
        and ${inquiries.deletedAt} is null
        and ${inquiries.submittedAt} >= ${sinceIso}
        and ${inquiries.submittedAt} < ${untilIso}
      group by ${inquiries.businessInquiryFormId}
    ),
    quote_stats as (
      select
        ${inquiries.businessInquiryFormId} as form_id,
        count(*)::int as sent,
        count(*) filter (where ${quotes.status} = 'accepted')::int as accepted,
        coalesce(
          sum(${quotes.totalInCents}) filter (where ${quotes.status} = 'accepted'),
          0
        )::bigint as accepted_value
      from ${quotes}
      inner join ${inquiries}
        on ${inquiries.id} = ${quotes.inquiryId}
        and ${inquiries.businessId} = ${quotes.businessId}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} is not null
        and ${quotes.sentAt} >= ${sinceIso}
        and ${quotes.sentAt} < ${untilIso}
      group by ${inquiries.businessInquiryFormId}
    )
    select
      ${businessInquiryForms.slug} as form_slug,
      ${businessInquiryForms.name} as name,
      coalesce(view_stats.views, 0)::int as views,
      coalesce(view_stats.visitors, 0)::int as visitors,
      coalesce(inquiry_stats.inquiries, 0)::int as inquiries,
      coalesce(quote_stats.sent, 0)::int as sent,
      coalesce(quote_stats.accepted, 0)::int as accepted,
      coalesce(quote_stats.accepted_value, 0)::bigint as accepted_value
    from ${businessInquiryForms}
    left join view_stats on view_stats.form_id = ${businessInquiryForms.id}
    left join inquiry_stats on inquiry_stats.form_id = ${businessInquiryForms.id}
    left join quote_stats on quote_stats.form_id = ${businessInquiryForms.id}
    where ${businessInquiryForms.businessId} = ${businessId}
    order by
      coalesce(inquiry_stats.inquiries, 0) desc,
      coalesce(view_stats.visitors, 0) desc,
      ${businessInquiryForms.name} asc
    limit 12
  `);

  return rows.map((row) => {
    const visitors = num(row.visitors);
    const inquiriesCount = num(row.inquiries);
    const sent = num(row.sent);
    const accepted = num(row.accepted);
    const acceptedValue = num(row.accepted_value);

    return {
      formSlug: row.form_slug,
      name: row.name,
      views: num(row.views),
      visitors,
      inquiries: inquiriesCount,
      conversionRate: rate(inquiriesCount, visitors),
      quotesSent: sent,
      accepted,
      winRate: rate(accepted, sent),
      acceptedValueInCents: acceptedValue,
      avgAcceptedValueInCents: accepted > 0 ? Math.round(acceptedValue / accepted) : 0,
    };
  });
}

export type TimingWindow = {
  avgFirstResponseHours: number | null;
  avgTimeToQuoteHours: number | null;
  avgTimeToViewHours: number | null;
  avgTimeToDecisionHours: number | null;
};

/**
 * The activity types that count as a reply to the customer.
 *
 * A response is the team getting back to the customer: a note, a status
 * change, a quote drafted or sent, or work marked complete. Bookkeeping
 * entries (archiving, deleting) are not replies.
 */
const FIRST_RESPONSE_ACTIVITY_TYPES = [
  "inquiry.note_added",
  "inquiry.status_changed",
  "inquiry.updated",
  "quote.created",
  "quote.sent",
  "quote.revised",
  "quote.work_completed",
];

/**
 * Time from an inquiry being submitted to the first team response, plus the
 * number of inquiries the measure is based on.
 *
 * Unanswered inquiries are counted, not dropped: averaging over the answered
 * ones alone makes the number look better as the service gets worse, so the
 * response rate is part of the measure.
 *
 * One query, so the Overview KPI strip can show first-response time without
 * paying for the full turnaround set.
 */
export async function getFirstResponseMetric(
  businessId: string,
  since: Date,
  until: Date,
): Promise<FirstResponseMetric> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const rows = await executeRows<{
    hours: string | number | null;
    answered: string | number;
    total: string | number;
  }>(sql`
    select
      avg(extract(epoch from (response.first_response_at - ${inquiries.submittedAt})) / 3600) as hours,
      count(response.inquiry_id)::int as answered,
      count(*)::int as total
    from ${inquiries}
    left join (
      select ${activityLogs.inquiryId} as inquiry_id, min(${activityLogs.createdAt}) as first_response_at
      from ${activityLogs}
      where ${activityLogs.businessId} = ${businessId}
        and ${activityLogs.actorUserId} is not null
        and ${activityLogs.inquiryId} is not null
        and ${activityLogs.type} in ${FIRST_RESPONSE_ACTIVITY_TYPES.map((type) => sql`${type}`)}
        and ${activityLogs.createdAt} >= ${sinceIso}
      group by ${activityLogs.inquiryId}
    ) response on response.inquiry_id = ${inquiries.id}
    where ${inquiries.businessId} = ${businessId}
      and ${inquiries.deletedAt} is null
      and ${inquiries.submittedAt} >= ${sinceIso}
      and ${inquiries.submittedAt} < ${untilIso}
  `);

  return {
    hours: numOrNull(rows[0]?.hours),
    answered: num(rows[0]?.answered),
    total: num(rows[0]?.total),
  };
}

export async function getTimingForWindow(
  businessId: string,
  since: Date,
  until: Date,
): Promise<TimingWindow> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [responseRows, quoteRows, decisionRows] = await Promise.all([
    executeRows<{ hours: string | number | null }>(sql`
      select avg(extract(epoch from (response.first_response_at - ${inquiries.submittedAt})) / 3600) as hours
      from ${inquiries}
      inner join (
        select ${activityLogs.inquiryId} as inquiry_id, min(${activityLogs.createdAt}) as first_response_at
        from ${activityLogs}
        where ${activityLogs.businessId} = ${businessId}
          and ${activityLogs.actorUserId} is not null
          and ${activityLogs.inquiryId} is not null
          and ${activityLogs.type} in ${FIRST_RESPONSE_ACTIVITY_TYPES.map((type) => sql`${type}`)}
          and ${activityLogs.createdAt} >= ${sinceIso}
        group by ${activityLogs.inquiryId}
      ) response on response.inquiry_id = ${inquiries.id}
      where ${inquiries.businessId} = ${businessId}
        and ${inquiries.deletedAt} is null
        and ${inquiries.submittedAt} >= ${sinceIso}
        and ${inquiries.submittedAt} < ${untilIso}
    `),
    executeRows<{ hours: string | number | null }>(sql`
      select avg(extract(epoch from (quoted.first_quote_at - ${inquiries.submittedAt})) / 3600) as hours
      from ${inquiries}
      inner join (
        select ${quotes.inquiryId} as inquiry_id, min(${quotes.createdAt}) as first_quote_at
        from ${quotes}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.inquiryId} is not null
          and ${quotes.createdAt} >= ${sinceIso}
        group by ${quotes.inquiryId}
      ) quoted on quoted.inquiry_id = ${inquiries.id}
      where ${inquiries.businessId} = ${businessId}
        and ${inquiries.submittedAt} >= ${sinceIso}
        and ${inquiries.submittedAt} < ${untilIso}
    `),
    executeRows<{ view_hours: string | number | null; decision_hours: string | number | null }>(sql`
      select
        avg(extract(epoch from (${quotes.publicViewedAt} - ${quotes.sentAt})) / 3600)
          filter (where ${quotes.publicViewedAt} is not null) as view_hours,
        avg(extract(epoch from (${quotes.customerRespondedAt} - ${quotes.sentAt})) / 3600)
          filter (where ${quotes.customerRespondedAt} is not null) as decision_hours
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} is not null
        and ${quotes.sentAt} >= ${sinceIso}
        and ${quotes.sentAt} < ${untilIso}
    `),
  ]);

  return {
    avgFirstResponseHours: numOrNull(responseRows[0]?.hours),
    avgTimeToQuoteHours: numOrNull(quoteRows[0]?.hours),
    avgTimeToViewHours: numOrNull(decisionRows[0]?.view_hours),
    avgTimeToDecisionHours: numOrNull(decisionRows[0]?.decision_hours),
  };
}

async function getQuoteAging(
  businessId: string,
): Promise<AnalyticsAgingBucket[]> {
  const bucketOrder = ["0–7 days", "8–14 days", "15–30 days", "31+ days"];

  const rows = await executeRows<{
    bucket: string;
    count: string | number;
    value: string | number;
  }>(sql`
    select bucket, count(*)::int as count, coalesce(sum(total_in_cents), 0)::bigint as value
    from (
      select
        ${quotes.totalInCents} as total_in_cents,
        case
          when ${quotes.sentAt} > now() - interval '7 days' then '0–7 days'
          when ${quotes.sentAt} > now() - interval '14 days' then '8–14 days'
          when ${quotes.sentAt} > now() - interval '30 days' then '15–30 days'
          else '31+ days'
        end as bucket
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.status} = 'sent'
        and ${quotes.customerRespondedAt} is null
        and ${quotes.sentAt} is not null
    ) aged
    group by bucket
  `);

  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  return bucketOrder.map((label) => ({
    label,
    count: num(byBucket.get(label)?.count),
    valueInCents: num(byBucket.get(label)?.value),
  }));
}

async function getArAging(businessId: string): Promise<AnalyticsAgingBucket[]> {
  const today = toIso(todayStartUtc());
  const bucketOrder = ["Current", "1–30 days", "31–60 days", "61–90 days", "90+ days"];

  const rows = await executeRows<{
    bucket: string;
    count: string | number;
    value: string | number;
  }>(sql`
    with balances as (
      select
        ${invoices.totalInCents} as total_in_cents,
        ${invoices.dueDate} as due_date,
        coalesce((
          select sum(${payments.amountInCents})
          from ${payments}
          where ${payments.invoiceId} = ${invoices.id}
            and ${payments.businessId} = ${invoices.businessId}
            and ${payments.voidedAt} is null
        ), 0) as paid
      from ${invoices}
      where ${invoices.businessId} = ${businessId}
        and ${invoices.deletedAt} is null
        and ${invoices.status} not in ('draft', 'voided')
    )
    select
      case
        when due_date >= ${today}::date then 'Current'
        when due_date >= ${today}::date - 30 then '1–30 days'
        when due_date >= ${today}::date - 60 then '31–60 days'
        when due_date >= ${today}::date - 90 then '61–90 days'
        else '90+ days'
      end as bucket,
      count(*)::int as count,
      coalesce(sum(total_in_cents - paid), 0)::bigint as value
    from balances
    where paid < total_in_cents
    group by 1
  `);

  const byBucket = new Map(rows.map((row) => [row.bucket, row]));
  return bucketOrder.map((label) => ({
    label,
    count: num(byBucket.get(label)?.count),
    valueInCents: num(byBucket.get(label)?.value),
  }));
}

async function getCollectionsData(
  businessId: string,
  since: Date,
  until: Date,
): Promise<PerformanceData["collections"]> {
  const sinceDate = toIso(since);
  const untilDate = toIso(until);

  const [[paymentRows], [partialRows]] = await Promise.all([
    executeRows<{
      average_days: string | number | null;
      average_days_late: string | number | null;
      on_time: string | number;
      late: string | number;
    }>(sql`
      select
        avg((${payments.paymentDate} - ${invoices.sentAt}::date)) as average_days,
        avg((${payments.paymentDate} - ${invoices.dueDate})) filter (
          where ${payments.paymentDate} > ${invoices.dueDate}
        ) as average_days_late,
        count(*) filter (where ${payments.paymentDate} <= ${invoices.dueDate})::int as on_time,
        count(*) filter (where ${payments.paymentDate} > ${invoices.dueDate})::int as late
      from ${payments}
      inner join ${invoices}
        on ${invoices.id} = ${payments.invoiceId}
        and ${invoices.businessId} = ${payments.businessId}
      where ${payments.businessId} = ${businessId}
        and ${payments.voidedAt} is null
        and ${invoices.sentAt} is not null
        and ${payments.paymentDate} >= ${sinceDate}
        and ${payments.paymentDate} < ${untilDate}
    `),
    executeRows<{ count: string | number }>(sql`
      with balances as (
        select
          ${invoices.totalInCents} as total_in_cents,
          coalesce((
            select sum(${payments.amountInCents})
            from ${payments}
            where ${payments.invoiceId} = ${invoices.id}
              and ${payments.businessId} = ${invoices.businessId}
              and ${payments.voidedAt} is null
          ), 0) as paid
        from ${invoices}
        where ${invoices.businessId} = ${businessId}
          and ${invoices.deletedAt} is null
          and ${invoices.status} not in ('draft', 'voided')
      )
      select count(*)::int as count
      from balances
      where paid > 0 and paid < total_in_cents
    `),
  ]);

  return {
    averageDaysToPay: numOrNull(paymentRows?.average_days),
    averageDaysLate: numOrNull(paymentRows?.average_days_late),
    onTimeCount: num(paymentRows?.on_time),
    lateCount: num(paymentRows?.late),
    partialCount: num(partialRows?.count),
  };
}

async function getPaymentMix(
  businessId: string,
  since: Date,
  until: Date,
): Promise<AnalyticsRankedItem[]> {
  const rows = await executeRows<{
    method: string;
    count: string | number;
    value: string | number;
  }>(sql`
    select
      ${payments.method} as method,
      count(*)::int as count,
      coalesce(sum(${payments.amountInCents}), 0)::bigint as value
    from ${payments}
    where ${payments.businessId} = ${businessId}
      and ${payments.voidedAt} is null
      and ${payments.paymentDate} >= ${toIso(since)}
      and ${payments.paymentDate} < ${toIso(until)}
    group by ${payments.method}
    order by count(*) desc
  `);

  const total = rows.reduce((sum, row) => sum + num(row.count), 0);
  return rows.map((row) =>
    rankedItem(
      PAYMENT_METHOD_LABELS[row.method] ?? row.method,
      num(row.count),
      total,
    ),
  );
}

async function getRepeatBusiness(
  businessId: string,
  since: Date,
  until: Date,
): Promise<PerformanceData["repeat"]> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [inquiryRows, quoteRows, revenueRows] = await Promise.all([
    executeRows<{ total: string | number; returning_count: string | number }>(sql`
      select
        count(*)::int as total,
        count(*) filter (where is_returning)::int as returning_count
      from (
        select
          ${inquiries.customerEmail} is not null and exists (
            select 1 from ${inquiries} prior
            where prior.business_id = ${businessId}
              and prior.deleted_at is null
              and lower(prior.customer_email) = lower(${inquiries.customerEmail})
              and prior.submitted_at < ${sinceIso}
          ) as is_returning
        from ${inquiries}
        where ${inquiries.businessId} = ${businessId}
          and ${inquiries.deletedAt} is null
          and ${inquiries.submittedAt} >= ${sinceIso}
          and ${inquiries.submittedAt} < ${untilIso}
      ) cohort
    `),
    executeRows<{
      is_returning: boolean;
      sent: string | number;
      accepted: string | number;
      decided: string | number;
    }>(sql`
      select
        is_returning,
        count(*)::int as sent,
        count(*) filter (where status = 'accepted')::int as accepted,
        count(*) filter (where status in ('accepted', 'rejected', 'expired'))::int as decided
      from (
        select
          ${quotes.status} as status,
          ${inquiries.customerEmail} is not null and exists (
            select 1 from ${inquiries} prior
            where prior.business_id = ${businessId}
              and prior.deleted_at is null
              and lower(prior.customer_email) = lower(${inquiries.customerEmail})
              and prior.submitted_at < ${sinceIso}
          ) as is_returning
        from ${quotes}
        inner join ${inquiries}
          on ${inquiries.id} = ${quotes.inquiryId}
          and ${inquiries.businessId} = ${quotes.businessId}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.sentAt} is not null
          and ${quotes.sentAt} >= ${sinceIso}
          and ${quotes.sentAt} < ${untilIso}
      ) cohort
      group by is_returning
    `),
    executeRows<{
      returning_value: string | number;
      total_value: string | number;
    }>(sql`
      select
        coalesce(sum(total_in_cents) filter (where is_returning), 0)::bigint as returning_value,
        coalesce(sum(total_in_cents), 0)::bigint as total_value
      from (
        select
          ${quotes.totalInCents} as total_in_cents,
          ${inquiries.customerEmail} is not null and exists (
            select 1 from ${inquiries} prior
            where prior.business_id = ${businessId}
              and prior.deleted_at is null
              and lower(prior.customer_email) = lower(${inquiries.customerEmail})
              and prior.submitted_at < ${sinceIso}
          ) as is_returning
        from ${quotes}
        inner join ${inquiries}
          on ${inquiries.id} = ${quotes.inquiryId}
          and ${inquiries.businessId} = ${quotes.businessId}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.status} = 'accepted'
          and ${quotes.acceptedAt} >= ${sinceIso}
          and ${quotes.acceptedAt} < ${untilIso}
      ) cohort
    `),
  ]);

  const returningQuotes = quoteRows.find((row) => row.is_returning);
  const newQuotes = quoteRows.find((row) => !row.is_returning);
  const totalInquiries = num(inquiryRows[0]?.total);
  const returningInquiries = num(inquiryRows[0]?.returning_count);

  return {
    newInquiries: totalInquiries - returningInquiries,
    returningInquiries,
    newWinRate: rate(num(newQuotes?.accepted), num(newQuotes?.decided)),
    returningWinRate: rate(
      num(returningQuotes?.accepted),
      num(returningQuotes?.decided),
    ),
    returningRevenueInCents: num(revenueRows[0]?.returning_value),
    revenueInCents: num(revenueRows[0]?.total_value),
  };
}

async function getTopCustomers(
  businessId: string,
  businessSlug: string,
  since: Date,
  until: Date,
): Promise<AnalyticsRankedItem[]> {
  const rows = await executeRows<{
    name: string;
    email: string | null;
    count: string | number;
    value: string | number;
  }>(sql`
    select
      ${quotes.customerName} as name,
      ${quotes.customerEmail} as email,
      count(*)::int as count,
      coalesce(sum(${quotes.totalInCents}), 0)::bigint as value
    from ${quotes}
    where ${quotes.businessId} = ${businessId}
      and ${quotes.deletedAt} is null
      and ${quotes.status} = 'accepted'
      and ${quotes.acceptedAt} >= ${since.toISOString()}
      and ${quotes.acceptedAt} < ${until.toISOString()}
    group by ${quotes.customerName}, ${quotes.customerEmail}
    order by value desc
    limit 5
  `);

  // The row ranks by won value (cents) and reports the quote count beside it;
  // the value is never shown as a bare number, so it is carried as cents and
  // formatted by the shared currency formatter at the edge.
  const total = rows.reduce((sum, row) => sum + num(row.value), 0);
  return rows.map((row) => {
    const valueInCents = num(row.value);
    return {
      label: row.name,
      count: num(row.count),
      detail: row.email ?? undefined,
      valueInCents,
      share: rate(valueInCents, total),
      href: `${getBusinessQuotesPath(businessSlug)}?status=accepted`,
    };
  });
}

async function getBenchmarkRows({
  industryCategory,
  sizeTier,
  own,
}: {
  industryCategory: string | null;
  sizeTier: string | null;
  own: {
    formConversionRate: number | null;
    quoteAcceptanceRate: number | null;
    avgResponseHours: number | null;
  };
}): Promise<AnalyticsBenchmarkRow[]> {
  if (!industryCategory) return [];

  const rows = await db
    .select({
      metricKey: analyticsBenchmarks.metricKey,
      sizeTier: analyticsBenchmarks.sizeTier,
      medianValue: analyticsBenchmarks.medianValue,
      businessCount: analyticsBenchmarks.businessCount,
    })
    .from(analyticsBenchmarks)
    .where(eq(analyticsBenchmarks.industryCategory, industryCategory));

  const definitions: Array<{
    key: string;
    label: string;
    yours: number | null;
    format: "percent" | "hours";
    lowerIsBetter: boolean;
  }> = [
    {
      key: "formConversionRate",
      label: "Quotes sent per inquiry",
      yours: own.formConversionRate,
      format: "percent",
      lowerIsBetter: false,
    },
    {
      key: "quoteAcceptanceRate",
      label: "Quote acceptance rate",
      yours: own.quoteAcceptanceRate,
      format: "percent",
      lowerIsBetter: false,
    },
    {
      key: "avgResponseHours",
      label: "Time to quote",
      yours: own.avgResponseHours,
      format: "hours",
      lowerIsBetter: true,
    },
  ];

  return definitions.flatMap((definition) => {
    const matches = rows.filter((row) => row.metricKey === definition.key);
    if (matches.length === 0) return [];

    const preferred =
      (sizeTier
        ? matches.find((row) => row.sizeTier === sizeTier)
        : undefined) ??
      matches.reduce((best, row) =>
        row.businessCount > best.businessCount ? row : best,
      );

    return [
      {
        key: definition.key,
        label: definition.label,
        yours: definition.yours,
        median: preferred.medianValue,
        businessCount: preferred.businessCount,
        format: definition.format,
        lowerIsBetter: definition.lowerIsBetter,
      },
    ];
  });
}

async function getGoalRows(
  businessId: string,
  current: OverviewPeriod,
  timing: TimingWindow,
): Promise<AnalyticsGoalRow[]> {
  const rows = await db
    .select({
      metricKey: analyticsGoalThresholds.metricKey,
      targetValue: analyticsGoalThresholds.targetValue,
    })
    .from(analyticsGoalThresholds)
    .where(eq(analyticsGoalThresholds.businessId, businessId));

  const currents: Record<AnalyticsGoalMetricKey, number> = {
    inquiries: current.inquiries,
    quotesSent: current.quotesSent,
    quotesAccepted: current.quotesAccepted,
    winRate: current.winRate * 100,
    revenueWon: current.revenueWonInCents / 100,
    formConversionRate: rate(current.inquiriesWithQuote, current.inquiries) * 100,
    quoteAcceptanceRate: current.acceptanceRate * 100,
    avgResponseHours: timing.avgTimeToQuoteHours ?? 0,
  };

  const definitions = new Map(
    ANALYTICS_GOAL_METRICS.map((metric) => [
      metric.key,
      {
        label: metric.label,
        current: currents[metric.key],
        format: metric.format,
        lowerIsBetter: metric.lowerIsBetter,
      },
    ]),
  );

  return rows.flatMap((row) => {
    const definition = definitions.get(row.metricKey as AnalyticsGoalMetricKey);
    if (!definition) return [];

    return [
      {
        metricKey: row.metricKey,
        label: definition.label,
        target: row.targetValue,
        current: definition.current,
        format: definition.format,
        lowerIsBetter: definition.lowerIsBetter,
      },
    ];
  });
}

async function getScheduledReportRows(
  businessId: string,
): Promise<AnalyticsScheduledReport[]> {
  const rows = await db
    .select({
      id: analyticsScheduledReports.id,
      recipientEmails: analyticsScheduledReports.recipientEmails,
      schedule: analyticsScheduledReports.schedule,
      timezone: analyticsScheduledReports.timezone,
      enabled: analyticsScheduledReports.enabled,
      lastSentAt: analyticsScheduledReports.lastSentAt,
    })
    .from(analyticsScheduledReports)
    .where(eq(analyticsScheduledReports.businessId, businessId));

  return rows.map((row) => ({
    id: row.id,
    recipientEmails: row.recipientEmails,
    schedule: row.schedule,
    timezone: row.timezone,
    enabled: row.enabled,
    lastSentAt: row.lastSentAt ? row.lastSentAt.toISOString() : null,
  }));
}

async function getAnnotationRows(
  businessId: string,
  since: Date,
  until: Date,
): Promise<AnalyticsAnnotation[]> {
  const rows = await db
    .select({
      id: analyticsAnnotations.id,
      date: analyticsAnnotations.date,
      label: analyticsAnnotations.label,
      color: analyticsAnnotations.color,
    })
    .from(analyticsAnnotations)
    .where(
      and(
        eq(analyticsAnnotations.businessId, businessId),
        gte(analyticsAnnotations.date, toIso(since)),
        lt(analyticsAnnotations.date, toIso(until)),
      ),
    )
    .orderBy(asc(analyticsAnnotations.date));

  return rows;
}

async function computePerformanceData({
  businessId,
  businessSlug,
  window,
  plan,
}: {
  businessId: string;
  businessSlug: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<PerformanceData> {
  const meta = await getAnalyticsBusinessMetaUncached(businessId);
  const comparison = window.comparison;

  const [
    current,
    currentTiming,
    priorTiming,
    series,
    sources,
    campaigns,
    services,
    aging,
    arAging,
    collections,
    paymentMix,
    repeat,
    topCustomers,
    expiringRows,
    discountRows,
    valueRows,
    invoiceValueRows,
    winRateServiceRows,
    winRateSourceRows,
    annotations,
    scheduledReports,
  ] = await Promise.all([
    getOverviewPeriodRows(businessId, window.since, window.until),
    getTimingForWindow(businessId, window.since, window.until),
    comparison
      ? getTimingForWindow(businessId, comparison.since, comparison.until)
      : Promise.resolve(null),
    buildSeries(businessId, window),
    getReferrerSources(businessId, window.since, window.until),
    getCampaignRows(businessId, window.since, window.until),
    getServiceRows(businessId, businessSlug, window.since, window.until),
    getQuoteAging(businessId),
    getArAging(businessId),
    getCollectionsData(businessId, window.since, window.until),
    getPaymentMix(businessId, window.since, window.until),
    getRepeatBusiness(businessId, window.since, window.until),
    getTopCustomers(businessId, businessSlug, window.since, window.until),
    executeRows<{ count: string | number; value: string | number }>(sql`
      select count(*)::int as count, coalesce(sum(${quotes.totalInCents}), 0)::bigint as value
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.status} = 'sent'
        and ${quotes.customerRespondedAt} is null
        and ${quotes.validUntil} >= ${toIso(todayStartUtc())}
        and ${quotes.validUntil} < ${toIso(addUtcDays(todayStartUtc(), 7))}
    `),
    executeRows<{
      quoted: string | number;
      discounted: string | number;
      discount: string | number;
      subtotal: string | number;
    }>(sql`
      select
        count(*)::int as quoted,
        count(*) filter (where ${quotes.discountInCents} > 0)::int as discounted,
        coalesce(sum(${quotes.discountInCents}), 0)::bigint as discount,
        coalesce(sum(${quotes.subtotalInCents}), 0)::bigint as subtotal
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} is not null
        and ${quotes.sentAt} >= ${window.since.toISOString()}
        and ${quotes.sentAt} < ${window.until.toISOString()}
    `),
    executeRows<{
      rejected: string | number;
      expired: string | number;
      avg_accepted: string | number;
    }>(sql`
      select
        coalesce(sum(${quotes.totalInCents}) filter (where ${quotes.status} = 'rejected'), 0)::bigint as rejected,
        coalesce(sum(${quotes.totalInCents}) filter (where ${quotes.status} = 'expired'), 0)::bigint as expired,
        coalesce((
          select avg(accepted.total_in_cents)
          from ${quotes} accepted
          where accepted.business_id = ${businessId}
            and accepted.deleted_at is null
            and accepted.status = 'accepted'
            and accepted.accepted_at >= ${window.since.toISOString()}
            and accepted.accepted_at < ${window.until.toISOString()}
        ), 0)::bigint as avg_accepted
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} is not null
        and ${quotes.sentAt} >= ${window.since.toISOString()}
        and ${quotes.sentAt} < ${window.until.toISOString()}
    `),
    executeRows<{
      invoiced: string | number;
      tax: string | number;
      average: string | number;
    }>(sql`
      select
        coalesce(sum(${invoices.totalInCents}), 0)::bigint as invoiced,
        coalesce(sum(${invoices.taxInCents}), 0)::bigint as tax,
        coalesce(avg(${invoices.totalInCents}), 0)::bigint as average
      from ${invoices}
      where ${invoices.businessId} = ${businessId}
        and ${invoices.deletedAt} is null
        and ${invoices.status} not in ('draft', 'voided')
        and ${invoices.issueDate} >= ${toIso(window.since)}
        and ${invoices.issueDate} < ${toIso(window.until)}
    `),
    executeRows<{
      label: string;
      sent: string | number;
      accepted: string | number;
      decided: string | number;
    }>(sql`
      select
        ${businessInquiryForms.name} as label,
        count(*)::int as sent,
        count(*) filter (where ${quotes.status} = 'accepted')::int as accepted,
        count(*) filter (where ${quotes.status} in ('accepted', 'rejected', 'expired'))::int as decided
      from ${quotes}
      inner join ${inquiries}
        on ${inquiries.id} = ${quotes.inquiryId}
        and ${inquiries.businessId} = ${quotes.businessId}
      inner join ${businessInquiryForms}
        on ${businessInquiryForms.id} = ${inquiries.businessInquiryFormId}
        and ${businessInquiryForms.businessId} = ${quotes.businessId}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} is not null
        and ${quotes.sentAt} >= ${window.since.toISOString()}
        and ${quotes.sentAt} < ${window.until.toISOString()}
      group by ${businessInquiryForms.name}
      having count(*) filter (where ${quotes.status} in ('accepted', 'rejected', 'expired')) > 0
      order by decided desc
      limit 6
    `),
    executeRows<{
      label: string;
      sent: string | number;
      accepted: string | number;
      decided: string | number;
    }>(sql`
      select
        coalesce(nullif(${inquiries.source}, ''), 'Unknown') as label,
        count(*)::int as sent,
        count(*) filter (where ${quotes.status} = 'accepted')::int as accepted,
        count(*) filter (where ${quotes.status} in ('accepted', 'rejected', 'expired'))::int as decided
      from ${quotes}
      inner join ${inquiries}
        on ${inquiries.id} = ${quotes.inquiryId}
        and ${inquiries.businessId} = ${quotes.businessId}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} is not null
        and ${quotes.sentAt} >= ${window.since.toISOString()}
        and ${quotes.sentAt} < ${window.until.toISOString()}
      group by 1
      having count(*) filter (where ${quotes.status} in ('accepted', 'rejected', 'expired')) > 0
      order by decided desc
      limit 6
    `),
    getAnnotationRows(businessId, window.since, window.until),
    getScheduledReportRows(businessId),
  ]);

  const timing: AnalyticsTimingMetric[] = [
    {
      key: "first-response",
      label: "First response",
      description: "Inquiry submitted → first team response.",
      hours: currentTiming.avgFirstResponseHours,
      priorHours: priorTiming?.avgFirstResponseHours ?? null,
    },
    {
      key: "time-to-quote",
      label: "Time to quote",
      description: "Inquiry submitted → first quote drafted.",
      hours: currentTiming.avgTimeToQuoteHours,
      priorHours: priorTiming?.avgTimeToQuoteHours ?? null,
    },
    {
      key: "time-to-view",
      label: "Time to view",
      description: "Quote sent → customer opened it.",
      hours: currentTiming.avgTimeToViewHours,
      priorHours: priorTiming?.avgTimeToViewHours ?? null,
    },
    {
      key: "time-to-decision",
      label: "Time to decision",
      description: "Quote sent → customer accepted or declined.",
      hours: currentTiming.avgTimeToDecisionHours,
      priorHours: priorTiming?.avgTimeToDecisionHours ?? null,
    },
  ];

  const quoteFunnel: AnalyticsFunnelStep[] = [
    {
      key: "sent",
      label: "Sent",
      count: current.quotesSent,
      href: `${getBusinessQuotesPath(businessSlug)}?status=sent`,
    },
    {
      key: "viewed",
      label: "Viewed",
      count: current.quotesViewed,
      href: `${getBusinessQuotesPath(businessSlug)}?status=sent`,
    },
    {
      key: "responded",
      label: "Responded",
      count: current.quotesResponded,
      href: `${getBusinessQuotesPath(businessSlug)}?status=rejected`,
    },
    {
      key: "accepted",
      label: "Accepted",
      count: current.quotesAccepted,
      href: `${getBusinessQuotesPath(businessSlug)}?status=accepted`,
    },
  ];

  const winRateItems = (
    rows: Array<{
      label: string;
      sent: string | number;
      accepted: string | number;
      decided: string | number;
    }>,
  ): AnalyticsRankedItem[] =>
    rows.map((row) => {
      const accepted = num(row.accepted);
      const decided = num(row.decided);
      const winRate = rate(accepted, decided);
      return {
        label: row.label,
        count: Math.round(winRate * 100),
        detail: `${accepted} won of ${decided} decided`,
        share: winRate,
        href: `${getBusinessQuotesPath(businessSlug)}?status=accepted`,
      };
    });

  const discount = discountRows[0];
  const subtotal = num(discount?.subtotal);
  const value = valueRows[0];
  const invoiceValue = invoiceValueRows[0];

  const benchmarks = await getBenchmarkRows({
    industryCategory: meta.industryCategory,
    sizeTier: plan === "business" ? await getSizeTierForBusiness(businessId) : null,
    own: {
      formConversionRate: rate(current.quotesSent, current.inquiries),
      quoteAcceptanceRate: current.acceptanceRate,
      avgResponseHours: currentTiming.avgTimeToQuoteHours,
    },
  });

  const goals = await getGoalRows(businessId, current, currentTiming);

  return {
    currency: meta.currency,
    series,
    sources,
    campaigns,
    services,
    timing,
    quoteFunnel,
    aging,
    expiring: {
      count: num(expiringRows[0]?.count),
      valueInCents: num(expiringRows[0]?.value),
    },
    discounts: {
      quotedCount: num(discount?.quoted),
      discountedCount: num(discount?.discounted),
      totalDiscountInCents: num(discount?.discount),
      averageDiscountPercent: subtotal > 0 ? rate(num(discount?.discount), subtotal) * 100 : 0,
    },
    values: {
      quotedInCents: current.quotedValueInCents,
      acceptedInCents: current.revenueWonInCents,
      rejectedInCents: num(value?.rejected),
      expiredInCents: num(value?.expired),
      averageAcceptedInCents: num(value?.avg_accepted),
      averageInvoiceInCents: num(invoiceValue?.average),
      taxInCents: num(invoiceValue?.tax),
    },
    winRates: {
      byService: winRateItems(winRateServiceRows),
      bySource: winRateItems(winRateSourceRows),
    },
    arAging,
    collections,
    paymentMix,
    repeat,
    topCustomers,
    benchmarks,
    annotations,
    goals,
    scheduledReports,
    hasData:
      current.inquiries > 0 ||
      current.quotesSent > 0 ||
      current.visitors > 0 ||
      current.invoicedInCents > 0,
  };
}

async function getSizeTierForBusiness(businessId: string): Promise<string> {
  const monthStart = new Date(Date.now() - 30 * 86_400_000);
  const [row] = await db
    .select({ value: sql<number>`count(*)` })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.businessId, businessId),
        isNull(inquiries.deletedAt),
        gte(inquiries.submittedAt, monthStart),
      ),
    );

  const monthlyInquiries = num(row?.value);
  if (monthlyInquiries < 50) return "small";
  if (monthlyInquiries <= 200) return "medium";
  return "large";
}

export async function getPerformanceData({
  businessId,
  businessSlug,
  window,
  plan,
}: {
  businessId: string;
  businessSlug: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<PerformanceData> {
  const suffix = windowCacheSuffix(window);

  if (window.preset === "custom") {
    return withCircuitBreaker(`analytics:performance:${businessId}:${suffix}`, () =>
      computePerformanceData({ businessId, businessSlug, window, plan }),
    );
  }

  return withCircuitBreaker(`analytics:performance:${businessId}:${suffix}`, () =>
    getPerformanceDataCached({ businessId, businessSlug, window, plan }),
  );
}

async function getPerformanceDataCached({
  businessId,
  businessSlug,
  window,
  plan,
}: {
  businessId: string;
  businessSlug: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<PerformanceData> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(
    ...getBusinessAnalyticsCacheTags(businessId, `performance:${windowCacheSuffix(window)}`),
  );

  return computePerformanceData({ businessId, businessSlug, window, plan });
}

// ---------------------------------------------------------------------------
// Operations
// ---------------------------------------------------------------------------

async function getFollowUpHealth(
  businessId: string,
  since: Date,
  until: Date,
): Promise<FollowUpHealthData> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [row] = await executeRows<{
    pending: string | number;
    overdue: string | number;
    completed: string | number;
    skipped: string | number;
    on_time: string | number;
    avg_hours: string | number | null;
  }>(sql`
    select
      count(*) filter (where ${followUps.status} = 'pending')::int as pending,
      count(*) filter (
        where ${followUps.status} = 'pending' and ${followUps.dueAt} < now()
      )::int as overdue,
      count(*) filter (
        where ${followUps.completedAt} >= ${sinceIso}
          and ${followUps.completedAt} < ${untilIso}
      )::int as completed,
      count(*) filter (
        where ${followUps.skippedAt} >= ${sinceIso}
          and ${followUps.skippedAt} < ${untilIso}
      )::int as skipped,
      count(*) filter (
        where ${followUps.completedAt} >= ${sinceIso}
          and ${followUps.completedAt} < ${untilIso}
          and ${followUps.completedAt} <= ${followUps.dueAt}
      )::int as on_time,
      avg(extract(epoch from (${followUps.completedAt} - ${followUps.createdAt})) / 3600)
        filter (
          where ${followUps.completedAt} >= ${sinceIso}
            and ${followUps.completedAt} < ${untilIso}
        ) as avg_hours
    from ${followUps}
    where ${followUps.businessId} = ${businessId}
      and ${followUps.deletedAt} is null
  `);

  const completed = num(row?.completed);
  const skipped = num(row?.skipped);

  return {
    pending: num(row?.pending),
    overdue: num(row?.overdue),
    completed,
    skipped,
    completionRate: rate(completed, completed + skipped),
    onTimeRate: completed > 0 ? rate(num(row?.on_time), completed) : 0,
    averageCompletionHours: numOrNull(row?.avg_hours),
  };
}

async function getFollowUpEffectiveness(
  businessId: string,
  since: Date,
  until: Date,
): Promise<FollowUpEffectivenessData> {
  const rows = await executeRows<{
    has_follow_up: boolean;
    sent: string | number;
    responded: string | number;
    accepted: string | number;
  }>(sql`
    select
      exists (
        select 1 from ${followUps}
        where ${followUps.deletedAt} is null
          and (
            ${followUps.quoteId} = ${quotes.id}
            or (
              ${followUps.inquiryId} is not null
              and ${followUps.inquiryId} = ${quotes.inquiryId}
            )
          )
      ) as has_follow_up,
      count(*)::int as sent,
      count(*) filter (where ${quotes.customerRespondedAt} is not null)::int as responded,
      count(*) filter (where ${quotes.status} = 'accepted')::int as accepted
    from ${quotes}
    where ${quotes.businessId} = ${businessId}
      and ${quotes.deletedAt} is null
      and ${quotes.sentAt} >= ${since.toISOString()}
      and ${quotes.sentAt} < ${until.toISOString()}
    group by 1
  `);

  const emptyCohort = (): FollowUpCohort => ({
    sent: 0,
    responded: 0,
    responseRate: 0,
    accepted: 0,
    acceptanceRate: 0,
  });
  const withFollowUp = emptyCohort();
  const withoutFollowUp = emptyCohort();

  for (const row of rows) {
    const target = row.has_follow_up ? withFollowUp : withoutFollowUp;
    target.sent = num(row.sent);
    target.responded = num(row.responded);
    target.accepted = num(row.accepted);
    target.responseRate = rate(target.responded, target.sent);
    target.acceptanceRate = rate(target.accepted, target.sent);
  }

  return { withFollowUp, withoutFollowUp };
}

const AUTOMATION_ATTEMPT_BUCKETS = ["0", "1", "2", "3+"] as const;

async function getAutomationHealth(
  businessId: string,
  plan: BusinessPlan,
  since: Date,
  until: Date,
): Promise<AutomationHealthData> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [activeSequences, attemptRows, stoppedRows, emailRows] = await Promise.all([
    getActiveAutoFollowUpCount(businessId),
    executeRows<{ bucket: string; count: string | number }>(sql`
      select
        case
          when ${quotes.autoFollowUpAttempts} <= 0 then '0'
          when ${quotes.autoFollowUpAttempts} = 1 then '1'
          when ${quotes.autoFollowUpAttempts} = 2 then '2'
          else '3+'
        end as bucket,
        count(*)::int as count
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.autoFollowUpEnabled} = true
      group by 1
    `),
    executeRows<{ label: string; count: string | number }>(sql`
      select
        case
          when ${quotes.publicViewedAt} is not null then 'Quote viewed'
          when ${quotes.customerRespondedAt} is not null then 'Customer responded'
          when ${quotes.autoFollowUpAttempts} >= ${quotes.autoFollowUpMaxAttempts}
            then 'Attempts used'
          else 'Stopped manually'
        end as label,
        count(*)::int as count
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.autoFollowUpEnabled} = true
        and (
          (
            ${quotes.autoFollowUpStoppedAt} >= ${sinceIso}
            and ${quotes.autoFollowUpStoppedAt} < ${untilIso}
          )
          or (
            ${quotes.autoFollowUpStoppedAt} is null
            and ${quotes.autoFollowUpAttempts} >= ${quotes.autoFollowUpMaxAttempts}
            and ${quotes.autoFollowUpLastSentAt} >= ${sinceIso}
          )
        )
      group by 1
      order by count(*) desc
    `),
    executeRows<{ count: string | number }>(sql`
      select count(*)::int as count
      from ${activityLogs}
      where ${activityLogs.businessId} = ${businessId}
        and ${activityLogs.type} = 'quote.auto_follow_up_sent'
        and ${activityLogs.createdAt} >= ${sinceIso}
        and ${activityLogs.createdAt} < ${untilIso}
    `),
  ]);

  const attemptsByBucket = new Map(
    attemptRows.map((row) => [row.bucket, num(row.count)]),
  );
  const attemptsTotal = AUTOMATION_ATTEMPT_BUCKETS.reduce(
    (sum, bucket) => sum + (attemptsByBucket.get(bucket) ?? 0),
    0,
  );
  const attempts: AnalyticsRankedItem[] = AUTOMATION_ATTEMPT_BUCKETS.map((bucket) => {
    const count = attemptsByBucket.get(bucket) ?? 0;
    return rankedItem(bucket, count, attemptsTotal);
  });

  const stoppedTotal = stoppedRows.reduce((sum, row) => sum + num(row.count), 0);
  const stopped: AnalyticsRankedItem[] = stoppedRows.map((row) =>
    rankedItem(row.label, num(row.count), stoppedTotal),
  );

  return {
    activeSequences,
    activeLimit: getUsageLimit(plan, "activeAutoFollowUpsPerBusiness"),
    emailsSent: num(emailRows[0]?.count),
    quotesWithAttempts: attemptsTotal - (attemptsByBucket.get("0") ?? 0),
    attempts,
    stopped,
  };
}

type AiImpactResult = {
  impact: AiImpactData;
  readinessBlocked: number;
};

async function getAiImpact(
  businessId: string,
  since: Date,
  until: Date,
): Promise<AiImpactResult> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [draftRows, sentRows] = await Promise.all([
    executeRows<{
      drafted: string | number;
      drafted_sent: string | number;
      missing_info: string | number;
      acknowledged: string | number;
      ready: string | number;
      needs_confirmation: string | number;
      scope_only: string | number;
      blocked: string | number;
    }>(sql`
      select
        count(*) filter (where ${quotes.aiGenerationId} is not null)::int as drafted,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null
            and ${quotes.sentAt} is not null
        )::int as drafted_sent,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null
            and jsonb_array_length(coalesce(${quotes.aiMissingInfo}, '[]'::jsonb)) > 0
        )::int as missing_info,
        count(*) filter (
          where ${quotes.aiAcknowledgedAt} >= ${sinceIso}
            and ${quotes.aiAcknowledgedAt} < ${untilIso}
        )::int as acknowledged,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null
            and ${quotes.aiReadiness} = 'ready'
        )::int as ready,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null
            and ${quotes.aiReadiness} = 'needs_confirmation'
        )::int as needs_confirmation,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null
            and ${quotes.aiReadiness} = 'scope_only'
        )::int as scope_only,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null
            and ${quotes.aiReadiness} = 'needs_confirmation'
            and ${quotes.aiAcknowledgedAt} is null
            and ${quotes.sentAt} is null
        )::int as blocked
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.createdAt} >= ${sinceIso}
        and ${quotes.createdAt} < ${untilIso}
    `),
    executeRows<{
      ai_sent: string | number;
      ai_accepted: string | number;
      ai_decided: string | number;
      manual_sent: string | number;
      manual_accepted: string | number;
      manual_decided: string | number;
    }>(sql`
      select
        count(*) filter (where ${quotes.aiGenerationId} is not null)::int as ai_sent,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null and ${quotes.status} = 'accepted'
        )::int as ai_accepted,
        count(*) filter (
          where ${quotes.aiGenerationId} is not null
            and ${quotes.status} in ('accepted', 'rejected', 'expired')
        )::int as ai_decided,
        count(*) filter (where ${quotes.aiGenerationId} is null)::int as manual_sent,
        count(*) filter (
          where ${quotes.aiGenerationId} is null and ${quotes.status} = 'accepted'
        )::int as manual_accepted,
        count(*) filter (
          where ${quotes.aiGenerationId} is null
            and ${quotes.status} in ('accepted', 'rejected', 'expired')
        )::int as manual_decided
      from ${quotes}
      where ${quotes.businessId} = ${businessId}
        and ${quotes.deletedAt} is null
        and ${quotes.sentAt} >= ${sinceIso}
        and ${quotes.sentAt} < ${untilIso}
    `),
  ]);

  const draft = draftRows[0];
  const sent = sentRows[0];

  const drafted = num(draft?.drafted);
  const readinessTotal =
    num(draft?.ready) + num(draft?.needs_confirmation) + num(draft?.scope_only);
  const readiness: AnalyticsRankedItem[] = [
    rankedItem("Ready", num(draft?.ready), readinessTotal),
    rankedItem(
      "Needs confirmation",
      num(draft?.needs_confirmation),
      readinessTotal,
    ),
    rankedItem("Scope only", num(draft?.scope_only), readinessTotal),
  ];

  const aiSent = num(sent?.ai_sent);
  const manualSent = num(sent?.manual_sent);

  return {
    impact: {
      drafted,
      aiSent,
      aiAccepted: num(sent?.ai_accepted),
      aiWinRate: rate(num(sent?.ai_accepted), num(sent?.ai_decided)),
      manualSent,
      manualAccepted: num(sent?.manual_accepted),
      manualWinRate: rate(num(sent?.manual_accepted), num(sent?.manual_decided)),
      aiShare: rate(aiSent, aiSent + manualSent),
      draftToSentRate: rate(num(draft?.drafted_sent), drafted),
      missingInfoDetected: num(draft?.missing_info),
      acknowledged: num(draft?.acknowledged),
      readiness,
    },
    readinessBlocked: num(draft?.blocked),
  };
}

async function getAgentFunnel(
  businessId: string,
  since: Date,
  until: Date,
): Promise<AgentFunnelData> {
  const [row] = await executeRows<{
    sessions: string | number;
    captured: string | number;
    handoffs: string | number;
    abandoned: string | number;
    active: string | number;
  }>(sql`
    select
      count(*)::int as sessions,
      count(*) filter (where ${aiAgentSessions.inquiryId} is not null)::int as captured,
      count(*) filter (where ${aiAgentSessions.status} = 'human_handoff')::int as handoffs,
      count(*) filter (where ${aiAgentSessions.status} = 'abandoned')::int as abandoned,
      count(*) filter (where ${aiAgentSessions.status} = 'active')::int as active
    from ${aiAgentSessions}
    where ${aiAgentSessions.businessId} = ${businessId}
      and ${aiAgentSessions.createdAt} >= ${since.toISOString()}
      and ${aiAgentSessions.createdAt} < ${until.toISOString()}
  `);

  const sessions = num(row?.sessions);
  return {
    sessions,
    captured: num(row?.captured),
    handoffs: num(row?.handoffs),
    abandoned: num(row?.abandoned),
    active: num(row?.active),
    captureRate: rate(num(row?.captured), sessions),
  };
}

type ReadinessSnapshot = {
  missingInfoDetected: number;
  readinessBlocked: number;
  readinessCompleted: number;
};

async function getKnowledgeData(
  businessId: string,
  plan: BusinessPlan,
  readiness: ReadinessSnapshot,
): Promise<KnowledgeData> {
  const [row] = await executeRows<{
    files: string | number;
    memories: string | number;
  }>(sql`
    select
      (select count(*) from ${businessKnowledgeFiles}
        where ${businessKnowledgeFiles.businessId} = ${businessId})::int as files,
      (select count(*) from ${businessMemories}
        where ${businessMemories.businessId} = ${businessId})::int as memories
  `);

  return {
    sources: num(row?.files) + num(row?.memories),
    limit: getUsageLimit(plan, "knowledgeSourcesPerBusiness"),
    missingInfoDetected: readiness.missingInfoDetected,
    readinessBlocked: readiness.readinessBlocked,
    readinessCompleted: readiness.readinessCompleted,
  };
}

async function getEmailDelivery(
  businessId: string,
  since: Date,
  until: Date,
): Promise<EmailDeliveryData> {
  const [row] = await executeRows<{
    sent: string | number;
    failed: string | number;
    pending: string | number;
  }>(sql`
    select
      count(*) filter (where ${emailOutbox.status} = 'sent')::int as sent,
      count(*) filter (where ${emailOutbox.status} = 'failed')::int as failed,
      count(*) filter (
        where ${emailOutbox.status} in ('pending', 'sending', 'unknown')
      )::int as pending
    from ${emailOutbox}
    where ${emailOutbox.businessId} = ${businessId}
      and ${emailOutbox.createdAt} >= ${since.toISOString()}
      and ${emailOutbox.createdAt} < ${until.toISOString()}
  `);

  const sent = num(row?.sent);
  const failed = num(row?.failed);

  return {
    sent,
    failed,
    pending: num(row?.pending),
    deliveredRate: rate(sent, sent + failed),
  };
}

async function getVerticalWorkflows(
  businessId: string,
  since: Date,
  until: Date,
  readiness: { blocked: number; completed: number },
): Promise<VerticalWorkflowData> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  const today = toIso(todayStartUtc());

  const [approvalRows, changeOrderRows, scheduleRows, scheduleValueRows, scopeRows] =
    await Promise.all([
      executeRows<{
        requested: string | number;
        approved: string | number;
        changes_requested: string | number;
        expired: string | number;
        avg_hours: string | number | null;
      }>(sql`
        select
          count(*) filter (
            where ${approvals.createdAt} >= ${sinceIso}
              and ${approvals.createdAt} < ${untilIso}
          )::int as requested,
          count(*) filter (
            where ${approvals.state} = 'approved'
              and ${approvals.decidedAt} >= ${sinceIso}
              and ${approvals.decidedAt} < ${untilIso}
          )::int as approved,
          count(*) filter (
            where ${approvals.state} = 'changes_requested'
              and ${approvals.decidedAt} >= ${sinceIso}
              and ${approvals.decidedAt} < ${untilIso}
          )::int as changes_requested,
          count(*) filter (
            where ${approvals.state} = 'expired'
              and ${approvals.decidedAt} >= ${sinceIso}
              and ${approvals.decidedAt} < ${untilIso}
          )::int as expired,
          avg(extract(epoch from (${approvals.decidedAt} - ${approvals.createdAt})) / 3600)
            filter (
              where ${approvals.decidedAt} >= ${sinceIso}
                and ${approvals.decidedAt} < ${untilIso}
            ) as avg_hours
        from ${approvals}
        where ${approvals.businessId} = ${businessId}
      `),
      executeRows<{
        created: string | number;
        approved: string | number;
        rejected: string | number;
        withdrawn: string | number;
        approved_value: string | number;
      }>(sql`
        select
          count(*) filter (
            where ${changeOrders.createdAt} >= ${sinceIso}
              and ${changeOrders.createdAt} < ${untilIso}
          )::int as created,
          count(*) filter (
            where ${changeOrders.state} = 'approved'
              and ${changeOrders.decidedAt} >= ${sinceIso}
              and ${changeOrders.decidedAt} < ${untilIso}
          )::int as approved,
          count(*) filter (
            where ${changeOrders.state} = 'rejected'
              and ${changeOrders.decidedAt} >= ${sinceIso}
              and ${changeOrders.decidedAt} < ${untilIso}
          )::int as rejected,
          count(*) filter (
            where ${changeOrders.state} = 'withdrawn'
              and ${changeOrders.updatedAt} >= ${sinceIso}
              and ${changeOrders.updatedAt} < ${untilIso}
          )::int as withdrawn,
          coalesce(
            sum(${changeOrders.priceDeltaCents}) filter (
              where ${changeOrders.state} = 'approved'
                and ${changeOrders.decidedAt} >= ${sinceIso}
                and ${changeOrders.decidedAt} < ${untilIso}
            ),
            0
          )::bigint as approved_value
        from ${changeOrders}
        where ${changeOrders.businessId} = ${businessId}
      `),
      executeRows<{
        created: string | number;
        accepted: string | number;
      }>(sql`
        select
          count(*) filter (
            where ${commercialSchedules.createdAt} >= ${sinceIso}
              and ${commercialSchedules.createdAt} < ${untilIso}
          )::int as created,
          count(*) filter (
            where ${commercialSchedules.createdAt} >= ${sinceIso}
              and ${commercialSchedules.createdAt} < ${untilIso}
              and ${commercialSchedules.state} = 'accepted'
          )::int as accepted
        from ${commercialSchedules}
        where ${commercialSchedules.businessId} = ${businessId}
      `),
      executeRows<{ value: string | number }>(sql`
        select coalesce(sum(${commercialScheduleItems.computedAmountCents}), 0)::bigint as value
        from ${commercialScheduleItems}
        inner join ${commercialSchedules}
          on ${commercialSchedules.id} = ${commercialScheduleItems.scheduleId}
        where ${commercialScheduleItems.businessId} = ${businessId}
          and ${commercialSchedules.state} = 'accepted'
          and ${commercialScheduleItems.dueDate} >= ${today}
      `),
      executeRows<{
        added: string | number;
        required_missing: string | number;
        waivers: string | number;
      }>(sql`
        select
          count(*) filter (
            where ${quoteScopeBlocks.createdAt} >= ${sinceIso}
              and ${quoteScopeBlocks.createdAt} < ${untilIso}
          )::int as added,
          count(*) filter (
            where ${quoteScopeBlocks.required} = true
              and ${quoteScopeBlocks.state} = 'incomplete'
          )::int as required_missing,
          count(*) filter (
            where ${quoteScopeBlocks.state} = 'waived'
              and ${quoteScopeBlocks.waivedAt} >= ${sinceIso}
              and ${quoteScopeBlocks.waivedAt} < ${untilIso}
          )::int as waivers
        from ${quoteScopeBlocks}
        where ${quoteScopeBlocks.businessId} = ${businessId}
      `),
    ]);

  const approval = approvalRows[0];
  const approved = num(approval?.approved);
  const changesRequested = num(approval?.changes_requested);
  const expired = num(approval?.expired);

  const schedule = scheduleRows[0];
  const schedulesCreated = num(schedule?.created);

  return {
    approvals: {
      requested: num(approval?.requested),
      approved,
      changesRequested,
      expired,
      approvalRate: rate(approved, approved + changesRequested + expired),
      averageDecisionHours: numOrNull(approval?.avg_hours),
    },
    changeOrders: {
      created: num(changeOrderRows[0]?.created),
      approved: num(changeOrderRows[0]?.approved),
      rejected: num(changeOrderRows[0]?.rejected),
      withdrawn: num(changeOrderRows[0]?.withdrawn),
      approvedValueInCents: num(changeOrderRows[0]?.approved_value),
    },
    schedules: {
      created: schedulesCreated,
      accepted: num(schedule?.accepted),
      adoptionRate: rate(num(schedule?.accepted), schedulesCreated),
      upcomingValueInCents: num(scheduleValueRows[0]?.value),
    },
    scope: {
      blocksAdded: num(scopeRows[0]?.added),
      requiredMissing: num(scopeRows[0]?.required_missing),
      waivers: num(scopeRows[0]?.waivers),
      readinessBlocked: readiness.blocked,
      readinessCompleted: readiness.completed,
    },
  };
}

async function computeOperationsData({
  businessId,
  window,
  plan,
}: {
  businessId: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<OperationsData> {
  const meta = await getAnalyticsBusinessMetaUncached(businessId);
  const { since, until } = window;

  const [followUp, effectiveness, automation, aiResult, agent, email] = await Promise.all([
    getFollowUpHealth(businessId, since, until),
    getFollowUpEffectiveness(businessId, since, until),
    getAutomationHealth(businessId, plan, since, until),
    getAiImpact(businessId, since, until),
    getAgentFunnel(businessId, since, until),
    getEmailDelivery(businessId, since, until),
  ]);

  const ai = aiResult.impact;
  const readiness: ReadinessSnapshot = {
    missingInfoDetected: ai.missingInfoDetected,
    readinessBlocked: aiResult.readinessBlocked,
    readinessCompleted: ai.acknowledged,
  };

  const [knowledge, verticals] = await Promise.all([
    getKnowledgeData(businessId, meta.plan, readiness),
    getVerticalWorkflows(businessId, since, until, {
      blocked: readiness.readinessBlocked,
      completed: readiness.readinessCompleted,
    }),
  ]);

  return {
    currency: meta.currency,
    followUp,
    effectiveness,
    automation,
    ai,
    agent,
    knowledge,
    email,
    verticals,
    hasData:
      followUp.pending + followUp.completed + followUp.skipped > 0 ||
      effectiveness.withFollowUp.sent + effectiveness.withoutFollowUp.sent > 0 ||
      automation.emailsSent > 0 ||
      ai.drafted > 0 ||
      agent.sessions > 0 ||
      email.sent + email.failed + email.pending > 0 ||
      verticals.approvals.requested > 0 ||
      verticals.changeOrders.created > 0 ||
      verticals.schedules.created > 0 ||
      verticals.scope.blocksAdded > 0,
  };
}

export async function getOperationsData({
  businessId,
  window,
  plan,
}: {
  businessId: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<OperationsData> {
  const suffix = windowCacheSuffix(window);

  if (window.preset === "custom") {
    return withCircuitBreaker(`analytics:operations:${businessId}:${suffix}`, () =>
      computeOperationsData({ businessId, window, plan }),
    );
  }

  return withCircuitBreaker(`analytics:operations:${businessId}:${suffix}`, () =>
    getOperationsDataCached({ businessId, window, plan }),
  );
}

async function getOperationsDataCached({
  businessId,
  window,
  plan,
}: {
  businessId: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<OperationsData> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(
    ...getBusinessAnalyticsCacheTags(businessId, `operations:${windowCacheSuffix(window)}`),
  );

  return computeOperationsData({ businessId, window, plan });
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

const TEAM_MONTH_COUNT = 6;

type MonthBucket = { key: string; label: string; start: Date };

function recentMonthBuckets(count: number, now = new Date()): MonthBucket[] {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const buckets: MonthBucket[] = [];

  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const monthStart = new Date(
      Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - offset, 1),
    );
    buckets.push({
      key: toIso(monthStart).slice(0, 7),
      label: formatMonthLabel(monthStart),
      start: monthStart,
    });
  }

  return buckets;
}

async function getTeamMemberRows(businessId: string): Promise<TeamMemberRow[]> {
  const rows = await db
    .select({
      userId: businessMembers.userId,
      name: user.name,
      email: user.email,
      role: businessMembers.role,
    })
    .from(businessMembers)
    .innerJoin(user, eq(user.id, businessMembers.userId))
    .where(eq(businessMembers.businessId, businessId));

  return rows
    .map((row) => ({
      userId: row.userId,
      name: row.name || row.email,
      email: row.email,
      role: row.role as TeamMemberRole,
      inquiriesViewed: 0,
      quotesSent: 0,
      valueWonInCents: 0,
      followUpsCompleted: 0,
      winRate: null,
      averageResponseHours: null,
      slaBreaches: 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getTeamInquiryViews(
  businessId: string,
  since: Date,
  until: Date,
): Promise<
  Array<{
    userId: string;
    viewed: number;
    averageHours: number | null;
    breaches: number;
  }>
> {
  const rows = await executeRows<{
    user_id: string;
    viewed: string | number;
    avg_hours: string | number | null;
    breaches: string | number;
  }>(sql`
    select
      ${inquiries.firstViewedBy} as user_id,
      count(*)::int as viewed,
      avg(extract(epoch from (${inquiries.firstViewedAt} - ${inquiries.submittedAt})) / 3600)
        as avg_hours,
      count(*) filter (
        where ${inquiries.firstViewedAt} > ${inquiries.submittedAt} + interval '24 hours'
      )::int as breaches
    from ${inquiries}
    where ${inquiries.businessId} = ${businessId}
      and ${inquiries.deletedAt} is null
      and ${inquiries.firstViewedBy} is not null
      and ${inquiries.firstViewedAt} >= ${since.toISOString()}
      and ${inquiries.firstViewedAt} < ${until.toISOString()}
    group by ${inquiries.firstViewedBy}
  `);

  return rows.map((row) => ({
    userId: row.user_id,
    viewed: num(row.viewed),
    averageHours: numOrNull(row.avg_hours),
    breaches: num(row.breaches),
  }));
}

async function getTeamQuoteActivity(
  businessId: string,
  since: Date,
  until: Date,
): Promise<
  Array<{
    userId: string;
    sent: number;
    accepted: number;
    decided: number;
    valueWonInCents: number;
  }>
> {
  const rows = await executeRows<{
    user_id: string;
    sent: string | number;
    accepted: string | number;
    decided: string | number;
    value: string | number;
  }>(sql`
    with attributed as (
      select
        ${activityLogs.quoteId} as quote_id,
        (array_agg(
          ${activityLogs.actorUserId}
          order by ${activityLogs.createdAt} asc, ${activityLogs.id} asc
        ))[1] as user_id
      from ${activityLogs}
      where ${activityLogs.businessId} = ${businessId}
        and ${activityLogs.type} = 'quote.sent'
        and ${activityLogs.quoteId} is not null
        and ${activityLogs.actorUserId} is not null
      group by ${activityLogs.quoteId}
    )
    select
      attributed.user_id as user_id,
      count(*) filter (
        where ${quotes.sentAt} >= ${since.toISOString()}
          and ${quotes.sentAt} < ${until.toISOString()}
      )::int as sent,
      count(*) filter (
        where ${quotes.sentAt} >= ${since.toISOString()}
          and ${quotes.sentAt} < ${until.toISOString()}
          and ${quotes.status} = 'accepted'
      )::int as accepted,
      count(*) filter (
        where ${quotes.sentAt} >= ${since.toISOString()}
          and ${quotes.sentAt} < ${until.toISOString()}
          and ${quotes.status} in ('accepted', 'rejected', 'expired')
      )::int as decided,
      coalesce(
        sum(${quotes.totalInCents}) filter (
          where ${quotes.status} = 'accepted'
            and ${quotes.acceptedAt} >= ${since.toISOString()}
            and ${quotes.acceptedAt} < ${until.toISOString()}
        ),
        0
      )::bigint as value
    from ${quotes}
    inner join attributed on attributed.quote_id = ${quotes.id}
    where ${quotes.businessId} = ${businessId}
      and ${quotes.deletedAt} is null
    group by attributed.user_id
  `);

  return rows.map((row) => ({
    userId: row.user_id,
    sent: num(row.sent),
    accepted: num(row.accepted),
    decided: num(row.decided),
    valueWonInCents: num(row.value),
  }));
}

async function getTeamFollowUpsCompleted(
  businessId: string,
  since: Date,
  until: Date,
): Promise<Array<{ userId: string; completed: number }>> {
  const rows = await executeRows<{ user_id: string; completed: string | number }>(sql`
    select
      ${activityLogs.actorUserId} as user_id,
      count(*)::int as completed
    from ${activityLogs}
    where ${activityLogs.businessId} = ${businessId}
      and ${activityLogs.type} = 'follow_up.completed'
      and ${activityLogs.actorUserId} is not null
      and ${activityLogs.createdAt} >= ${since.toISOString()}
      and ${activityLogs.createdAt} < ${until.toISOString()}
    group by ${activityLogs.actorUserId}
  `);

  return rows.map((row) => ({ userId: row.user_id, completed: num(row.completed) }));
}

async function getTeamWorkload(businessId: string): Promise<TeamData["workload"]> {
  const [inquiryRow] = await executeRows<{
    open: string | number;
    unviewed: string | number;
    oldest_unviewed_hours: string | number | null;
  }>(sql`
    select
      count(*) filter (
        where ${inquiries.status} not in ('won', 'lost', 'archived')
      )::int as open,
      count(*) filter (
        where ${inquiries.status} not in ('won', 'lost', 'archived')
          and ${inquiries.firstViewedAt} is null
      )::int as unviewed,
      max(extract(epoch from (now() - ${inquiries.submittedAt})) / 3600) filter (
        where ${inquiries.status} not in ('won', 'lost', 'archived')
          and ${inquiries.firstViewedAt} is null
      ) as oldest_unviewed_hours
    from ${inquiries}
    where ${inquiries.businessId} = ${businessId}
      and ${inquiries.deletedAt} is null
      and ${inquiries.archivedAt} is null
  `);

  const [followUpRow] = await executeRows<{ pending: string | number }>(sql`
    select count(*) filter (where ${followUps.status} = 'pending')::int as pending
    from ${followUps}
    where ${followUps.businessId} = ${businessId}
      and ${followUps.deletedAt} is null
  `);

  const oldest = numOrNull(inquiryRow?.oldest_unviewed_hours);
  return {
    openInquiries: num(inquiryRow?.open),
    unviewedInquiries: num(inquiryRow?.unviewed),
    oldestUnviewedHours:
      num(inquiryRow?.unviewed) > 0 && oldest !== null && oldest > 0 ? oldest : null,
    pendingFollowUps: num(followUpRow?.pending),
  };
}

async function getTeamSlaRows(
  businessId: string,
  since: Date,
  until: Date,
): Promise<{
  breached: number;
  submitted: number;
  byMember: Array<{ userId: string | null; count: number }>;
}> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [summaryRows, memberRows] = await Promise.all([
    executeRows<{ submitted: string | number; breached: string | number }>(sql`
      select
        count(*)::int as submitted,
        count(*) filter (
          where (
            ${inquiries.firstViewedAt} is null
            and ${inquiries.submittedAt} <= now() - interval '24 hours'
          )
          or ${inquiries.firstViewedAt} > ${inquiries.submittedAt} + interval '24 hours'
        )::int as breached
      from ${inquiries}
      where ${inquiries.businessId} = ${businessId}
        and ${inquiries.deletedAt} is null
        and ${inquiries.submittedAt} >= ${sinceIso}
        and ${inquiries.submittedAt} < ${untilIso}
    `),
    executeRows<{ user_id: string | null; count: string | number }>(sql`
      select
        ${inquiries.firstViewedBy} as user_id,
        count(*)::int as count
      from ${inquiries}
      where ${inquiries.businessId} = ${businessId}
        and ${inquiries.deletedAt} is null
        and ${inquiries.submittedAt} >= ${sinceIso}
        and ${inquiries.submittedAt} < ${untilIso}
        and (
          ${inquiries.firstViewedAt} > ${inquiries.submittedAt} + interval '24 hours'
          or (
            ${inquiries.firstViewedAt} is null
            and ${inquiries.submittedAt} <= now() - interval '24 hours'
          )
        )
      group by ${inquiries.firstViewedBy}
    `),
  ]);

  return {
    submitted: num(summaryRows[0]?.submitted),
    breached: num(summaryRows[0]?.breached),
    byMember: memberRows.map((row) => ({
      userId: row.user_id,
      count: num(row.count),
    })),
  };
}

async function getTeamCohorts(
  businessId: string,
  months: MonthBucket[],
): Promise<AnalyticsCohortRow[]> {
  const monthsStart = months[0]?.start ?? new Date();
  const rows = await executeRows<{
    month_key: string;
    size: string | number;
    quoted: string | number;
    won: string | number;
  }>(sql`
    select
      to_char(date_trunc('month', ${inquiries.submittedAt}), 'YYYY-MM') as month_key,
      count(*)::int as size,
      count(*) filter (where exists (
        select 1 from ${quotes}
        where ${quotes.inquiryId} = ${inquiries.id}
          and ${quotes.deletedAt} is null
          and ${quotes.sentAt} is not null
      ))::int as quoted,
      count(*) filter (where exists (
        select 1 from ${quotes}
        where ${quotes.inquiryId} = ${inquiries.id}
          and ${quotes.deletedAt} is null
          and ${quotes.status} = 'accepted'
      ))::int as won
    from ${inquiries}
    where ${inquiries.businessId} = ${businessId}
      and ${inquiries.deletedAt} is null
      and ${inquiries.submittedAt} >= ${monthsStart.toISOString()}
    group by 1
  `);

  const byMonth = new Map(rows.map((row) => [row.month_key, row]));

  return months.map((month) => {
    const row = byMonth.get(month.key);
    const size = num(row?.size);
    const won = num(row?.won);

    return {
      monthKey: month.key,
      label: month.label,
      size,
      quoted: num(row?.quoted),
      won,
      conversionRate: rate(won, size),
    };
  });
}

async function getTeamBenchmarkOwn(
  businessId: string,
  since: Date,
  until: Date,
): Promise<{
  formConversionRate: number | null;
  quoteAcceptanceRate: number | null;
  avgResponseHours: number | null;
}> {
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();

  const [row] = await executeRows<{
    inquiries: string | number;
    sent: string | number;
    accepted: string | number;
    avg_hours: string | number | null;
  }>(sql`
    select
      (select count(*) from ${inquiries}
        where ${inquiries.businessId} = ${businessId}
          and ${inquiries.deletedAt} is null
          and ${inquiries.submittedAt} >= ${sinceIso}
          and ${inquiries.submittedAt} < ${untilIso})::int as inquiries,
      (select count(*) from ${quotes}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.sentAt} >= ${sinceIso}
          and ${quotes.sentAt} < ${untilIso})::int as sent,
      (select count(*) from ${quotes}
        where ${quotes.businessId} = ${businessId}
          and ${quotes.deletedAt} is null
          and ${quotes.sentAt} >= ${sinceIso}
          and ${quotes.sentAt} < ${untilIso}
          and ${quotes.status} = 'accepted')::int as accepted,
      (select avg(extract(epoch from (quoted.first_quote_at - ${inquiries.submittedAt})) / 3600)
        from ${inquiries}
        inner join (
          select ${quotes.inquiryId} as inquiry_id, min(${quotes.createdAt}) as first_quote_at
          from ${quotes}
          where ${quotes.businessId} = ${businessId}
            and ${quotes.deletedAt} is null
            and ${quotes.inquiryId} is not null
          group by ${quotes.inquiryId}
        ) quoted on quoted.inquiry_id = ${inquiries.id}
        where ${inquiries.businessId} = ${businessId}
          and ${inquiries.submittedAt} >= ${sinceIso}
          and ${inquiries.submittedAt} < ${untilIso}) as avg_hours
  `);

  const inquiriesCount = num(row?.inquiries);
  const sent = num(row?.sent);

  return {
    formConversionRate: inquiriesCount > 0 ? rate(sent, inquiriesCount) : null,
    quoteAcceptanceRate: sent > 0 ? rate(num(row?.accepted), sent) : null,
    avgResponseHours: numOrNull(row?.avg_hours),
  };
}

async function getTeamActivitySeries(
  businessId: string,
  months: MonthBucket[],
  members: TeamMemberRow[],
): Promise<TeamData["activitySeries"]> {
  const monthsStart = months[0]?.start ?? new Date();

  const rows = await executeRows<{
    month_key: string;
    user_id: string;
    count: string | number;
  }>(sql`
    select
      to_char(date_trunc('month', ${activityLogs.createdAt}), 'YYYY-MM') as month_key,
      ${activityLogs.actorUserId} as user_id,
      count(*)::int as count
    from ${activityLogs}
    where ${activityLogs.businessId} = ${businessId}
      and ${activityLogs.type} in ('quote.sent', 'follow_up.completed')
      and ${activityLogs.actorUserId} is not null
      and ${activityLogs.createdAt} >= ${monthsStart.toISOString()}
    group by 1, 2
  `);

  const countsByMember = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const byMonth = countsByMember.get(row.user_id) ?? new Map<string, number>();
    byMonth.set(row.month_key, num(row.count));
    countsByMember.set(row.user_id, byMonth);
  }

  return {
    bucketLabels: months.map((month) => month.label),
    members: members.map((member) => ({
      userId: member.userId,
      name: member.name,
      counts: months.map(
        (month) => countsByMember.get(member.userId)?.get(month.key) ?? 0,
      ),
    })),
  };
}

async function computeTeamData({
  businessId,
  window,
  plan,
}: {
  businessId: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<TeamData> {
  const meta = await getAnalyticsBusinessMetaUncached(businessId);
  const { since, until } = window;
  const months = recentMonthBuckets(TEAM_MONTH_COUNT);

  const [members, views, quoteActivity, followUpsCompleted, workload, sla, cohorts, benchmarkOwn] =
    await Promise.all([
      getTeamMemberRows(businessId),
      getTeamInquiryViews(businessId, since, until),
      getTeamQuoteActivity(businessId, since, until),
      getTeamFollowUpsCompleted(businessId, since, until),
      getTeamWorkload(businessId),
      getTeamSlaRows(businessId, since, until),
      getTeamCohorts(businessId, months),
      getTeamBenchmarkOwn(businessId, since, until),
    ]);

  const viewsByUser = new Map(views.map((row) => [row.userId, row]));
  const quotesByUser = new Map(quoteActivity.map((row) => [row.userId, row]));
  const followUpsByUser = new Map(followUpsCompleted.map((row) => [row.userId, row]));
  const nameByUser = new Map(members.map((member) => [member.userId, member.name]));

  const memberRows: TeamMemberRow[] = members.map((member) => {
    const view = viewsByUser.get(member.userId);
    const quotes = quotesByUser.get(member.userId);
    const followUps = followUpsByUser.get(member.userId);

    return {
      ...member,
      inquiriesViewed: view?.viewed ?? 0,
      quotesSent: quotes?.sent ?? 0,
      valueWonInCents: quotes?.valueWonInCents ?? 0,
      followUpsCompleted: followUps?.completed ?? 0,
      winRate:
        quotes && quotes.decided > 0 ? rate(quotes.accepted, quotes.decided) : null,
      averageResponseHours: view?.averageHours ?? null,
      slaBreaches: view?.breaches ?? 0,
    };
  });

  memberRows.sort(
    (a, b) =>
      b.valueWonInCents - a.valueWonInCents ||
      b.quotesSent - a.quotesSent ||
      a.name.localeCompare(b.name),
  );

  const slaByMember: AnalyticsRankedItem[] = sla.byMember
    .map((row) =>
      rankedItem(
        row.userId ? (nameByUser.get(row.userId) ?? "Former member") : "Not yet viewed",
        row.count,
        sla.breached,
      ),
    )
    .sort((a, b) => b.count - a.count);

  const [activitySeries, benchmarks] = await Promise.all([
    getTeamActivitySeries(businessId, months, memberRows),
    getBenchmarkRows({
      industryCategory: meta.industryCategory,
      sizeTier: plan === "business" ? await getSizeTierForBusiness(businessId) : null,
      own: benchmarkOwn,
    }),
  ]);

  return {
    currency: meta.currency,
    members: memberRows,
    workload,
    sla: {
      targetHours: RESPONSE_SLA_HOURS,
      breachedInquiries: sla.breached,
      breachRate: rate(sla.breached, sla.submitted),
      byMember: slaByMember,
    },
    cohorts,
    benchmarks,
    activitySeries,
  };
}

export async function getTeamData({
  businessId,
  window,
  plan,
}: {
  businessId: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<TeamData> {
  const suffix = windowCacheSuffix(window);

  if (window.preset === "custom") {
    return withCircuitBreaker(`analytics:team:${businessId}:${suffix}`, () =>
      computeTeamData({ businessId, window, plan }),
    );
  }

  return withCircuitBreaker(`analytics:team:${businessId}:${suffix}`, () =>
    getTeamDataCached({ businessId, window, plan }),
  );
}

async function getTeamDataCached({
  businessId,
  window,
  plan,
}: {
  businessId: string;
  window: AnalyticsWindow;
  plan: BusinessPlan;
}): Promise<TeamData> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessAnalyticsCacheTags(businessId, `team:${windowCacheSuffix(window)}`));

  return computeTeamData({ businessId, window, plan });
}
