"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatCompactNumber, formatMoney } from "@/features/analytics/lib/format";
import type { AnalyticsSeriesPoint } from "@/features/analytics/types";

/**
 * Revenue trend: bars are accepted value per bucket, the line is the average
 * accepted deal size for the bucket. Money is formatted in the workspace
 * currency at every touchpoint (axis ticks compact, tooltip exact).
 */
export function RevenueTrendChart({
  points,
  currency,
  ariaLabel,
}: {
  points: AnalyticsSeriesPoint[];
  currency: string;
  ariaLabel: string;
}) {
  const data = points.map((point) => ({
    label: point.label,
    revenue: point.revenueInCents / 100,
    avgDeal:
      point.quotesAccepted > 0 ? point.revenueInCents / point.quotesAccepted / 100 : null,
  }));

  const config: ChartConfig = {
    revenue: { label: "Revenue won", color: "var(--chart-1)" },
    avgDeal: { label: "Avg deal", color: "var(--chart-3)" },
  };

  return (
    <ChartContainer
      config={config}
      className="h-64 w-full sm:h-72"
      role="img"
      aria-label={ariaLabel}
    >
      <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={24}
          interval="preserveStartEnd"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={52}
          tickFormatter={(value: number) => formatCompactNumber(value)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(label) => String(label ?? "")}
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatMoney(Number(value) * 100, currency)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="revenue"
          name="Revenue won"
          fill="var(--color-revenue)"
          radius={6}
          maxBarSize={28}
        />
        <Line
          type="monotone"
          dataKey="avgDeal"
          name="Avg deal"
          stroke="var(--color-avgDeal)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </ComposedChart>
    </ChartContainer>
  );
}
