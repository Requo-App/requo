import type { PeriodDelta, PeriodDeltaDirection } from "@/features/analytics/types";
import type { DateRangePreset } from "@/features/analytics/components/date-range-selector";

/**
 * A human-readable delta label plus the direction the metric moved, ready to
 * drop into a delta pill. Direction is sentiment-free: callers decide the
 * color ("up" is good for revenue, bad for response times).
 */
export type KpiDeltaLabel = {
  label: string;
  direction: PeriodDeltaDirection;
};

export function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

export function formatDuration(hours: number | null): string | null {
  if (hours === null) return null;

  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return minutes <= 1 ? "< 1 min" : `${minutes} min`;
  }

  if (hours < 24) {
    return `${Math.round(hours * 10) / 10}h`;
  }

  return `${Math.round((hours / 24) * 10) / 10}d`;
}

export function formatMoney(amountInCents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountInCents / 100);
}

export function formatWeekLabel(weekStart: Date): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);

  if (
    weekStart.getUTCFullYear() === weekEnd.getUTCFullYear() &&
    weekStart.getUTCMonth() === weekEnd.getUTCMonth()
  ) {
    return `${fmt.format(weekStart)}-${weekEnd.getUTCDate()}`;
  }

  return `${fmt.format(weekStart)}-${fmt.format(weekEnd)}`;
}

export function computeDelta(current: number, prior: number): PeriodDelta {
  const diff = current - prior;

  if (diff === 0 || (current === 0 && prior === 0)) {
    return { value: 0, direction: "flat" };
  }

  return {
    value: Math.abs(diff),
    direction: diff > 0 ? "up" : "down",
  };
}

export function formatDelta(delta: PeriodDelta): string {
  if (delta.direction === "flat") return "No change";
  const prefix = delta.direction === "up" ? "+" : "−";
  return `${prefix}${delta.value}`;
}

export function getDeltaSentiment(
  direction: PeriodDeltaDirection,
  inverted = false,
): "positive" | "negative" | "neutral" {
  if (direction === "flat") return "neutral";
  if (inverted) return direction === "down" ? "positive" : "negative";
  return direction === "up" ? "positive" : "negative";
}

// ---------------------------------------------------------------------------
// KPI delta labels (period-over-period, dashboard stat cards)
// ---------------------------------------------------------------------------

/**
 * Relative change between two windowed totals, e.g. "+12%" / "−8%".
 * A zero prior has no meaningful percentage, so growth reads as an absolute
 * move through `formatAbsolute` (e.g. "+$6,163"), falling back to "New" when
 * no formatter is given. Sub-1% changes round to "No change" instead of "±0%".
 */
export function formatRelativeDelta(
  current: number,
  prior: number,
  formatAbsolute?: (value: number) => string,
): KpiDeltaLabel {
  if (current === prior) return { label: "No change", direction: "flat" };

  if (prior === 0) {
    if (current > 0) {
      return formatAbsolute
        ? { label: `+${formatAbsolute(current)}`, direction: "up" }
        : { label: "New", direction: "up" };
    }
    return { label: "−100%", direction: "down" };
  }

  const diff = current - prior;
  const pct = Math.round((Math.abs(diff) / prior) * 100);

  if (pct === 0) return { label: "No change", direction: "flat" };

  return {
    label: `${diff > 0 ? "+" : "−"}${pct}%`,
    direction: diff > 0 ? "up" : "down",
  };
}

/**
 * Percentage-point change between two rates (fractions 0–1), e.g. "+12 pts".
 * Points, not relative percent, so a 50% → 60% acceptance move reads as
 * "+10 pts" instead of the misleading "+20%".
 */
export function formatPointsDelta(current: number, prior: number): KpiDeltaLabel {
  const pts = Math.round((current - prior) * 100);

  if (pts === 0) return { label: "No change", direction: "flat" };

  return {
    label: `${pts > 0 ? "+" : "−"}${Math.abs(pts)} pts`,
    direction: pts > 0 ? "up" : "down",
  };
}

/**
 * Relative change phrased for "lower is better" metrics like time to quote,
 * e.g. "33% faster" / "25% slower". Null-tolerant: no current data reads as
 * "No data yet", no prior data reads as "New". The label carries the
 * sentiment, so callers keep the pill color neutral.
 */
export function formatSpeedDelta(
  current: number | null,
  prior: number | null,
): KpiDeltaLabel {
  if (current === null) return { label: "No data yet", direction: "flat" };
  if (prior === null) return { label: "No prior data", direction: "flat" };
  if (current === prior) return { label: "No change", direction: "flat" };

  const pct = Math.round((Math.abs(current - prior) / prior) * 100);

  if (pct === 0) return { label: "No change", direction: "flat" };

  return current < prior
    ? { label: `${pct}% faster`, direction: "down" }
    : { label: `${pct}% slower`, direction: "up" };
}

/** Map preset string to number of days. */
const PRESET_DAYS: Record<string, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Derive the date range (since/until), active preset, and period description
 * from the page's URL searchParams.
 *
 * URL format:
 *  - ?range=7d|30d|90d  → preset
 *  - ?since=YYYY-MM-DD&until=YYYY-MM-DD  → custom range
 *  - (no params)  → defaults to 30 days
 */
export function resolveDateRangeFromParams(raw: Record<string, string | string[] | undefined>): {
  since: Date;
  until: Date;
  preset: DateRangePreset;
  customSince?: string;
  customUntil?: string;
  periodDescription: string;
} {
  const now = new Date();
  const rangeParam = typeof raw.range === "string" ? raw.range : undefined;
  const sinceParam = typeof raw.since === "string" ? raw.since : undefined;
  const untilParam = typeof raw.until === "string" ? raw.until : undefined;

  // Custom range
  if (sinceParam && untilParam) {
    const since = new Date(sinceParam);
    const until = new Date(untilParam);

    // Validate; fall back to 30d if invalid
    if (!isNaN(since.getTime()) && !isNaN(until.getTime()) && since < until) {
      // Format dates for description
      const fmt = new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" });
      const periodDescription = `${fmt.format(since)} – ${fmt.format(until)}`;
      return {
        since,
        until,
        preset: "custom",
        customSince: sinceParam,
        customUntil: untilParam,
        periodDescription,
      };
    }
  }

  // Preset range
  const days = (rangeParam && PRESET_DAYS[rangeParam]) || 30;
  const preset: DateRangePreset = rangeParam && rangeParam in PRESET_DAYS
    ? (rangeParam as DateRangePreset)
    : "30d";

  const since = new Date(now);
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const until = new Date(now);
  until.setHours(23, 59, 59, 999);

  const periodDescription = `How your inquiry-to-quote pipeline is performing over the last ${days} days.`;

  return { since, until, preset, periodDescription };
}
