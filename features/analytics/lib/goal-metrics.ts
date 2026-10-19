/**
 * Canonical goal metric catalogue shared by the goal editor and the
 * performance aggregator. Keeping labels, formats, and direction here means a
 * goal created in the sheet renders with the same wording in the Goals card.
 */

export type AnalyticsGoalMetricKey =
  | "inquiries"
  | "quotesSent"
  | "quotesAccepted"
  | "winRate"
  | "revenueWon"
  | "formConversionRate"
  | "quoteAcceptanceRate"
  | "avgResponseHours";

export type AnalyticsGoalMetricOption = {
  key: AnalyticsGoalMetricKey;
  label: string;
  format: "number" | "percent" | "currency";
  lowerIsBetter: boolean;
  /** Short unit hint shown beside the target input. */
  hint: string;
};

export const ANALYTICS_GOAL_METRICS: readonly AnalyticsGoalMetricOption[] = [
  {
    key: "inquiries",
    label: "Inquiries received",
    format: "number",
    lowerIsBetter: false,
    hint: "count",
  },
  {
    key: "quotesSent",
    label: "Quotes sent",
    format: "number",
    lowerIsBetter: false,
    hint: "count",
  },
  {
    key: "quotesAccepted",
    label: "Quotes won",
    format: "number",
    lowerIsBetter: false,
    hint: "count",
  },
  {
    key: "winRate",
    label: "Win rate",
    format: "percent",
    lowerIsBetter: false,
    hint: "percent",
  },
  {
    key: "revenueWon",
    label: "Revenue won",
    format: "currency",
    lowerIsBetter: false,
    hint: "amount",
  },
  {
    key: "formConversionRate",
    label: "Inquiry to quote rate",
    format: "percent",
    lowerIsBetter: false,
    hint: "percent",
  },
  {
    key: "quoteAcceptanceRate",
    label: "Quote acceptance rate",
    format: "percent",
    lowerIsBetter: false,
    hint: "percent",
  },
  {
    key: "avgResponseHours",
    label: "Time to quote",
    format: "number",
    lowerIsBetter: true,
    hint: "hours",
  },
] as const;

export const analyticsGoalMetricByKey: ReadonlyMap<
  string,
  AnalyticsGoalMetricOption
> = new Map(ANALYTICS_GOAL_METRICS.map((metric) => [metric.key, metric]));
