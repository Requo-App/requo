import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

import { MetricHint } from "../kpi/metric-hint";

/**
 * The one card anatomy every analytics surface uses.
 *
 * Header: title (with an optional definition tooltip) on the left, actions on
 * the right. Optional one-line description. Body. Optional footer. Cards are
 * flat — a 1px low-contrast border, no elevation — so a page of them reads as
 * one calm plane instead of a stack of boxes.
 */
export function AnalyticsCard({
  title,
  description,
  info,
  action,
  footer,
  children,
  className,
  bodyClassName,
  footerClassName,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Definition shown in an info tooltip next to the title. */
  info?: string;
  action?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  footerClassName?: string;
}) {
  return (
    <section
      className={cn(
        "analytics-card flex min-w-0 flex-col gap-4 p-4 sm:p-5",
        className,
      )}
    >
      <header className="flex min-w-0 flex-col gap-1.5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-1.5">
            <h3 className="font-heading text-base leading-tight font-semibold tracking-tight text-foreground">
              {title}
            </h3>
            {info ? <MetricHint label={typeof title === "string" ? title : ""} hint={info} /> : null}
          </div>
          {action ? (
            <div className="flex shrink-0 items-center gap-2">{action}</div>
          ) : null}
        </div>
        {description ? (
          <p className="text-sm leading-5 text-muted-foreground">{description}</p>
        ) : null}
      </header>

      <div
        className={cn(
          "@container flex min-w-0 flex-1 flex-col gap-4",
          bodyClassName,
        )}
      >
        {children}
      </div>

      {footer ? (
        <footer
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/50 pt-3 text-xs text-muted-foreground",
            footerClassName,
          )}
        >
          {footer}
        </footer>
      ) : null}
    </section>
  );
}
