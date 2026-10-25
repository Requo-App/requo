"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { chartStackSeries } from "@/features/analytics/lib/chart-theme";
import { formatNumber } from "@/features/analytics/format";
import type { TeamData } from "@/features/analytics/types";

import { AnalyticsTooltip, type AnalyticsTooltipSeries } from "./analytics-tooltip";
import { ChartSeriesToggles } from "./chart-series-legend";

const MAX_SERIES = 5;

/**
 * Stacked activity bars per member over the last six months. Members beyond
 * the top five roll into an "Others" series so the stack stays readable; the
 * legend toggles each series. The stack starts on the brand accent and steps
 * down through neutrals, so it never reads as a rainbow.
 */
export function TeamActivityChart({
  activity,
  ariaLabel,
}: {
  activity: TeamData["activitySeries"];
  ariaLabel: string;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const [hidden, setHidden] = useState<string[]>([]);

  const series = useMemo(() => {
    const ranked = [...activity.members].sort(
      (a, b) =>
        b.counts.reduce((sum, value) => sum + value, 0) -
        a.counts.reduce((sum, value) => sum + value, 0),
    );
    const top = ranked.slice(0, MAX_SERIES);
    const rest = ranked.slice(MAX_SERIES);

    const entries = top.map((member, index) => ({
      key: member.userId,
      label: member.name,
      color: chartStackSeries(index),
      counts: member.counts,
    }));

    if (rest.length > 0) {
      const bucketCount = activity.bucketLabels.length;
      const counts = Array.from({ length: bucketCount }, (_, index) =>
        rest.reduce((sum, member) => sum + (member.counts[index] ?? 0), 0),
      );
      entries.push({
        key: "others",
        label: `Others (${rest.length})`,
        color: chartStackSeries(MAX_SERIES),
        counts,
      });
    }

    return entries;
  }, [activity]);

  const data = activity.bucketLabels.map((label, index) => {
    const datum: Record<string, number | string> = { label };
    for (const entry of series) {
      datum[entry.key] = entry.counts[index] ?? 0;
    }
    return datum;
  });

  const config: ChartConfig = {};
  for (const entry of series) {
    config[entry.key] = { label: entry.label, color: entry.color };
  }

  const visible = series.filter((entry) => !hidden.includes(entry.key));

  const tooltipSeries: AnalyticsTooltipSeries[] = series.map((entry) => ({
    key: entry.key,
    label: entry.label,
    color: entry.color,
    format: (value) => formatNumber(value),
  }));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <ChartContainer
        config={config}
        className="aspect-auto h-52 w-full sm:h-[260px]"
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
            dataKey="label"
            tickLine={false}
            axisLine={false}
            height={22}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={44}
            allowDecimals={false}
            tickCount={4}
            domain={[0, (dataMax: number) => (dataMax > 0 ? Math.ceil(dataMax * 1.1) : 1)]}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)", fillOpacity: 0.4 }}
            content={<AnalyticsTooltip series={tooltipSeries} />}
          />
          {visible.map((entry, index) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              name={entry.label}
              stackId="activity"
              fill={entry.color}
              radius={index === visible.length - 1 ? [4, 4, 0, 0] : 0}
              maxBarSize={40}
              isAnimationActive={!reduceMotion}
              animationDuration={280}
            />
          ))}
        </BarChart>
      </ChartContainer>

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
    </div>
  );
}
