/**
 * Home dashboard analytics reads.
 *
 * The home page shows a fixed "last 30 days vs previous 30 days" strip. These
 * helpers derive from one cached snapshot so the KPI region, the response-time
 * tile, and the comparison deltas always agree with each other and with the
 * analytics overview.
 */

import "server-only";

import { cacheLife, cacheTag } from "next/cache";

import {
  getBusinessAnalyticsCacheTags,
  hotBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { withCircuitBreaker } from "@/lib/db/circuit-breaker";
import {
  getOverviewPeriodRows,
  getTimingForWindow,
  type TimingWindow,
} from "@/features/analytics/queries";
import type { OverviewPeriod } from "@/features/analytics/types";

const HOME_WINDOW_DAYS = 30;

type HomeWindow = {
  since: Date;
  until: Date;
  priorSince: Date;
  priorUntil: Date;
};

function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function resolveHomeWindow(now = new Date()): HomeWindow {
  const today = startOfUtcDay(now);
  const until = addUtcDays(today, 1);
  const since = addUtcDays(today, -(HOME_WINDOW_DAYS - 1));

  return {
    since,
    until,
    priorSince: addUtcDays(since, -HOME_WINDOW_DAYS),
    priorUntil: since,
  };
}

type HomeAnalyticsSnapshot = {
  current: OverviewPeriod;
  prior: OverviewPeriod;
  currentTiming: TimingWindow;
  priorTiming: TimingWindow;
};

async function getHomeAnalyticsSnapshotUncached(
  businessId: string,
): Promise<HomeAnalyticsSnapshot> {
  const { since, until, priorSince, priorUntil } = resolveHomeWindow();

  const [current, prior, currentTiming, priorTiming] = await Promise.all([
    getOverviewPeriodRows(businessId, since, until),
    getOverviewPeriodRows(businessId, priorSince, priorUntil),
    getTimingForWindow(businessId, since, until),
    getTimingForWindow(businessId, priorSince, priorUntil),
  ]);

  return { current, prior, currentTiming, priorTiming };
}

async function getHomeAnalyticsSnapshotCached(
  businessId: string,
): Promise<HomeAnalyticsSnapshot> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessAnalyticsCacheTags(businessId, "home:30d"));

  return getHomeAnalyticsSnapshotUncached(businessId);
}

function getHomeAnalyticsSnapshot(businessId: string): Promise<HomeAnalyticsSnapshot> {
  return withCircuitBreaker(`analytics:home:${businessId}`, () =>
    getHomeAnalyticsSnapshotCached(businessId),
  );
}

/** Counts and acceptance rate for the home KPI row (last 30 days). */
export type HomeAnalyticsSummary = {
  inquirySubmissions: number;
  quotesSent: number;
  quotesAccepted: number;
  /** accepted ÷ sent (0–1). */
  quoteAcceptanceRate: number;
};

export type DashboardResponseTime = {
  /** Inquiry submitted → first quote drafted, in hours (last 30 days). */
  avgTimeToQuoteHours: number | null;
};

export type DashboardKpiComparison = {
  wonInCentsPrior: number;
  quotesSentPrior: number;
  quotesAcceptedPrior: number;
  avgTimeToQuoteHoursPrior: number | null;
};

export async function getHomeAnalyticsSummary(
  businessId: string,
): Promise<HomeAnalyticsSummary> {
  const snapshot = await getHomeAnalyticsSnapshot(businessId);

  return {
    inquirySubmissions: snapshot.current.inquiries,
    quotesSent: snapshot.current.quotesSent,
    quotesAccepted: snapshot.current.quotesAccepted,
    quoteAcceptanceRate: snapshot.current.acceptanceRate,
  };
}

export async function getDashboardResponseTime(
  businessId: string,
): Promise<DashboardResponseTime> {
  const snapshot = await getHomeAnalyticsSnapshot(businessId);

  return { avgTimeToQuoteHours: snapshot.currentTiming.avgTimeToQuoteHours };
}

export async function getDashboardKpiComparison(
  businessId: string,
): Promise<DashboardKpiComparison> {
  const snapshot = await getHomeAnalyticsSnapshot(businessId);

  return {
    wonInCentsPrior: snapshot.prior.revenueWonInCents,
    quotesSentPrior: snapshot.prior.quotesSent,
    quotesAcceptedPrior: snapshot.prior.quotesAccepted,
    avgTimeToQuoteHoursPrior: snapshot.priorTiming.avgTimeToQuoteHours,
  };
}
