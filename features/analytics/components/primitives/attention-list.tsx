import Link from "next/link";
import {
  CircleAlert,
  CircleCheck,
  Clock,
  FileWarning,
  Info,
  type LucideIcon,
} from "lucide-react";

import type {
  AnalyticsAttentionItem,
  AnalyticsTone,
} from "@/features/analytics/types";
import { cn } from "@/lib/utils";

const TONE_ICONS: Record<AnalyticsTone, LucideIcon> = {
  negative: CircleAlert,
  warning: Clock,
  info: Info,
  positive: CircleCheck,
  neutral: Info,
};

/**
 * The live work list. Each row is a count with a link into the matching
 * filtered list: a 16px line icon (no coloured tile), the label with a
 * one-line description, and the count on the right.
 *
 * A zero count stays muted; a non-zero count is accented, so the rows that
 * need work read first.
 */
export function AttentionList({
  items,
  className,
}: {
  items: AnalyticsAttentionItem[];
  className?: string;
}) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 py-1">
        <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">
            Nothing needs attention
          </p>
          <p className="text-xs text-muted-foreground">
            No unviewed inquiries, overdue follow-ups, or expiring quotes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className={cn("flex min-w-0 flex-col", className)}>
      {items.map((item) => {
        const Icon = TONE_ICONS[item.tone] ?? Info;
        const isZero = item.count === 0;

        return (
          <li key={item.key} className="border-b border-border/40 last:border-0">
            <Link
              href={item.href}
              className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon
                className={cn(
                  "size-4 shrink-0",
                  isZero ? "text-muted-foreground/60" : "text-foreground/70",
                )}
                aria-hidden
              />
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block truncate text-sm",
                    isZero
                      ? "text-muted-foreground"
                      : "font-medium text-foreground",
                  )}
                >
                  {item.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <span
                className={cn(
                  "shrink-0 text-sm font-semibold tabular-nums",
                  isZero ? "text-muted-foreground" : "text-foreground",
                )}
              >
                {item.count.toLocaleString()}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * A single live alert used by cards that need one prominent row (an overdue
 * balance, an expiring quote). Uses the same row anatomy as `AttentionList`.
 */
export function AttentionRow({
  label,
  description,
  count,
  href,
  tone = "warning",
}: {
  label: string;
  description: string;
  count: number;
  href: string;
  tone?: AnalyticsTone;
}) {
  const Icon = TONE_ICONS[tone] ?? FileWarning;

  return (
    <Link
      href={href}
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-accent/50 focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-4 shrink-0 text-foreground/70" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">
          {label}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </span>
      <span className="shrink-0 text-sm font-semibold text-foreground tabular-nums">
        {count.toLocaleString()}
      </span>
    </Link>
  );
}
