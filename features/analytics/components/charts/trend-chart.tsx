"use client";

import { useId, useMemo, useState } from "react";
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
  type ChartConfig,
} from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import {
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/features/analytics/lib/format";
import { cn } from "@/lib/utils";

import { EmptyState } from "../primitives/empty-state";
import { AnalyticsTooltip, type AnalyticsTooltipSeries } from "./analytics-tooltip";
import { ChartSeriesToggles } from "./chart-series-legend";

export type TrendPoint = {
  label: string;
  [key: string]: number | string | null | undefined;
};

export type TrendSeries = {
  /** Key on the datum. */
  key: string;
  label: string;
  color: string;
  /** Previous-period companion key; only read when comparing. */
  priorKey?: string;
  priorLabel?: string;
  /** How the tooltip renders the value. */
  format?: TrendValueFormat;
};

/** The value shapes a trend series can carry. */
export type TrendValueFormat = "number" | "money" | "percent";

function formatValue(
  value: number,
  kind: TrendValueFormat,
  currency: string,
): string {
  if (kind === "money") return formatMoney(Math.round(value), currency);
  if (kind === "percent") return formatPercent(value);
  return formatNumber(value);
}

/**
 * Bucketed trend chart.
 *
 * Count series are sparse, so the line is unsmoothed — a straight segment
 * never implies a value between two buckets. Only the primary series carries
 * the soft area fill; previous periods repeat as a 1px dashed neutral line.
 *
 * The axis domain comes from the data: a chart whose values are all zero
 * draws nothing and shows the empty state instead of a flat line on a
 * meaningless scale.
 */
export function TrendChart({
  points,
  series,
  showCompare = false,
  ariaLabel,
  height = 260,
  emptyLabel = "No activity in this period.",
  currency = "USD",
  className,
}: {
  points: TrendPoint[];
  series: TrendSeries[];
  showCompare?: boolean;
  ariaLabel: string;
  /** Plot height in pixels. */
  height?: number;
  emptyLabel?: string;
  /** Workspace currency, used when a series carries money. */
  currency?: string;
  className?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const gradientId = useId().replace(/:/g, "");
  const [hidden, setHidden] = useState<string[]>([]);

  const visibleSeries = useMemo(
    () => series.filter((entry) => !hidden.includes(entry.key)),
    [series, hidden],
  );

  const data = useMemo(
    () =>
      points.map((point) => {
        const datum: Record<string, number | string | null> = { label: point.label };
        for (const entry of series) {
          const value = point[entry.key];
          datum[entry.key] = typeof value === "number" ? value : null;
          if (showCompare && entry.priorKey) {
            const prior = point[entry.priorKey];
            datum[entry.priorKey] = typeof prior === "number" ? prior : null;
          }
        }
        return datum;
      }),
    [points, series, showCompare],
  );

  const hasData = useMemo(
    () =>
      data.some((datum) =>
        series.some((entry) => {
          const value = datum[entry.key];
          return typeof value === "number" && value !== 0;
        }),
      ),
    [data, series],
  );

  const config: ChartConfig = {};
  for (const entry of series) {
    config[entry.key] = { label: entry.label, color: entry.color };
    if (showCompare && entry.priorKey) {
      config[entry.priorKey] = {
        label: entry.priorLabel ?? `${entry.label} (previous)`,
        color: entry.color,
      };
    }
  }

  // At most six x-labels, evenly spaced across the window.
  const xTicks = useMemo(() => {
    const maxLabels = 6;
    if (points.length <= maxLabels) return points.map((point) => point.label);
    const step = (points.length - 1) / (maxLabels - 1);
    return Array.from({ length: maxLabels }, (_, index) => {
      const point = points[Math.round(index * step)];
      return point?.label ?? "";
    });
  }, [points]);

  const tooltipSeries: AnalyticsTooltipSeries[] = series.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
    format: (value) => formatValue(value, entry.format ?? "number", currency),
    priorKey: showCompare ? entry.priorKey : undefined,
    priorLabel: entry.priorLabel,
  }));

  if (!hasData) {
    return <EmptyState label={emptyLabel} className={className} />;
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <ChartContainer
        config={config}
        className="aspect-auto w-full"
        style={{ height }}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
      >
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-series-1)" stopOpacity={0.12} />
              <stop offset="100%" stopColor="var(--chart-series-1)" stopOpacity={0} />
            </linearGradient>
          </defs>

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
            width={44}
            allowDecimals={false}
            tickCount={4}
            domain={[
              0,
              (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.1) : 1),
            ]}
          />
          <ChartTooltip
            cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
            content={<AnalyticsTooltip series={tooltipSeries} />}
          />

          {visibleSeries.map((entry, index) =>
            index === 0 ? (
              <Area
                key={entry.key}
                type="linear"
                dataKey={entry.key}
                name={entry.label}
                stroke={entry.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{
                  r: 3.5,
                  strokeWidth: 2,
                  stroke: "var(--card)",
                  fill: entry.color,
                }}
                connectNulls
                isAnimationActive={!reduceMotion}
                animationDuration={280}
              />
            ) : (
              <Line
                key={entry.key}
                type="linear"
                dataKey={entry.key}
                name={entry.label}
                stroke={entry.color}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                dot={false}
                activeDot={{
                  r: 3.5,
                  strokeWidth: 2,
                  stroke: "var(--card)",
                  fill: entry.color,
                }}
                connectNulls
                isAnimationActive={!reduceMotion}
                animationDuration={280}
              />
            ),
          )}

          {showCompare
            ? visibleSeries
                .filter((entry) => entry.priorKey)
                .map((entry) => (
                  <Line
                    key={`${entry.key}Prior`}
                    type="linear"
                    dataKey={entry.priorKey}
                    name={entry.priorLabel ?? `${entry.label} (previous)`}
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    strokeOpacity={0.4}
                    dot={false}
                    activeDot={false}
                    connectNulls
                    isAnimationActive={!reduceMotion}
                    animationDuration={280}
                  />
                ))
            : null}
        </ComposedChart>
      </ChartContainer>

      {series.length > 1 ? (
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
