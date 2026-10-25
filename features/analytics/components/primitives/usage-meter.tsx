import type { ReactNode } from "react";

import { formatNumber } from "@/features/analytics/format";
import type { AnalyticsUsageMeter } from "@/features/analytics/types";
import { cn } from "@/lib/utils";

/**
 * Plan-limit meter. A 4px track with the used/limit figures in tabular
 * numerals; the fill steps from the accent to warning at 80% and danger at
 * 100%, so a nearly-spent allowance reads before it is spent.
 */
export function UsageMeter({
  meter,
  action,
  className,
}: {
  meter: AnalyticsUsageMeter;
  action?: ReactNode;
  className?: string;
}) {
  const limit = meter.limit;

  if (limit === 0) {
    return (
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-2",
          className,
        )}
      >
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">{meter.label}</p>
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
  const fillClassName =
    ratio === null
      ? "bg-primary"
      : ratio >= 1
        ? "bg-destructive"
        : ratio >= 0.8
          ? "bg-warning"
          : "bg-primary";

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-foreground">
          {meter.label}
        </p>
        <p className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {formatNumber(meter.used)}
          {limit === null
            ? ` ${meter.unit} · Unlimited`
            : ` / ${formatNumber(limit)} ${meter.unit}`}
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
        className="analytics-track h-1 w-full overflow-hidden rounded-full"
      >
        <div
          className={cn("h-full rounded-full", fillClassName)}
          style={{
            width:
              ratio === null ? "100%" : `${Math.max(ratio * 100, meter.used > 0 ? 2 : 0)}%`,
          }}
        />
      </div>
      <p className="text-xs text-muted-foreground">{meter.hint}</p>
    </div>
  );
}
