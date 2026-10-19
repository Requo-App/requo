/**
 * Chart color contract. Components never write color literals: categorical
 * series come from the app's `--chart-series-*` tokens (the brand accent
 * first, then neutrals) in fixed order, while outcome/severity series use
 * semantic tokens.
 */

const SERIES_COUNT = 3;

/** Categorical token for the Nth series (0-based), cycling after three. */
export function chartSeries(index: number): string {
  return `var(--chart-series-${(index % SERIES_COUNT) + 1})`;
}

export type ChartSemanticKey =
  | "accepted"
  | "rejected"
  | "expired"
  | "open"
  | "pending"
  | "positive"
  | "negative"
  | "neutral"
  | "info";

const semanticColors: Record<ChartSemanticKey, string> = {
  accepted: "var(--success)",
  rejected: "var(--destructive)",
  expired: "var(--muted-foreground)",
  open: "var(--warning)",
  pending: "var(--warning)",
  positive: "var(--success)",
  negative: "var(--destructive)",
  neutral: "var(--muted-foreground)",
  info: "var(--info)",
};

export function chartSemantic(key: ChartSemanticKey): string {
  return semanticColors[key];
}

/** The neutral stroke used for previous-period ghosts. */
export const chartPriorSeries = "var(--muted-foreground)";

/**
 * Neutral ramp for stacked series that need more than three steps (per-member
 * activity, for example). The first step is the brand accent; the rest step
 * down through neutrals so a stack never reads as a second hue.
 */
export function chartStackSeries(index: number): string {
  if (index === 0) return "var(--chart-series-1)";
  const neutralIndex = ((index - 1) % 5) + 1;
  return `var(--chart-neutral-${neutralIndex})`;
}

/** Default named series used across the analytics tabs. */
export const chartSeriesNames = {
  visitors: "Visitors",
  formViews: "Page views",
  inquiries: "Inquiries",
  quotesSent: "Quotes sent",
  quotesViewed: "Quotes viewed",
  accepted: "Accepted",
  revenue: "Revenue won",
  avgDeal: "Avg deal",
  withFollowUp: "With follow-up",
  withoutFollowUp: "Without follow-up",
} as const;
