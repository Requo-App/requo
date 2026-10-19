import {
  formatMoney,
  formatPointsDelta,
  formatRelativeDelta,
  formatSpeedDelta,
  type DeltaLabel,
} from "@/features/analytics/lib/format";
import type { getBusinessMoneySnapshot } from "@/features/businesses/queries";
import type {
  DashboardKpiComparison,
  DashboardResponseTime,
  HomeAnalyticsSummary,
} from "@/features/analytics/home-queries";
import type { HomeKpiStat } from "@/features/businesses/components/home-kpi-cards";

/**
 * Pure builders for the dashboard home regions. Single home for the KPI
 * assembly previously inline in `app/(business)/[businessSlug]/(main)/home`.
 */
export function formatHomeResponseTime(hours: number | null): string {
  if (hours === null) {
    return "—";
  }

  if (hours < 1) {
    return `${Math.round(hours * 60)}m`;
  }

  if (hours < 24) {
    return `${Math.round(hours)}h`;
  }

  return `${Math.round((hours / 24) * 10) / 10}d`;
}

function deltaColorFromDirection(
  delta: DeltaLabel,
  inverted = false,
): HomeKpiStat["deltaColor"] {
  if (delta.direction === "flat") return "neutral";
  const good = inverted ? delta.direction === "down" : delta.direction === "up";
  return good ? "lime" : "rose";
}

export function buildHomeKpiStats({
  money,
  analytics,
  responseTimeHours,
  comparison,
}: {
  money: Awaited<ReturnType<typeof getBusinessMoneySnapshot>>;
  analytics: HomeAnalyticsSummary;
  responseTimeHours: DashboardResponseTime["avgTimeToQuoteHours"];
  comparison: DashboardKpiComparison;
}): HomeKpiStat[] {
  const priorAcceptanceRate =
    comparison.quotesSentPrior > 0
      ? comparison.quotesAcceptedPrior / comparison.quotesSentPrior
      : 0;

  const moneyDelta = formatRelativeDelta(
    money.wonInCents,
    comparison.wonInCentsPrior,
    // Zero-to-growth has no meaningful percentage — show the absolute move.
    (cents) => formatMoney(cents, money.currency),
  );
  const acceptanceDelta = formatPointsDelta(
    analytics.quoteAcceptanceRate,
    priorAcceptanceRate,
  );
  const speedDelta = formatSpeedDelta(
    responseTimeHours,
    comparison.avgTimeToQuoteHoursPrior,
  );

  const deltas: Array<{
    delta: DeltaLabel | null;
    deltaColor: HomeKpiStat["deltaColor"];
  }> = [
    { delta: moneyDelta, deltaColor: deltaColorFromDirection(moneyDelta) },
    { delta: null, deltaColor: "neutral" },
    {
      delta: acceptanceDelta,
      deltaColor: deltaColorFromDirection(acceptanceDelta),
    },
    {
      delta: speedDelta,
      deltaColor: deltaColorFromDirection(speedDelta, true),
    },
  ];

  const statDelta = (
    index: number,
  ): Pick<HomeKpiStat, "delta" | "deltaColor" | "deltaDirection"> => ({
    delta: deltas[index].delta?.label,
    deltaColor: deltas[index].deltaColor,
    deltaDirection: deltas[index].delta?.direction,
  });

  return [
    {
      icon: "won",
      label: "Revenue won",
      value: formatMoney(money.wonInCents, money.currency),
      ...statDelta(0),
      tone: "blue",
      caption: "vs previous 30 days",
      hint: "Total value of quotes your customers accepted in the last 30 days. The delta compares against the 30 days before that.",
    },
    {
      icon: "in-play",
      label: "Awaiting reply",
      value: formatMoney(money.inPlayInCents, money.currency),
      ...statDelta(1),
      tone: "orange",
      caption: `${money.inPlayCount} open quote${money.inPlayCount === 1 ? "" : "s"}`,
      hint: "Value of sent quotes that haven't expired and are still waiting on a customer reply.",
    },
    {
      icon: "acceptance",
      label: "Acceptance rate",
      value: `${Math.round(analytics.quoteAcceptanceRate * 100)}%`,
      ...statDelta(2),
      tone: "purple",
      caption: "vs previous 30 days",
      hint: "Share of sent quotes that customers accepted in the last 30 days. The delta compares against the 30 days before that.",
    },
    {
      icon: "response-time",
      label: "Time to quote",
      value: formatHomeResponseTime(responseTimeHours),
      ...statDelta(3),
      tone: "emerald",
      caption: "vs previous 30 days",
      hint: "Average time from an inquiry arriving to your first quote going out. The delta compares against the 30 days before that.",
    },
  ];
}
