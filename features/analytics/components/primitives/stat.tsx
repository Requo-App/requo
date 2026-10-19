import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Children, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MetricHint } from "../kpi/metric-hint";
import { DeltaBadge, type DeltaBadgeSentiment } from "./delta-badge";

/**
 * The one stat shape used across analytics: a small muted label, a
 * tabular-nums value, and an optional caption or delta. Stats inside a card
 * are separated by 1px dividers rather than boxed tiles.
 */
export function Stat({
  label,
  value,
  caption,
  delta,
  deltaDirection,
  deltaSentiment,
  hint,
  href,
  className,
  valueClassName,
}: {
  label: string;
  value: ReactNode;
  caption?: ReactNode;
  delta?: string | null;
  deltaDirection?: "up" | "down" | "flat";
  deltaSentiment?: DeltaBadgeSentiment;
  /** Definition shown next to the label. */
  hint?: string;
  /** Drill-down target; the label becomes the link. */
  href?: string | null;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex min-w-0 items-center gap-1.5">
        {href ? (
          <Link
            href={href}
            className="group/stat flex min-w-0 items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="truncate">{label}</span>
            <ArrowUpRight
              className="size-3 shrink-0 text-muted-foreground/60 transition-colors group-hover/stat:text-foreground"
              aria-hidden
            />
          </Link>
        ) : (
          <span className="truncate text-xs font-medium text-muted-foreground">
            {label}
          </span>
        )}
        {hint ? <MetricHint label={label} hint={hint} /> : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "text-2xl leading-none font-semibold tracking-tight text-foreground tabular-nums whitespace-nowrap",
            valueClassName,
          )}
        >
          {value}
        </span>
        {delta ? (
          <DeltaBadge
            delta={delta}
            direction={deltaDirection}
            sentiment={deltaSentiment}
          />
        ) : null}
      </div>

      {caption ? (
        <span className="text-xs leading-4 text-muted-foreground">{caption}</span>
      ) : null}
    </div>
  );
}

/**
 * A grid of stats separated by 1px dividers. The divider pattern follows the
 * column count, so the first cell of every row is flush and nothing is boxed.
 */
export function StatGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  /** Columns at the `sm` breakpoint and up; one column below it. */
  columns?: 2 | 3;
  className?: string;
}) {
  const items = Children.toArray(children);

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-y-4 sm:grid-cols-2",
        columns === 3 && "lg:grid-cols-3",
        className,
      )}
    >
      {items.map((child, index) => (
        <div
          key={index}
          className={cn("min-w-0 px-0 sm:px-4", dividerClasses(index, columns))}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

/**
 * Divider classes for a stat cell. On phones the grid is a single column, so
 * every cell but the first carries a top rule; from `sm` up the rule follows
 * the column count.
 */
function dividerClasses(index: number, columns: number): string {
  if (index === 0) return "";
  const inRow = index % columns;
  const row = Math.floor(index / columns);
  const classes = ["max-sm:border-t", "max-sm:border-l-0"];
  if (row > 0) classes.push("border-t");
  if (inRow > 0) classes.push("border-l");
  return classes.join(" ");
}

/** A labelled group of stats. */
export function StatGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-3", className)}>
      <span className="meta-label">{label}</span>
      {children}
    </div>
  );
}

/** A drill-down link rendered in the analytics vocabulary. */
export function StatLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "group/stat-link inline-flex min-w-0 items-center gap-1 rounded-sm text-sm font-medium text-foreground outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <span className="truncate">{children}</span>
      <ArrowUpRight
        className="size-3.5 shrink-0 text-muted-foreground/70 transition-colors group-hover/stat-link:text-primary"
        aria-hidden
      />
    </Link>
  );
}
