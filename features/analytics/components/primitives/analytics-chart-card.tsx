"use client";

import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { AnalyticsCard } from "./analytics-card";

/**
 * The card anatomy for anything with a plot: the same header, description,
 * body, and footer as every other analytics card, plus a Chart | Table
 * toggle on the right so the numbers are always readable as text.
 */
export function AnalyticsChartCard({
  title,
  description,
  info,
  chart,
  table,
  footer,
  action,
  className,
  bodyClassName,
  tableLabel = "Table",
}: {
  title: ReactNode;
  description?: ReactNode;
  info?: string;
  /** The plot. */
  chart: ReactNode;
  /** The same numbers as a table. */
  table?: ReactNode;
  footer?: ReactNode;
  action?: ReactNode;
  className?: string;
  bodyClassName?: string;
  tableLabel?: string;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const hasTable = Boolean(table);

  return (
    <AnalyticsCard
      title={title}
      description={description}
      info={info}
      footer={footer}
      className={className}
      bodyClassName={bodyClassName}
      action={
        <>
          {action}
          {hasTable ? (
            <div
              role="group"
              aria-label="View as"
              className="flex items-center gap-0.5 rounded-full border border-border/60 p-0.5"
            >
              <ViewButton
                active={view === "chart"}
                onClick={() => setView("chart")}
              >
                Chart
              </ViewButton>
              <ViewButton
                active={view === "table"}
                onClick={() => setView("table")}
              >
                {tableLabel}
              </ViewButton>
            </div>
          ) : null}
        </>
      }
    >
      {view === "table" && table ? table : chart}
    </AnalyticsCard>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
