/**
 * Analytics window resolution: URL range params → concrete UTC window,
 * bucket size, comparison window, and plan history clamp.
 *
 * The same module runs on the server (page/sections) and can be used by
 * client controls, so it stays free of runtime dependencies.
 */

import type { BusinessPlan } from "@/lib/plans/plans";
import { formatRangeLabel } from "@/features/analytics/lib/format";

export const analyticsTabs = [
  "overview",
  "performance",
  "operations",
  "team",
] as const;

export type AnalyticsTab = (typeof analyticsTabs)[number];

export const analyticsRangePresets = [
  "7d",
  "30d",
  "90d",
  "12m",
  "all",
  "custom",
] as const;

export type AnalyticsRangePreset = (typeof analyticsRangePresets)[number];
export type AnalyticsBucket = "day" | "week" | "month";

/** Maximum browsable history per plan; `null` means all-time. */
const historyMonthsByPlan: Record<BusinessPlan, number | null> = {
  free: 1,
  pro: 24,
  business: null,
};

export type AnalyticsWindow = {
  preset: AnalyticsRangePreset;
  /** Inclusive UTC start. */
  since: Date;
  /** Exclusive UTC end (start of the day after the last included day). */
  until: Date;
  bucket: AnalyticsBucket;
  /** Toolbar label, e.g. "Last 30 days" or "May 1 – May 31, 2026". */
  label: string;
  /** Previous equal-length window, or null when comparison is off/NA. */
  comparison: { since: Date; until: Date } | null;
  /** True when the plan history cap shortened a requested custom/all range. */
  clamped: boolean;
  /** True for the plan-limited all-time window (Pro). */
  cappedAllTime: boolean;
};

export const presetLabels: Record<Exclude<AnalyticsRangePreset, "custom">, string> = {
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "12m": "Last 12 months",
  all: "All time",
};

export const presetShortLabels: Record<Exclude<AnalyticsRangePreset, "custom">, string> = {
  "7d": "7 days",
  "30d": "30 days",
  "90d": "90 days",
  "12m": "12 months",
  all: "All time",
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

function addUtcMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function spanInDays(since: Date, until: Date): number {
  return Math.max(1, Math.round((until.getTime() - since.getTime()) / 86_400_000));
}

function bucketForSpan(days: number): AnalyticsBucket {
  if (days <= 31) return "day";
  if (days <= 120) return "week";
  return "month";
}

export function isAnalyticsTab(value: string | null | undefined): value is AnalyticsTab {
  return !!value && (analyticsTabs as readonly string[]).includes(value);
}

/**
 * Resolves the requested range into a window the current plan may see.
 *
 * - Free always reads one fixed 30-day window with no comparison.
 * - Pro can browse 24 months; Business can browse all time.
 * - `compare` defaults to on for paid plans and can be turned off with
 *   `compare=0`.
 */
export function resolveAnalyticsWindow({
  plan,
  range,
  from,
  to,
  compare,
  now = new Date(),
  earliest,
}: {
  plan: BusinessPlan;
  range?: string | null;
  from?: string | null;
  to?: string | null;
  compare?: string | null;
  now?: Date;
  /** Earliest business record date, used as the floor for all-time. */
  earliest?: Date | null;
}): AnalyticsWindow {
  const today = startOfUtcDay(now);
  const until = addUtcDays(today, 1);
  const capMonths = historyMonthsByPlan[plan];
  const floor = capMonths === null ? null : startOfUtcMonth(addUtcMonths(today, -capMonths));

  if (plan === "free") {
    const since = addUtcDays(today, -29);
    return {
      preset: "30d",
      since,
      until,
      bucket: "day",
      label: presetLabels["30d"],
      comparison: null,
      clamped: false,
      cappedAllTime: false,
    };
  }

  const requested: AnalyticsRangePreset = (analyticsRangePresets as readonly string[]).includes(
    range ?? "",
  )
    ? (range as AnalyticsRangePreset)
    : "30d";

  let preset = requested;
  let since: Date;
  let clamped = false;
  let cappedAllTime = false;
  let customUntil: Date | null = null;

  if (preset === "custom") {
    const parsedFrom = parseIsoDate(from);
    const parsedTo = parseIsoDate(to);

    if (!parsedFrom || !parsedTo || parsedFrom > parsedTo) {
      preset = "30d";
      since = addUtcDays(today, -29);
    } else {
      since = parsedFrom;
      if (floor && since < floor) {
        since = floor;
        clamped = true;
      }
      // Keep the requested end, but never include future days.
      const end = addUtcDays(parsedTo, 1);
      customUntil = end < until ? end : null;
    }
  } else if (preset === "all") {
    const allTimeStart = earliest ? startOfUtcDay(earliest) : new Date(Date.UTC(2000, 0, 1));
    since = allTimeStart;
    if (floor && since < floor) {
      since = floor;
      clamped = true;
      cappedAllTime = true;
    }
  } else if (preset === "12m") {
    since = startOfUtcMonth(addUtcMonths(today, -11));
  } else {
    const days = preset === "7d" ? 7 : preset === "90d" ? 90 : 30;
    since = addUtcDays(today, -(days - 1));
  }

  return finishWindow({
    preset,
    since,
    until: customUntil ?? until,
    floor,
    compare,
    clamped,
    cappedAllTime,
  });
}

function finishWindow({
  preset,
  since,
  until,
  floor,
  compare,
  clamped,
  cappedAllTime,
}: {
  preset: AnalyticsRangePreset;
  since: Date;
  until: Date;
  floor: Date | null;
  compare: string | null | undefined;
  clamped: boolean;
  cappedAllTime: boolean;
}): AnalyticsWindow {
  // Guard against a custom end that lands after "today" or before the floor.
  if (until <= since) {
    until = addUtcDays(since, 1);
  }
  if (floor && since < floor) {
    since = floor;
    clamped = true;
  }

  const days = spanInDays(since, until);
  const label =
    preset === "custom"
      ? formatRangeLabel(since, until)
      : preset === "all" && cappedAllTime
        ? "Last 24 months"
        : presetLabels[preset as Exclude<AnalyticsRangePreset, "custom">];

  const comparisonEnabled = compare !== "0" && preset !== "all";

  return {
    preset,
    since,
    until,
    bucket: bucketForSpan(days),
    label,
    comparison: comparisonEnabled
      ? { since: new Date(since.getTime() - days * 86_400_000), until: since }
      : null,
    clamped,
    cappedAllTime,
  };
}

// ---------------------------------------------------------------------------
// Buckets
// ---------------------------------------------------------------------------

export type AnalyticsBucketRange = {
  /** UTC ISO date of the bucket start (YYYY-MM-DD). */
  key: string;
  /** Inclusive bucket start. */
  start: Date;
  /** Exclusive bucket end, clipped to the window end. */
  end: Date;
};

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  return addUtcDays(startOfUtcDay(date), -((day + 6) % 7));
}

