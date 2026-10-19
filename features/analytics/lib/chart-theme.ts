/**
 * Chart color contract. Components never write color literals: categorical
 * series come from the app's `--chart-1…5` tokens in fixed order, while
 * outcome/severity series use semantic tokens.
 */

const SERIES_COUNT = 5;

/** Categorical token for the Nth series (0-based), cycling after five. */
export function chartSeries(index: number): string {
  return `var(--chart-${(index % SERIES_COUNT) + 1})`;
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
