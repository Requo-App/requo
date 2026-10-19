import Link from "next/link";
import {
  ArrowUpRight,
  CircleAlert,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";

import type { AnalyticsAttentionItem, AnalyticsTone } from "@/features/analytics/types";
import { cn } from "@/lib/utils";

const toneStyles: Record<
  AnalyticsTone,
  { icon: LucideIcon; tile: string }
> = {
  negative: { icon: CircleAlert, tile: "bg-destructive/10 text-destructive" },
  warning: { icon: CircleAlert, tile: "bg-warning/10 text-warning" },
  info: { icon: Info, tile: "bg-info/10 text-info" },
  positive: { icon: CheckCircle2, tile: "bg-success/10 text-success" },
  neutral: { icon: Info, tile: "bg-muted text-muted-foreground" },
};

/**
 * Action list for the Overview tab: each row is a live count with a link into
 * the matching filtered list. Empty rows are dropped by the query so this
 * renders either real work or nothing.
 */
export function AttentionList({ items }: { items: AnalyticsAttentionItem[] }) {
  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-success/10 text-success">
          <CheckCircle2 className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground">Nothing needs attention</p>
          <p className="text-xs text-muted-foreground">
            No unviewed inquiries, overdue follow-ups, or expiring quotes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const tone = toneStyles[item.tone];
        const Icon = tone.icon;

        return (
          <li key={item.key}>
            <Link
              href={item.href}
              className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span
                className={cn(
                  "flex size-9 shrink-0 items-center justify-center rounded-lg",
                  tone.tile,
                )}
              >
                <Icon className="size-5" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-foreground">
                  {item.label}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {item.description}
                </span>
              </span>
              <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-sm font-semibold tabular-nums text-foreground">
                {item.count.toLocaleString()}
              </span>
              <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground/70" aria-hidden />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
