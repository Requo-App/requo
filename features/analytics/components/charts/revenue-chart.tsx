"use client";

import { useMemo } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { formatMoney } from "@/features/analytics/lib/format";
import { cn } from "@/lib/utils";

import { EmptyState } from "../primitives/empty-state";
import { ANALYTICS_PLOT_HEIGHT } from "../primitives/plot-frame";
import { AnalyticsTooltip, type AnalyticsTooltipSeries } from "./analytics-tooltip";

export type RevenuePoint = {
  label: string;
  /** Won value for the bucket, in cents. */
  revenueInCents: number;
  /** Accepted quotes in the bucket. */
  quotesAccepted: number;
};

/**
 * Revenue trend: rounded-top bars for the won value in each bucket, with the
 * average accepted deal as a thin line over them. Money is formatted in the
 * business currency everywhere — compact on the axis, exact in the tooltip.
 */
export function RevenueChart({
  points,
  currency,
  ariaLabel,
  height = ANALYTICS_PLOT_HEIGHT,
  emptyLabel = "No won revenue in this period.",
  className,
}: {
  points: RevenuePoint[];
  currency: string;
  ariaLabel: string;
  height?: number;
  emptyLabel?: string;
  className?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();

  const data = useMemo(
    () =>
      points.map((point) => ({
        label: point.label,
        revenue: point.revenueInCents / 100,
        avgDeal:
          point.quotesAccepted > 0
            ? point.revenueInCents / point.quotesAccepted / 100
            : null,
      })),
    [points],
  );

  const hasData = data.some((point) => point.revenue !== 0);

  const config: ChartConfig = {
    revenue: { label: "Revenue won", color: "var(--chart-series-1)" },
    avgDeal: { label: "Avg deal", color: "var(--chart-series-2)" },
  };

  const tooltipSeries: AnalyticsTooltipSeries[] = [
    {
      key: "revenue",
      label: "Revenue won",
      color: "var(--chart-series-1)",
      format: (value) => formatMoney(Math.round(value * 100), currency),
    },
    {
      key: "avgDeal",
      label: "Avg deal",
      color: "var(--chart-series-2)",
      format: (value) => formatMoney(Math.round(value * 100), currency),
    },
  ];

  if (!hasData) {
    return <EmptyState label={emptyLabel} className={className} />;
  }

  const xTicks =
    points.length <= 6
      ? points.map((point) => point.label)
      : Array.from({ length: 6 }, (_, index) => {
          const point = points[Math.round((index * (points.length - 1)) / 5)];
          return point?.label ?? "";
        });

  return (
    <div className={cn("flex min-w-0 flex-1 flex-col gap-3", className)}>
      <ChartContainer
        config={config}
        className="aspect-auto w-full flex-1"
        style={{ minHeight: height }}
        role="img"
        aria-label={ariaLabel}
        tabIndex={-1}
      >
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="var(--chart-grid)"
            strokeWidth={1}
          />
          <XAxis
            dataKey="label"
            ticks={xTicks}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
            interval="preserveStartEnd"
            height={22}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={56}
            tickCount={4}
            domain={[
              0,
              (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.1) : 1),
            ]}
            tickFormatter={(value: number) =>
              formatMoney(Math.round(value * 100), currency, { compact: true })
            }
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            content={<AnalyticsTooltip series={tooltipSeries} />}
          />

          <Bar
            dataKey="revenue"
            name="Revenue won"
            fill="var(--chart-series-1)"
            radius={[4, 4, 0, 0]}
            maxBarSize={28}
            isAnimationActive={!reduceMotion}
            animationDuration={280}
          />
          <Line
            type="linear"
            dataKey="avgDeal"
            name="Avg deal"
            stroke="var(--chart-series-2)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, strokeWidth: 2, stroke: "var(--card)" }}
            connectNulls
            isAnimationActive={!reduceMotion}
            animationDuration={280}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
