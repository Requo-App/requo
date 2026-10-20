import { cn } from "@/lib/utils";

/**
 * Tiny inline trend for KPI cards — a plain SVG, not a chart library, so the
 * KPI row stays cheap (no Recharts in the initial bundle) and every card can
 * afford a sparkline. No axes, no tooltip; the KPI number and delta carry the
 * meaning and the full series lives in the tab's trend card.
 */
export function AnalyticsSparkline({
  values,
  className,
  ariaLabel,
}: {
  /** Bucketed values in chronological order. */
  values: number[];
  className?: string;
  ariaLabel?: string;
}) {
  if (values.length < 2) return null;

  const width = 100;
  const height = 40;
  const padding = 3;
  const max = Math.max(...values);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((value, index) => {
    const x = index * step;
    const y = padding + (1 - (value - min) / range) * (height - padding * 2);
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={cn("h-[var(--analytics-sparkline-height)] w-full text-chart-1", className)}
      role="img"
      aria-label={ariaLabel ?? "Trend"}
    >
      <path d={area} fill="currentColor" fillOpacity={0.12} stroke="none" />
      <path
        d={line}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
