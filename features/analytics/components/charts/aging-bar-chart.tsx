"use client";

import { Bar, BarChart, Cell, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { chartSeries } from "@/features/analytics/lib/chart-theme";
import { formatMoney } from "@/features/analytics/lib/format";
import type { AnalyticsAgingBucket } from "@/features/analytics/types";

/**
 * Horizontal bars for aging buckets (quote aging, AR aging). The bar length
 * is the bucket's value in the workspace currency; the tooltip carries both
 * the count and the value so a bucket with many small quotes still reads.
 */
export function AgingBarChart({
  buckets,
  currency,
  ariaLabel,
}: {
  buckets: AnalyticsAgingBucket[];
  currency: string;
  ariaLabel: string;
}) {
  const data = buckets.map((bucket, index) => ({
    label: bucket.label,
    count: bucket.count,
    value: bucket.valueInCents / 100,
    fill: chartSeries(index),
  }));

  const config: ChartConfig = {
    value: { label: "Value", color: "var(--chart-1)" },
  };

  return (
    <ChartContainer
      config={config}
      className="h-56 w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          width={72}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              hideLabel
              indicator="dot"
              formatter={(value, _name, item) => {
                const datum = item.payload as { count: number; fill: string };
                return (
                  <div className="flex w-full items-center justify-between gap-3">
                    <span className="flex items-center gap-1.5 text-muted-foreground">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: datum.fill }}
                        aria-hidden
                      />
                      {formatMoney(Number(value) * 100, currency)} ·{" "}
                      {datum.count.toLocaleString()}{" "}
                      {datum.count === 1 ? "record" : "records"}
                    </span>
                  </div>
                );
              }}
            />
          }
        />
        <Bar dataKey="value" name="Value" barSize={18} radius={6}>
          {data.map((entry) => (
            <Cell key={entry.label} fill={entry.fill} />
          ))}
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
