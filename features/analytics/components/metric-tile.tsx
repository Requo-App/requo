import Link from "next/link";

import { cn } from "@/lib/utils";

/**
 * Small stat tile used inside analytics cards: label, value, optional caption
 * and drill-down link. Mirrors the Overview money tiles so every card's stats
 * read as one system.
 */
export function AnalyticsMetricTile({
  label,
  value,
  caption,
  href,
  tone = "default",
}: {
  label: string;
  value: string;
  caption?: string;
  href?: string;
  tone?: "default" | "positive" | "negative" | "warning";
}) {
  const body = (
    <>
      <span className="meta-label">{label}</span>
      <span
        className={cn(
          "text-2xl font-semibold tracking-tight tabular-nums",
          tone === "positive"
            ? "text-success"
            : tone === "negative"
              ? "text-destructive"
              : tone === "warning"
                ? "text-warning"
                : "text-foreground",
        )}
      >
        {value}
      </span>
      {caption ? (
        <span className="text-xs text-muted-foreground">{caption}</span>
      ) : null}
    </>
  );

  const className =
    "soft-panel flex flex-col gap-1 rounded-xl border border-border/60";

  return href ? (
    <Link
      href={href}
      className={cn(
        className,
        "outline-none transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
