import { chartSeries } from "@/features/analytics/lib/chart-theme";
import { formatDuration, formatPercent } from "@/features/analytics/lib/format";
import type { AnalyticsBenchmarkRow } from "@/features/analytics/types";
import { cn } from "@/lib/utils";

function formatBenchmarkValue(row: AnalyticsBenchmarkRow, value: number | null) {
  if (value === null) return "—";
  return row.format === "percent" ? formatPercent(value) : formatDuration(value);
}

function MirrorBadge({ row }: { row: AnalyticsBenchmarkRow }) {
  if (row.yours === null || row.median === null) return null;

  const better = row.lowerIsBetter ? row.yours < row.median : row.yours > row.median;
  const equal = row.yours === row.median;

  return (
    <span
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-medium tabular-nums",
        equal
          ? "bg-muted text-muted-foreground"
          : better
            ? "bg-success/10 text-success"
            : "bg-destructive/10 text-destructive",
      )}
    >
      {equal ? "At median" : better ? "Above median" : "Below median"}
    </span>
  );
}

function BenchmarkRow({ row }: { row: AnalyticsBenchmarkRow }) {
  const values = [row.yours, row.median].filter(
    (value): value is number => value !== null,
  );
  const max = values.length > 0 ? Math.max(...values) : 0;

  if (row.median === null || row.yours === null) {
    return (
      <li className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-foreground">{row.label}</span>
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatBenchmarkValue(row, row.yours)}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          {row.yours === null
            ? "No data from your workspace in this period."
            : "Not enough peer data yet — benchmarks publish at 10+ businesses."}
        </p>
      </li>
    );
  }

  const yoursWidth = max > 0 ? (row.yours / max) * 100 : 0;
  const medianLeft = max > 0 ? (row.median / max) * 100 : 0;

  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground">{row.label}</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatBenchmarkValue(row, row.yours)}
        </span>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.max(yoursWidth, 2)}%`, backgroundColor: chartSeries(0) }}
        />
        <span
          aria-hidden
          className="absolute -top-1 h-4 w-0.5 rounded-full bg-foreground"
          style={{ left: `${medianLeft}%` }}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>
          Peer median {formatBenchmarkValue(row, row.median)}
          {row.businessCount ? ` · ${row.businessCount} businesses` : ""}
        </span>
        <MirrorBadge row={row} />
      </div>
    </li>
  );
}

/**
 * "How do I compare" rows: your value vs the peer median marker on a shared
 * track. Peer counts are shown so the privacy floor (10+ businesses) is
 * legible, and a missing median says why instead of rendering an empty bar.
 */
export function BenchmarkBars({ rows }: { rows: AnalyticsBenchmarkRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Benchmarks appear once enough similar businesses have data.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-5">
      {rows.map((row) => (
        <BenchmarkRow key={row.key} row={row} />
      ))}
    </ul>
  );
}
