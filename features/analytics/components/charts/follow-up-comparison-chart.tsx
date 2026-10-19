"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatPercent } from "@/features/analytics/lib/format";
import type { FollowUpEffectivenessData } from "@/features/analytics/types";

/**
 * With vs without follow-up: the operations headline. Grouped bars compare
 * response and acceptance rates side by side; the card's caption table carries
 * the cohort sizes so a rate never floats free of its denominator.
 */
export function FollowUpComparisonChart({
  effectiveness,
  ariaLabel,
}: {
  effectiveness: FollowUpEffectivenessData;
  ariaLabel: string;
}) {
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
    withFollowUp: { label: "With follow-up", color: "var(--success)" },
    withoutFollowUp: { label: "Without follow-up", color: "var(--muted-foreground)" },
  };

  return (
    <ChartContainer
      config={config}
      className="h-56 w-full"
      role="img"
      aria-label={ariaLabel}
    >
      <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="metric" tickLine={false} axisLine={false} />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={40}
          tickFormatter={(value: number) => formatPercent(value, 0)}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              indicator="line"
              formatter={(value, name) => (
                <div className="flex w-full items-center justify-between gap-3">
                  <span className="text-muted-foreground">{name}</span>
                  <span className="font-medium tabular-nums text-foreground">
                    {formatPercent(Number(value))}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar
          dataKey="withFollowUp"
          name="With follow-up"
          fill="var(--color-withFollowUp)"
          radius={6}
          maxBarSize={48}
        />
        <Bar
          dataKey="withoutFollowUp"
          name="Without follow-up"
          fill="var(--color-withoutFollowUp)"
          radius={6}
          maxBarSize={48}
        />
      </BarChart>
    </ChartContainer>
  );
}
