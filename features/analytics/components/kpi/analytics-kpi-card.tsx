import type { ComponentType } from "react";
import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import {
  DeltaPill,
  type DeltaPillDirection,
  type DeltaPillSentiment,
} from "@/components/shared/delta-pill";
import { cn } from "@/lib/utils";

import { AnalyticsSparkline } from "./analytics-sparkline";
import { MetricHint } from "./metric-hint";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export type AnalyticsKpiStat = {
  key: string;
  label: string;
  value: string;
  icon?: IconComponent;
  /** Drill-down target; when set the label links to the matching list. */
  href?: string | null;
  /** Footer caption; defaults to the comparison wording when a delta is set. */
  caption?: string;
  /** Metric definition shown on hover. */
  hint?: string;
  delta?: string | null;
  deltaDirection?: DeltaPillDirection;
  deltaSentiment?: DeltaPillSentiment;
  /** Bucketed series for the inline sparkline. */
  sparkline?: number[];
  sparklineLabel?: string;
};

/**
 * KPI card for the analytics row: icon tile, label, value, optional inline
 * sparkline, and a footer band carrying the comparison caption and delta pill.
 * Mirrors the home dashboard's footer stat cards so the two surfaces read as
 * one system; the delta's glyph and sentiment are always explicit because
 * "lower is better" metrics point opposite to their sentiment.
 */
export function AnalyticsKpiCard({ stat }: { stat: AnalyticsKpiStat }) {
  const Icon = stat.icon;
  const hasFooter = Boolean(stat.delta) || Boolean(stat.caption) || Boolean(stat.hint);

  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-card p-2">
      <div className="flex w-full items-start justify-between gap-2.5 p-2">
        {Icon ? (
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            <Icon className="size-5 shrink-0" aria-hidden />
          </span>
        ) : (
          <span aria-hidden />
        )}
        {stat.hint ? <MetricHint label={stat.label} hint={stat.hint} /> : null}
      </div>

      <div className="flex flex-col gap-0.5 px-2 pt-2.5 pb-3.5">
        <p className="flex min-w-0 items-center gap-1 text-sm font-medium text-muted-foreground">
          {stat.href ? (
            <Link
              href={stat.href}
              className="truncate rounded-sm outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              {stat.label}
            </Link>
          ) : (
            <span className="truncate">{stat.label}</span>
          )}
          {stat.href ? (
            <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
          ) : null}
        </p>
        <p className="whitespace-nowrap text-2xl font-semibold tracking-tight text-foreground tabular-nums">
          {stat.value}
        </p>
        {stat.sparkline && stat.sparkline.length > 1 ? (
          <AnalyticsSparkline
            values={stat.sparkline}
            className="mt-1.5"
            ariaLabel={`${stat.label} trend`}
          />
        ) : null}
      </div>

      {hasFooter ? (
        <div className="mt-auto flex w-full items-center justify-between gap-2 rounded-xl bg-muted py-1.5 pr-1.5 pl-2.5">
          <p className="truncate text-xs text-muted-foreground">
            {stat.caption ?? (stat.delta ? "vs previous period" : "Current period")}
          </p>
          <DeltaPill
            delta={stat.delta}
            direction={stat.deltaDirection}
            sentiment={stat.deltaSentiment}
          />
        </div>
      ) : null}
    </section>
  );
}

export function AnalyticsKpiRow({
  stats,
  className,
}: {
  stats: AnalyticsKpiStat[];
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className,
      )}
    >
      {stats.map((stat) => (
        <AnalyticsKpiCard key={stat.key} stat={stat} />
      ))}
    </div>
  );
}
