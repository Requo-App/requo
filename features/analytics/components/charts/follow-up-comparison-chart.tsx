"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { formatPercent } from "@/features/analytics/format";
import type { FollowUpEffectivenessData } from "@/features/analytics/types";

import { ANALYTICS_PLOT_HEIGHT } from "../primitives/plot-frame";
import { AnalyticsTooltip, type AnalyticsTooltipSeries } from "./analytics-tooltip";

/**
 * With vs without follow-up: the operations headline. Grouped bars compare
 * response and acceptance rates side by side; the card's table carries the
 * cohort sizes so a rate never floats free of its denominator.
 */
export function FollowUpComparisonChart({
  effectiveness,
  ariaLabel,
}: {
  effectiveness: FollowUpEffectivenessData;
  ariaLabel: string;
}) {
  const reduceMotion = usePrefersReducedMotion();

  const data = [
    {
      metric: "Response rate",
      withFollowUp: effectiveness.withFollowUp.responseRate,
      withoutFollowUp: effectiveness.withoutFollowUp.responseRate,
    },
    {
      metric: "Acceptance rate",
      withFollowUp: effectiveness.withFollowUp.acceptanceRate,
      withoutFollowUp: effectiveness.withoutFollowUp.acceptanceRate,
    },
  ];

  const config: ChartConfig = {
    withFollowUp: { label: "With follow-up", color: "var(--chart-series-1)" },
    withoutFollowUp: {
      label: "Without follow-up",
      color: "var(--chart-series-2)",
    },
  };

  const tooltipSeries: AnalyticsTooltipSeries[] = [
    {
      key: "withFollowUp",
      label: "With follow-up",
      color: "var(--chart-series-1)",
      format: (value) => formatPercent(value),
    },
    {
      key: "withoutFollowUp",
      label: "Without follow-up",
      color: "var(--chart-series-2)",
      format: (value) => formatPercent(value),
    },
  ];

  return (
    <ChartContainer
      config={config}
      className="aspect-auto w-full flex-1"
      style={{ minHeight: ANALYTICS_PLOT_HEIGHT }}
      role="img"
      aria-label={ariaLabel}
      tabIndex={-1}
    >
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid
          vertical={false}
          stroke="var(--chart-grid)"
          strokeWidth={1}
        />
        <XAxis
          dataKey="metric"
          tickLine={false}
          axisLine={false}
          height={22}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tickCount={4}
          domain={[0, 1]}
          tickFormatter={(value: number) => formatPercent(value, 0)}
        />
        <ChartTooltip
          cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
          content={<AnalyticsTooltip series={tooltipSeries} />}
        />
        <Bar
          dataKey="withFollowUp"
          name="With follow-up"
          fill="var(--color-withFollowUp)"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
          isAnimationActive={!reduceMotion}
          animationDuration={280}
        />
        <Bar
          dataKey="withoutFollowUp"
          name="Without follow-up"
          fill="var(--color-withoutFollowUp)"
          radius={[4, 4, 0, 0]}
          maxBarSize={40}
          isAnimationActive={!reduceMotion}
          animationDuration={280}
        />
      </BarChart>
    </ChartContainer>
  );
}
