/**
 * Formatting primitives shared by analytics server sections and client
 * charts. Keep every number/date label that appears in analytics here so the
 * KPI row, chart axes, tooltips, and CSV exports read the same.
 */

export type DeltaDirection = "up" | "down" | "flat";

/** A human-readable delta label plus the direction the metric moved. */
export type DeltaLabel = {
  label: string;
  direction: DeltaDirection;
};

// ---------------------------------------------------------------------------
// Numbers and money
// ---------------------------------------------------------------------------

const moneyFormatterCache = new Map<string, Intl.NumberFormat>();

function getMoneyFormatter(currency: string, compact: boolean) {
  const key = `${currency}:${compact ? "compact" : "full"}`;
  const cached = moneyFormatterCache.get(key);
  if (cached) return cached;

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    notation: compact ? "compact" : "standard",
    minimumFractionDigits: 0,
    maximumFractionDigits: compact ? 1 : 0,
  });
  moneyFormatterCache.set(key, formatter);
  return formatter;
}

/**
 * Formats integer cents in the workspace currency. Whole units by default so
 * dashboard values stay scannable; `compact` is for tight chart axes/cells.
 *
 * A null, undefined, or non-finite amount reads as an em dash: every analytics
 * surface shows the same "no value" mark, never `NaN` or `$0`.
 */
export function formatMoney(
  amountInCents: number | null | undefined,
  currency = "USD",
  { compact = false }: { compact?: boolean } = {},
): string {
  if (amountInCents === null || amountInCents === undefined) return "—";
  if (!Number.isFinite(amountInCents)) return "—";
  return getMoneyFormatter(currency, compact).format(amountInCents / 100);
}

/** Full-value money with cents, for tooltips and CSV cells. */
export function formatMoneyExact(
  amountInCents: number | null | undefined,
  currency = "USD",
): string {
  if (amountInCents === null || amountInCents === undefined) return "—";
  if (!Number.isFinite(amountInCents)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountInCents / 100);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatCompactNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/**
 * Formats a 0–1 rate as a percent with at most one decimal (42.4%).
 * Rates always carry their definition next to them in the UI.
 */
export function formatPercent(rate: number, decimals = 1): string {
  if (!Number.isFinite(rate)) return "—";
  const value = rate * 100;
  const rounded = Number(value.toFixed(decimals));
  return `${rounded}%`;
}

/** Formats an already-scaled percent (e.g. a stored 42.4), not a 0–1 rate. */
export function formatPercentValue(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${Number(value.toFixed(decimals))}%`;
}

/** Percentage points between two 0–1 rates, e.g. "+10 pts". */
export function formatPoints(current: number, prior: number): DeltaLabel {
  const pts = Math.round((current - prior) * 100);

  if (pts === 0) return { label: "No change", direction: "flat" };

  return {
    label: `${pts > 0 ? "+" : "−"}${Math.abs(pts)} pts`,
    direction: pts > 0 ? "up" : "down",
  };
}

/** Hours as a compact duration: "45 min", "3.2h", "2.4d". */
export function formatDuration(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "—";

  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return minutes <= 1 ? "< 1 min" : `${minutes} min`;
  }

  if (hours < 24) {
    return `${Math.round(hours * 10) / 10}h`;
  }

  return `${Math.round((hours / 24) * 10) / 10}d`;
}

/** Days as a compact duration: "3.1d" or "2.0d"; null reads as an em dash. */
export function formatDays(days: number | null): string {
  if (days === null || !Number.isFinite(days)) return "—";
  return `${Math.round(days * 10) / 10}d`;
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const dayFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

const monthOnlyFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  timeZone: "UTC",
});

/** "May 4" for day/week bucket starts. */
export function formatDayLabel(date: Date | string): string {
  return dayFormatter.format(typeof date === "string" ? new Date(`${date}T00:00:00Z`) : date);
}

/** "May 26" for month buckets (month + year, short). */
export function formatMonthLabel(date: Date | string): string {
  return monthFormatter.format(
    typeof date === "string" ? new Date(`${date}T00:00:00Z`) : date,
  );
}

/** "May" for a 12-month axis. */
export function formatMonthName(date: Date | string): string {
  return monthOnlyFormatter.format(
    typeof date === "string" ? new Date(`${date}T00:00:00Z`) : date,
  );
}

/** "May 1 – May 31, 2026" for the toolbar range label. */
export function formatRangeLabel(since: Date, untilExclusive: Date): string {
  const lastDay = new Date(untilExclusive);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);

  const sameYear = since.getUTCFullYear() === lastDay.getUTCFullYear();
  const start = sameYear
    ? formatDayLabel(since)
    : `${formatDayLabel(since)}, ${since.getUTCFullYear()}`;

  return `${start} – ${formatDayLabel(lastDay)}, ${lastDay.getUTCFullYear()}`;
}

// ---------------------------------------------------------------------------
// Delta labels (period-over-period)
// ---------------------------------------------------------------------------

/**
 * Relative change between two windowed totals, e.g. "+12%" / "−8%".
 * A zero prior has no meaningful percentage, so growth reads as an absolute
 * move through `formatAbsolute` (e.g. "+$6,163"), falling back to "New".
 * Sub-1% changes round to "No change" instead of "±0%".
 */
export function formatRelativeDelta(
  current: number,
  prior: number,
  formatAbsolute?: (value: number) => string,
): DeltaLabel {
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
export function formatPointsDelta(current: number, prior: number): DeltaLabel {
  return formatPoints(current, prior);
}

/**
 * Relative change phrased for "lower is better" metrics like time to quote,
 * e.g. "33% faster" / "25% slower". Null-tolerant.
 */
export function formatSpeedDelta(
  current: number | null,
  prior: number | null,
): DeltaLabel {
  if (current === null) return { label: "No data yet", direction: "flat" };
  if (prior === null) return { label: "No prior data", direction: "flat" };
  if (current === prior) return { label: "No change", direction: "flat" };

  // A zero prior has no meaningful percentage; read it as a new baseline
  // rather than dividing by zero.
  if (prior === 0) {
    return current > 0
      ? { label: "No prior baseline", direction: "flat" }
      : { label: "No change", direction: "flat" };
  }

  const pct = Math.round((Math.abs(current - prior) / prior) * 100);

  if (pct === 0) return { label: "No change", direction: "flat" };

  return current < prior
    ? { label: `${pct}% faster`, direction: "down" }
    : { label: `${pct}% slower`, direction: "up" };
}

/** Sentiment for a direction; invert for metrics where lower is better. */
export function getDeltaSentiment(
  direction: DeltaDirection,
  inverted = false,
): "positive" | "negative" | "neutral" {
  if (direction === "flat") return "neutral";
  if (inverted) return direction === "down" ? "positive" : "negative";
  return direction === "up" ? "positive" : "negative";
}
