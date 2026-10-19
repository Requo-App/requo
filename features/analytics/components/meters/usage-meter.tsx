import type { ReactNode } from "react";

import { formatNumber } from "@/features/analytics/lib/format";
import type { AnalyticsUsageMeter } from "@/features/analytics/types";
import { cn } from "@/lib/utils";

/**
 * Plan-limit bar with `role="progressbar"`. Tones step up as usage approaches
 * the cap; a cap of zero renders the upsell action instead of an empty bar,
 * because "0 of 0 credits" is not a progress state.
 */
export function UsageMeter({
  meter,
  action,
}: {
  meter: AnalyticsUsageMeter;
  action?: ReactNode;
}) {
  const limit = meter.limit;

  if (limit === 0) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-foreground">{meter.label}</p>
          <p className="text-xs text-muted-foreground">{meter.hint}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-xs text-muted-foreground">Not included</span>
          {action}
        </div>
      </div>
    );
  }

  const ratio = limit === null ? null : Math.min(meter.used / limit, 1);
  const tone =
    ratio === null
      ? "bg-chart-2"
      : ratio >= 1
        ? "bg-destructive"
        : ratio >= 0.8
          ? "bg-warning"
          : "bg-chart-1";

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-foreground">{meter.label}</p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {formatNumber(meter.used)}
          {limit === null ? ` ${meter.unit} · Unlimited` : ` / ${formatNumber(limit)} ${meter.unit}`}
        </p>
      </div>
      <div
        role="progressbar"
        aria-label={meter.label}
        aria-valuemin={0}
        aria-valuemax={limit ?? undefined}
        aria-valuenow={limit === null ? undefined : meter.used}
        aria-valuetext={
          limit === null
            ? `${formatNumber(meter.used)} ${meter.unit}, unlimited`
            : `${formatNumber(meter.used)} of ${formatNumber(limit)} ${meter.unit}`
        }
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", tone)}
          style={{ width: ratio === null ? "100%" : `${Math.max(ratio * 100, 2)}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{meter.hint}</p>
    </div>
  );
}
