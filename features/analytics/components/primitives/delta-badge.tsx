import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type DeltaBadgeSentiment = "positive" | "negative" | "neutral";

const SENTIMENT_CLASSES: Record<DeltaBadgeSentiment, string> = {
  positive: "text-success-ink",
  negative: "text-destructive-ink",
  neutral: "text-muted-foreground",
};

/**
 * Period-over-period change: an arrow plus the value, tinted by whether the
 * move was good rather than by its sign. "No change" is plain muted text with
 * no arrow, so "no signal" never reads as "a little down".
 */
export function DeltaBadge({
  delta,
  direction,
  sentiment = "neutral",
  className,
}: {
  /** Label, e.g. "+12%" or "−8%". A falsy value renders nothing. */
  delta?: string | null;
  /** Which way the metric moved. */
  direction?: "up" | "down" | "flat";
  /** Whether the move was good; drives the tint. */
  sentiment?: DeltaBadgeSentiment;
  className?: string;
}) {
  if (!delta) return null;

  const resolved =
    direction ??
    (delta.startsWith("+")
      ? "up"
      : delta.startsWith("−") || delta.startsWith("-")
        ? "down"
        : "flat");

  // "No change" carries no direction, so it reads as plain muted text with no
  // arrow — an absent signal never looks like a small move.
  if (resolved === "flat") {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center text-xs font-medium tabular-nums",
          SENTIMENT_CLASSES.neutral,
          className,
        )}
      >
        {delta}
      </span>
    );
  }

  const Icon = resolved === "up" ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-0.5 text-xs font-medium tabular-nums",
        SENTIMENT_CLASSES[sentiment],
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span>{delta}</span>
    </span>
  );
}
