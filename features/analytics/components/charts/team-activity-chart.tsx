"use client";

import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { chartSeries } from "@/features/analytics/lib/chart-theme";
import type { TeamData } from "@/features/analytics/types";

import { ChartSeriesToggles } from "./chart-series-legend";

const MAX_SERIES = 5;

/**
 * Stacked activity bars per member over the last six months. Members beyond
 * the top five roll into an "Others" series so the stack stays readable; the
 * legend toggles each series.
 */
export function TeamActivityChart({
  activity,
  ariaLabel,
}: {
  activity: TeamData["activitySeries"];
  ariaLabel: string;
}) {
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
      color: chartSeries(index),
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
        color: chartSeries(MAX_SERIES),
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

  return (
    <div className="flex flex-col gap-3">
      <ChartContainer
        config={config}
        className="h-64 w-full"
        role="img"
        aria-label={ariaLabel}
      >
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={36} allowDecimals={false} />
          <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
          {visible.map((entry, index) => (
            <Bar
              key={entry.key}
              dataKey={entry.key}
              name={entry.label}
              stackId="activity"
              fill={entry.color}
              radius={index === visible.length - 1 ? 6 : 0}
              maxBarSize={40}
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
