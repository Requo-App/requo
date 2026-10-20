import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Section label for the analytics page: a small uppercase muted heading and a
 * hairline that fills the remaining width.
 *
 * A section without a title renders its children only — used where a group of
 * cards speaks for itself and a label would only add chrome.
 */
export function AnalyticsSection({
  title,
  children,
  className,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-4", className)}>
      {title ? (
        <div className="flex items-center gap-3">
          <h2 className="meta-label shrink-0">{title}</h2>
          <span aria-hidden className="h-px flex-1 bg-border/60" />
        </div>
      ) : null}
      {children}
    </section>
  );
}

/**
 * A section that only renders when it has content.
 *
 * A section label with nothing under it reads as a mistake, so the gate waits
 * for the tab's shared query and hides the whole section when the slice it
 * covers is empty.
 */
export async function AnalyticsSectionGate<T>({
  title,
  waitFor,
  when,
  children,
}: {
  title?: string;
  /** The tab's shared query promise. */
  waitFor: Promise<T>;
  /** Decides whether the section has anything to show. */
  when: (data: T) => boolean;
  children: ReactNode;
}) {
  const data = await waitFor;
  if (!when(data)) return null;

  return <AnalyticsSection title={title}>{children}</AnalyticsSection>;
}

/**
 * A row inside a section.
 *
 * The row is a 12-column grid from `md` up and a single column on phones, so
 * a 6/6 pair sits side by side from 768px while 4/4/4 and 3/3/3/3 rows stack
 * to one column until the full layout kicks in at 1200px.
 *
 * Cards stretch to the height of the tallest card in the row, so a row of
 * cards reads as one band instead of a ragged edge.
 */
export function AnalyticsRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 md:grid-cols-12",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * Column span helper. `span` is the number of 12-column tracks a card takes
 * in the full layout; below that the card either fills the row or pairs up
 * with its neighbour, so a card is never an orphan.
 */
export function analyticsCol(
  span: 3 | 4 | 6 | 12,
  className?: string,
) {
  return cn(
    "col-span-12",
    span === 6 && "md:col-span-6",
    span === 4 && "analytics:col-span-4",
    span === 3 && "analytics:col-span-3",
    className,
  );
}

/** The KPI strip: six tiles, two columns each, one row. */
export function AnalyticsKpiStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-4 md:grid-cols-3 analytics:grid-cols-6",
        className,
      )}
    >
      {children}
    </div>
  );
}
