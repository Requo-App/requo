import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { DeltaBadge, type DeltaBadgeSentiment } from "../primitives/delta-badge";
import { AnalyticsSparkline } from "./analytics-sparkline";
import { MetricHint } from "./metric-hint";

export type AnalyticsKpiStat = {
  key: string;
  label: string;
  value: string;
  /** Drill-down target; when set the label links to the matching list. */
  href?: string | null;
  /** Metric definition shown on hover. */
  hint?: string;
  delta?: string | null;
  deltaDirection?: "up" | "down" | "flat";
  deltaSentiment?: DeltaBadgeSentiment;
  /** Context line under the value, e.g. "vs previous period". */
  caption?: string;
  /** Bucketed series for the inline sparkline. */
  sparkline?: number[];
  sparklineLabel?: string;
};

/**
 * KPI tile for the analytics strip: a muted label, the number as the hero,
 * an optional delta, and a 40px sparkline where the metric has a per-bucket
 * series. No icon tile — the number is the graphic.
 */
export function AnalyticsKpiCard({ stat }: { stat: AnalyticsKpiStat }) {
  return (
    <section className="analytics-card flex min-w-0 flex-col gap-2 p-4">
      <div className="flex min-w-0 items-center gap-1.5">
        {stat.href ? (
          <Link
            href={stat.href}
            className="group/kpi flex min-w-0 items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{stat.label}</span>
            <ArrowUpRight
              className="size-3 shrink-0 text-muted-foreground/60 transition-colors group-hover/kpi:text-foreground"
              aria-hidden
            />
          </Link>
        ) : (
          <span className="truncate text-xs font-medium text-muted-foreground">
            {stat.label}
          </span>
        )}
        {stat.hint ? <MetricHint label={stat.label} hint={stat.hint} /> : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums whitespace-nowrap">
          {stat.value}
        </span>
        {stat.delta ? (
          <DeltaBadge
            delta={stat.delta}
            direction={stat.deltaDirection}
            sentiment={stat.deltaSentiment}
          />
        ) : null}
      </div>

      {stat.caption ? (
        <span className="text-xs leading-4 text-muted-foreground">
          {stat.caption}
        </span>
      ) : null}

      {stat.sparkline && stat.sparkline.length > 1 ? (
        <AnalyticsSparkline
          values={stat.sparkline}
          className="mt-auto"
          ariaLabel={`${stat.label} trend`}
        />
      ) : null}
    </section>
  );
}
