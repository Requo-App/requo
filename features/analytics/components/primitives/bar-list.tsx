import Link from "next/link";
import type { ReactNode } from "react";

import { TruncatedTextWithTooltip } from "@/components/shared/truncated-text-with-tooltip";
import { cn } from "@/lib/utils";

export type BarListItem = {
  key: string;
  label: string;
  /** Right-aligned value, already formatted. */
  value: string;
  /** Muted secondary line under the label, e.g. "57% of inquiries". */
  meta?: ReactNode;
  /** Bar length as a share of the list total (0–1). */
  share: number;
  /** Drill-down target; the whole row becomes the link. */
  href?: string | null;
  /** Fill colour override; defaults to the brand accent. */
  fillClassName?: string;
};

/**
 * The one horizontal-bar primitive. Funnels, aging buckets, traffic sources,
 * win-rate breakdowns, and usage all render through it, so a bar looks the
 * same wherever it appears.
 *
 * A zero value renders an empty track — never a stub that implies progress.
 */
export function BarList({
  items,
  emptyLabel = "No data in this period.",
  className,
  itemClassName,
  valueClassName,
}: {
  items: BarListItem[];
  emptyLabel?: string;
  className?: string;
  itemClassName?: string;
  valueClassName?: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <ul className={cn("flex min-w-0 flex-col gap-3.5", className)}>
      {items.map((item) => {
        const body = (
          <>
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <TruncatedTextWithTooltip
                text={item.label}
                className="min-w-0 text-sm text-foreground"
              />
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold text-foreground tabular-nums",
                  valueClassName,
                )}
              >
                {item.value}
              </span>
            </div>

            <div
              className="analytics-track mt-1.5 h-1.5 w-full overflow-hidden rounded-full"
              aria-hidden
            >
              <div
                className={cn(
                  "h-full rounded-full",
                  item.fillClassName ?? "bg-primary",
                )}
                style={{ width: `${Math.max(Math.min(item.share, 1), 0) * 100}%` }}
              />
            </div>

            {item.meta ? (
              typeof item.meta === "string" ? (
                <TruncatedTextWithTooltip
                  text={item.meta}
                  className="mt-1 text-xs text-muted-foreground"
                />
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">{item.meta}</p>
              )
            ) : null}
          </>
        );

        return (
          <li key={item.key} className={cn("min-w-0", itemClassName)}>
            {item.href ? (
              <Link
                href={item.href}
                className="-mx-2 flex min-w-0 flex-col rounded-lg px-2 py-1 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
              >
                {body}
              </Link>
            ) : (
              <div className="flex min-w-0 flex-col">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
