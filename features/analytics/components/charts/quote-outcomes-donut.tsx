"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { chartSemantic, type ChartSemanticKey } from "@/features/analytics/lib/chart-theme";
import { formatPercent } from "@/features/analytics/lib/format";
import type { AnalyticsOutcomeKey, AnalyticsOutcomeSlice } from "@/features/analytics/types";

const SEMANTIC_BY_OUTCOME: Record<AnalyticsOutcomeKey, ChartSemanticKey> = {
  accepted: "accepted",
  rejected: "rejected",
  expired: "expired",
  open: "open",
  voided: "neutral",
};

/** Half-donut of quote outcomes with a center total and a count/share legend. */
export function QuoteOutcomesDonut({
  slices,
  centerValue,
  centerLabel,
  ariaLabel,
}: {
  slices: AnalyticsOutcomeSlice[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
}) {
  const data = slices.map((slice) => ({
    key: slice.key,
    label: slice.label,
    count: slice.count,
    share: slice.share,
    fill: chartSemantic(SEMANTIC_BY_OUTCOME[slice.key]),
  }));

  const config: ChartConfig = {};
  for (const slice of slices) {
    config[slice.key] = {
      label: slice.label,
      color: chartSemantic(SEMANTIC_BY_OUTCOME[slice.key]),
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative mx-auto w-full max-w-64">
        <ChartContainer
          config={config}
          className="aspect-[2/1] h-auto w-full"
          role="img"
          aria-label={ariaLabel}
        >
          <PieChart>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  indicator="dot"
                  formatter={(value, name) => {
                    const slice = data.find((entry) => entry.key === name);
                    return (
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="text-muted-foreground">
                          {slice?.label ?? name}
                        </span>
                        <span className="font-medium tabular-nums text-foreground">
                          {Number(value).toLocaleString()}
                          {slice ? ` · ${formatPercent(slice.share)}` : ""}
                        </span>
                      </div>
                    );
                  }}
                />
              }
            />
            <Pie
              data={data}
              dataKey="count"
              nameKey="key"
              startAngle={180}
              endAngle={0}
              innerRadius="68%"
              outerRadius="100%"
              paddingAngle={3}
              cornerRadius={8}
              strokeWidth={0}
            >
              {data.map((slice) => (
                <Cell key={slice.key} fill={slice.fill} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center">
          <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
            {centerValue}
          </p>
          <p className="meta-label">{centerLabel}</p>
        </div>
      </div>

      <ul className="grid grid-cols-2 gap-x-4 gap-y-2">
        {data.map((slice) => (
          <li key={slice.key} className="flex min-w-0 items-center gap-2">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: slice.fill }}
              aria-hidden
            />
            <span className="truncate text-xs text-muted-foreground">{slice.label}</span>
            <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums text-foreground">
              {slice.count.toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
