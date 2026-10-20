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
 *
 * Cells touch: row spacing comes from cell padding, not a grid gap, so the
 * vertical rules run continuously through every row instead of breaking at
 * each horizontal rule. Use `layout="container"` when the grid lives in a
 * card that can be half-width, so columns follow the card rather than the
 * viewport.
 */
export function StatGrid({
  children,
  columns = 2,
  layout = "viewport",
  className,
}: {
  children: ReactNode;
  /** Columns at the widest breakpoint; narrower breakpoints use fewer. */
  columns?: 2 | 3 | 4;
  /** Respond to the viewport (default) or the surrounding container. */
  layout?: "viewport" | "container";
  className?: string;
}) {
  const items = Children.toArray(children);

  return (
    <div
      className={cn(
        "grid grid-cols-1 content-start",
        layout === "container"
          ? cn(
              "@[24rem]:grid-cols-2",
              columns === 3 && "@[38rem]:grid-cols-3",
              columns === 4 && "@[44rem]:grid-cols-4",
            )
          : cn(
              "sm:grid-cols-2",
              columns === 3 && "lg:grid-cols-3",
              columns === 4 && "lg:grid-cols-4",
            ),
        className,
      )}
    >
      {items.map((child, index) => (
        <div
          key={index}
          className={cn(
            "min-w-0 px-0",
            layout === "container" ? "@[24rem]:px-4" : "sm:px-4",
            dividerClasses(index, items.length, columns, layout),
          )}
        >
          {child}
        </div>
      ))}
    </div>
  );
}

// Full class strings per breakpoint so Tailwind can see them at build time.
const STAT_GRID_BREAKPOINTS = {
  base: {
    rowRule: "border-t",
    noRowRule: "border-t-0",
    rowPadding: "pt-2",
    noRowPadding: "pt-0",
    columnRule: "border-l",
    noColumnRule: "border-l-0",
    rowSpace: "pb-4",
    noRowSpace: "pb-0",
  },
  sm: {
    rowRule: "sm:border-t",
    noRowRule: "sm:border-t-0",
    rowPadding: "sm:pt-2",
    noRowPadding: "sm:pt-0",
    columnRule: "sm:border-l",
    noColumnRule: "sm:border-l-0",
    rowSpace: "sm:pb-4",
    noRowSpace: "sm:pb-0",
  },
  lg: {
    rowRule: "lg:border-t",
    noRowRule: "lg:border-t-0",
    rowPadding: "lg:pt-2",
    noRowPadding: "lg:pt-0",
    columnRule: "lg:border-l",
    noColumnRule: "lg:border-l-0",
    rowSpace: "lg:pb-4",
    noRowSpace: "lg:pb-0",
  },
  smContainer: {
    rowRule: "@[24rem]:border-t",
    noRowRule: "@[24rem]:border-t-0",
    rowPadding: "@[24rem]:pt-2",
    noRowPadding: "@[24rem]:pt-0",
    columnRule: "@[24rem]:border-l",
    noColumnRule: "@[24rem]:border-l-0",
    rowSpace: "@[24rem]:pb-4",
    noRowSpace: "@[24rem]:pb-0",
  },
  mdContainer: {
    rowRule: "@[38rem]:border-t",
    noRowRule: "@[38rem]:border-t-0",
    rowPadding: "@[38rem]:pt-2",
    noRowPadding: "@[38rem]:pt-0",
    columnRule: "@[38rem]:border-l",
    noColumnRule: "@[38rem]:border-l-0",
    rowSpace: "@[38rem]:pb-4",
    noRowSpace: "@[38rem]:pb-0",
  },
  lgContainer: {
    rowRule: "@[44rem]:border-t",
    noRowRule: "@[44rem]:border-t-0",
    rowPadding: "@[44rem]:pt-2",
    noRowPadding: "@[44rem]:pt-0",
    columnRule: "@[44rem]:border-l",
    noColumnRule: "@[44rem]:border-l-0",
    rowSpace: "@[44rem]:pb-4",
    noRowSpace: "@[44rem]:pb-0",
  },
} as const;

type StatGridBreakpoint =
  (typeof STAT_GRID_BREAKPOINTS)[keyof typeof STAT_GRID_BREAKPOINTS];

/**
 * Divider classes for a stat cell.
 *
 * A cell that is not in the first visual row carries the row's top rule and
 * padding, and a cell that is not last in its row carries bottom padding so
 * the next rule has breathing room. A cell that is not first in its row
 * carries the vertical rule. Because the grid gap is zero, every vertical
 * rule meets its neighbour in the next row.
 */
function dividerClasses(
  index: number,
  count: number,
  columns: number,
  layout: "viewport" | "container",
): string {
  const classes: string[] = [];

  const addLayout = (
    breakpoint: StatGridBreakpoint,
    columnCount: number,
  ) => {
    const rows = Math.ceil(count / columnCount);
    const row = Math.floor(index / columnCount);
    const firstInRow = index % columnCount === 0;
    const firstRow = row === 0;
    const lastRow = row >= rows - 1;

    classes.push(
      firstRow ? breakpoint.noRowRule : breakpoint.rowRule,
      firstRow ? breakpoint.noRowPadding : breakpoint.rowPadding,
      firstInRow ? breakpoint.noColumnRule : breakpoint.columnRule,
      lastRow ? breakpoint.noRowSpace : breakpoint.rowSpace,
    );
  };

  // Phones: one column.
  addLayout(STAT_GRID_BREAKPOINTS.base, 1);

  if (layout === "container") {
    addLayout(STAT_GRID_BREAKPOINTS.smContainer, 2);
    if (columns === 3) addLayout(STAT_GRID_BREAKPOINTS.mdContainer, 3);
    if (columns === 4) addLayout(STAT_GRID_BREAKPOINTS.lgContainer, 4);
  } else {
    addLayout(STAT_GRID_BREAKPOINTS.sm, 2);
    if (columns > 2) addLayout(STAT_GRID_BREAKPOINTS.lg, columns);
  }

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
