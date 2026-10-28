"use client";

import type { ReactNode } from "react";

export type AnalyticsTooltipSeries = {
  /** Key on the chart datum. */
  key: string;
  label: string;
  /** CSS colour of the series dot. */
  color: string;
  /** Formats the value shown on the right of the row. */
  format?: (value: number) => string;
  /** Key of the previous-period companion series, when comparing. */
  priorKey?: string;
  priorLabel?: string;
};

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string;
  value?: number | string;
  color?: string;
  payload?: Record<string, unknown>;
};

export type AnalyticsTooltipProps = {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: ReactNode;
  series: AnalyticsTooltipSeries[];
  /** Formats the header (bucket label). */
  labelFormatter?: (label: ReactNode) => ReactNode;
  /** Formats a value that no series claims. */
  defaultFormat?: (value: number) => string;
};

/**
 * The one chart tooltip: a compact surface with a hairline border, the bucket
 * label as a header, and one row per series — dot, label, right-aligned
 * value. Previous-period rows repeat the series in a muted tone so the
 * comparison never has to be inferred from the dash pattern alone.
 */
export function AnalyticsTooltip({
  active,
  payload,
  label,
  series,
  labelFormatter,
  defaultFormat,
}: AnalyticsTooltipProps) {
  if (!active || !payload?.length) return null;

  const rows: Array<{
    key: string;
    label: string;
    color: string;
    value: string;
    muted: boolean;
  }> = [];

  for (const entry of series) {
    const current = payload.find((item) => item.dataKey === entry.key);
    if (current && current.value !== undefined && current.value !== null) {
      rows.push({
        key: entry.key,
        label: entry.label,
        color: entry.color,
        value: (entry.format ?? defaultFormat ?? String)(Number(current.value)),
        muted: false,
      });
    }

    if (entry.priorKey) {
      const prior = payload.find((item) => item.dataKey === entry.priorKey);
      if (prior && prior.value !== undefined && prior.value !== null) {
        rows.push({
          key: entry.priorKey,
          label: entry.priorLabel ?? `${entry.label} (previous)`,
          color: entry.color,
          value: (entry.format ?? defaultFormat ?? String)(Number(prior.value)),
          muted: true,
        });
      }
    }
  }

  if (rows.length === 0) return null;

  return (
    // `pointer-events-none` keeps the tooltip from stealing the pointer from
    // the chart, so it cannot follow the cursor while the cursor is on it.
    // The numbers are copyable from the chart's Table view.
    <div className="motion-enter pointer-events-none min-w-40 rounded-lg border border-border/60 bg-popover px-2.5 py-2 text-xs shadow-sm">
      <p className="mb-1.5 font-medium text-foreground">
        {labelFormatter ? labelFormatter(label) : label}
      </p>
      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            <span
              aria-hidden
              className="size-2 shrink-0 rounded-full"
              style={{
                backgroundColor: row.color,
                opacity: row.muted ? 0.4 : 1,
              }}
            />
            <span
              className={
                row.muted
                  ? "min-w-0 flex-1 truncate text-muted-foreground/70"
                  : "min-w-0 flex-1 truncate text-muted-foreground"
              }
            >
              {row.label}
            </span>
            <span className="shrink-0 font-semibold text-foreground tabular-nums">
              {row.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