/**
 * Builds the ordered bucket list for a window. Days are assigned to the
 * bucket that contains their UTC start; the first/last bucket edges are
 * clipped to the window so sums never leak outside it.
 */
export function buildAnalyticsBuckets(
  window: Pick<AnalyticsWindow, "since" | "until" | "bucket">,
): AnalyticsBucketRange[] {
  const { since, until, bucket } = window;

  if (bucket === "day") {
    const buckets: AnalyticsBucketRange[] = [];
    for (let cursor = startOfUtcDay(since); cursor < until; cursor = addUtcDays(cursor, 1)) {
      const end = addUtcDays(cursor, 1);
      buckets.push({ key: toIsoDate(cursor), start: cursor, end: end < until ? end : until });
    }
    return buckets;
  }

  if (bucket === "week") {
    const buckets: AnalyticsBucketRange[] = [];
    let cursor = startOfUtcWeek(since);
    while (cursor < until) {
      const end = addUtcDays(cursor, 7);
      buckets.push({
        key: toIsoDate(cursor),
        start: cursor < since ? since : cursor,
        end: end < until ? end : until,
      });
      cursor = end;
    }
    return buckets;
  }

  const buckets: AnalyticsBucketRange[] = [];
  let cursor = startOfUtcMonth(since);
  while (cursor < until) {
    const end = addUtcMonths(cursor, 1);
    buckets.push({
      key: toIsoDate(cursor),
      start: cursor < since ? since : cursor,
      end: end < until ? end : until,
    });
    cursor = end;
  }
  return buckets;
}

/** Returns the bucket key that contains an ISO date string. */
export function getBucketKey(
  isoDate: string,
  bucket: AnalyticsBucket,
): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  if (bucket === "day") return isoDate;
  if (bucket === "week") return toIsoDate(startOfUtcWeek(date));
  return toIsoDate(startOfUtcMonth(date));
}

/** Label for the bucket on chart axes. */
export function formatBucketLabel(
  key: string,
  bucket: AnalyticsBucket,
  formatters: {
    day: (value: string) => string;
    month: (value: string) => string;
  },
): string {
  return bucket === "day" ? formatters.day(key) : formatters.month(key);
}
