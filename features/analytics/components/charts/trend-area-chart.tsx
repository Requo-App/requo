"use client";

import { useState } from "react";
import {
  Area,
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
import type { AnalyticsSeriesPoint } from "@/features/analytics/types";

import { ChartSeriesToggles } from "./chart-series-legend";

export type TrendAreaSeries = {
  /** Key on `AnalyticsSeriesPoint`. */
  key: string;
  label: string;
  color: string;
  /** Prior-period companion series; only rendered when comparing. */
  priorKey?: string;
  priorLabel?: string;
};

type TrendAreaDatum = Record<string, number | string>;

/**
 * Generic bucketed trend chart used by the Overview pipeline card and the
 * Performance acquisition card: up to three solid series plus dashed
 * prior-period ghosts when comparison is on. Series >2 are toggleable and the
 * underlying numbers are exposed by the card's `ChartDataTable`.
 */
export function TrendAreaChart({
  points,
  series,
  showCompare,
  ariaLabel,
}: {
  points: AnalyticsSeriesPoint[];
  series: TrendAreaSeries[];
  showCompare: boolean;
  ariaLabel: string;
}) {
  const toggleable = series.length > 2;
  const [hidden, setHidden] = useState<string[]>([]);

  const visibleSeries = series.filter((entry) => !hidden.includes(entry.key));

  const data: TrendAreaDatum[] = points.map((point) => {
    const datum: TrendAreaDatum = { label: point.label };

    for (const entry of series) {
      datum[entry.key] = Number(point[entry.key as keyof AnalyticsSeriesPoint] ?? 0);
      if (showCompare && entry.priorKey) {
        datum[`${entry.key}Prior`] =
          Number(point[entry.priorKey as keyof AnalyticsSeriesPoint] ?? 0);
      }
    }

    return datum;
  });

  const config: ChartConfig = {};
  for (const entry of series) {
    config[entry.key] = { label: entry.label, color: entry.color };
    if (showCompare && entry.priorKey) {
      config[`${entry.key}Prior`] = {
        label: entry.priorLabel ?? `${entry.label} (previous)`,
        color: entry.color,
      };
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer
        className="h-64 w-full sm:h-72"
        config={config}
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
          <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          {visibleSeries.map((entry) => (
            <Area
              key={entry.key}
              type="monotone"
              dataKey={entry.key}
              name={entry.label}
              stroke={entry.color}
              fill={entry.color}
              fillOpacity={0.08}
              strokeWidth={2}
            />
          ))}
          {showCompare
            ? visibleSeries
                .filter((entry) => entry.priorKey)
                .map((entry) => (
                  <Line
                    key={`${entry.key}Prior`}
                    type="monotone"
                    dataKey={`${entry.key}Prior`}
                    name={config[`${entry.key}Prior`]?.label as string}
                    stroke={entry.color}
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    dot={false}
                    strokeOpacity={0.7}
                  />
                ))
            : null}
        </ComposedChart>
      </ChartContainer>

      {toggleable ? (
        <ChartSeriesToggles
          items={series.map((entry) => ({
            key: entry.key,
            label: entry.label,
            color: entry.color,
          }))}
          hidden={hidden}
          onToggle={(key) =>
            setHidden((current) =>
              current.includes(key)
                ? current.filter((entry) => entry !== key)
                : [...current, key],
            )
          }
        />
      ) : null}
    </div>
  );
}
