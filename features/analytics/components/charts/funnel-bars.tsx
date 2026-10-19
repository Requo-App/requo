import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { formatNumber, formatPercent } from "@/features/analytics/lib/format";
import { chartSeries } from "@/features/analytics/lib/chart-theme";
import type { AnalyticsFunnelStep } from "@/features/analytics/types";
import { cn } from "@/lib/utils";

/**
 * Proportional funnel that works at every width: a segmented band from `sm`
 * up (bars sized against the first step) and labeled stacked rows on phones.
 * Each stage after the first carries its step conversion, so drop-off is
 * visible without hovering. Server-rendered — no chart library needed for
 * four bars — and every stage with an href links to the matching list.
 */
export function FunnelBars({
  steps,
  showDropOff = true,
  ariaLabel,
}: {
  steps: AnalyticsFunnelStep[];
  showDropOff?: boolean;
  ariaLabel: string;
}) {
  const firstCount = steps[0]?.count ?? 0;
  const total = steps.reduce((sum, step) => sum + step.count, 0);

  if (steps.length === 0 || total === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No funnel activity in this period yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Band — sm and up */}
      <div
        className="hidden h-16 items-stretch gap-1 sm:flex"
        role="img"
        aria-label={ariaLabel}
      >
        {steps.map((step, index) => {
          const share = firstCount > 0 ? step.count / firstCount : 0;
          const width = Math.max(share * 100, step.count > 0 ? 8 : 0);

          return (
            <div
              key={step.key}
              className={cn(
                "relative flex min-w-0 items-center justify-center overflow-hidden rounded-lg",
                index === 0 && "rounded-l-xl",
                index === steps.length - 1 && "rounded-r-xl",
              )}
              style={{ width: `${width}%`, backgroundColor: chartSeries(index) }}
              title={`${step.label}: ${formatNumber(step.count)}`}
            >
              <span className="rounded-full bg-card/95 px-2 py-0.5 text-xs font-semibold tabular-nums text-foreground shadow-xs">
                {formatNumber(step.count)}
              </span>
            </div>
          );
        })}
      </div>

      {/* Rows — all widths, and the only view on phones */}
      <ul className="flex flex-col gap-2">
        {steps.map((step, index) => {
          const prior = index > 0 ? steps[index - 1].count : null;
          const stepShare =
            prior !== null && prior > 0 ? step.count / prior : null;
          const content = (
            <>
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: chartSeries(index) }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
                {step.label}
              </span>
              {showDropOff && stepShare !== null ? (
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatPercent(stepShare)} of {steps[index - 1].label.toLowerCase()}
                </span>
              ) : null}
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatNumber(step.count)}
              </span>
              {step.href ? (
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              ) : null}
            </>
          );

          return (
            <li key={step.key}>
              {step.href ? (
                <Link
                  href={step.href}
                  className="flex min-h-9 items-center gap-2 rounded-lg px-2 -mx-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {content}
                </Link>
              ) : (
                <div className="flex min-h-9 items-center gap-2 px-2 -mx-2">
                  {content}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
