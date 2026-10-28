"use client";

import { Cell, Pie, PieChart } from "recharts";

import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import { usePrefersReducedMotion } from "@/hooks/use-prefers-reduced-motion";
import { cn } from "@/lib/utils";

export type DonutSlice = {
  key: string;
  label: string;
  count: number;
  /** Share of the total (0–1). */
  share: number;
  /** Formatted value (money, count, …) shown in the legend. */
  value?: string;
  /** CSS colour for the segment and its legend dot. */
  color: string;
};

/**
 * Outcome donut: a 128px ring with a 10px stroke, small gaps between
 * segments, the total in the middle, and the breakdown in a legend beside it.
 *
 * Segments carry a semantic colour (accepted / awaiting / rejected / expired)
 * and the legend repeats the label, count, and share, so colour is never the
 * only signal.
 */
export function Donut({
  slices,
  centerValue,
  centerLabel,
  ariaLabel,
  className,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerLabel: string;
  ariaLabel: string;
  className?: string;
}) {
  const reduceMotion = usePrefersReducedMotion();
  const config: ChartConfig = {};
  for (const slice of slices) {
    config[slice.key] = { label: slice.label, color: slice.color };
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col items-center justify-center gap-5 @[22rem]:flex-row @[22rem]:items-center",
        className,
      )}
    >
      <div className="relative size-36 shrink-0 @[22rem]:size-40">
        <ChartContainer
          config={config}
          className="size-36 @[22rem]:size-40"
          role="img"
          aria-label={ariaLabel}
        >
          <PieChart>
            <ChartTooltip content={<DonutTooltip />} />
            <Pie
              data={slices}
              dataKey="count"
              nameKey="key"
              innerRadius="76%"
              outerRadius="92%"
              paddingAngle={2}
              strokeWidth={0}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={!reduceMotion}
              animationDuration={240}
            >              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl leading-none font-semibold tracking-tight text-foreground tabular-nums">
            {centerValue}
          </span>
          <span className="meta-label mt-1">
            {centerLabel}
          </span>
        </div>
      </div>

      <ul className="flex min-w-0 flex-1 flex-col gap-2.5">
        {slices.map((slice) => (
          <li key={slice.key} className="flex min-w-0 items-center gap-2 text-sm">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{ backgroundColor: slice.color }}
            />
            <TruncatedTextWithTooltip
              text={slice.label}
              className="min-w-0 text-muted-foreground"
            />
            <span className="ml-auto shrink-0 font-semibold text-foreground tabular-nums">
              {slice.count.toLocaleString()}
            </span>
            <span className="w-11 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {Math.round(slice.share * 100)}%
            </span>
            {slice.value ? (
              <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground tabular-nums @[22rem]:block">
                {slice.value}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

type DonutTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload?: DonutSlice }>;
};

function DonutTooltip({ active, payload }: DonutTooltipProps) {
  if (!active || !payload?.length) return null;
  const slice = payload[0]?.payload;
  if (!slice) return null;

  return (
    <div className="tooltip-surface rounded-lg px-2.5 py-1.5 text-xs">
      <span className="text-muted-foreground">{slice.label}</span>
      <span className="ml-2 font-semibold text-foreground tabular-nums">
        {slice.count.toLocaleString()}
      </span>
    </div>
  );
}
