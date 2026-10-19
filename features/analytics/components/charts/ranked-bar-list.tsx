import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

import { chartSeries } from "@/features/analytics/lib/chart-theme";
import type { AnalyticsRankedItem } from "@/features/analytics/types";

/**
 * Ranked rows with share bars — sources, services, customers, payment mix.
 * The bar is the item's share of the list total; when the item carries an
 * href the row links to the matching filtered list.
 */
export function RankedBarList({
  items,
  emptyLabel = "No data in this period.",
  maxItems = 8,
  barColor = chartSeries(0),
  formatValue = (item) => item.count.toLocaleString(),
}: {
  items: AnalyticsRankedItem[];
  emptyLabel?: string;
  maxItems?: number;
  barColor?: string;
  /** Value label for the row; defaults to the raw count (win-rate rows pass `formatPercent(item.share)`). */
  formatValue?: (item: AnalyticsRankedItem) => string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.slice(0, maxItems).map((item) => {
        const row = (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {item.label}
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatValue(item)}
              </span>
              {item.href ? (
                <ArrowUpRight
                  className="size-3.5 shrink-0 text-muted-foreground/70"
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(item.share * 100, 2)}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
            {item.detail ? (
              <p className="text-xs text-muted-foreground">{item.detail}</p>
            ) : null}
          </>
        );

        return (
          <li key={`${item.label}-${item.count}`}>
            {item.href ? (
              <Link
                href={item.href}
                className="-mx-2 flex flex-col gap-1.5 rounded-lg px-2 py-1.5 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
              >
                {row}
              </Link>
            ) : (
              <div className="flex flex-col gap-1.5 px-0 py-1.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
