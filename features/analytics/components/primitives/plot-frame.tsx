import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The height every analytics plot shares.
 *
 * A chart and its table view are one card seen two ways, so both use this
 * height: switching between them never resizes the card.
 */
export const ANALYTICS_PLOT_HEIGHT = 260;

/**
 * The frame a chart plot sits in. It fills the card body, so a plot grows
 * with its card instead of leaving dead space under a fixed height.
 */
export function PlotFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      {children}
    </div>
  );
}

/**
 * The frame a table view sits in. The table scrolls inside the card, so a
 * long list never changes the card's size and the row of cards below it
 * keeps its shape.
 *
 * The flex basis is a length, not a percentage: a percentage basis resolves
 * against the card's own height, which is content-sized until the grid
 * stretches it, so the table would size itself to its rows instead of
 * scrolling.
 */
export function TableFrame({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex flex-col overflow-y-auto", className)}
      style={{ flex: "1 1 0px", minHeight: ANALYTICS_PLOT_HEIGHT }}
    >
      {children}
    </div>
  );
}
