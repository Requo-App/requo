import {
  RiArrowDownCircleFill,
  RiArrowUpCircleFill,
  RiIndeterminateCircleFill,
} from "@remixicon/react";

import { cn } from "@/lib/utils";

/**
 * Delta pill — the period-over-period chip used on KPI stat cards, analytics
 * cards, and captions.
 *
 * The glyph shows which way the metric moved; the color shows whether that
 * was good. They can disagree on purpose: a positive "33% faster" (time to
 * quote) points down. Sentiment is always explicit so "lower is better"
 * metrics never read through raw sign.
 */

export type DeltaPillDirection = "up" | "down" | "flat";
export type DeltaPillSentiment = "positive" | "negative" | "neutral";

const TONE_CLASSES: Record<DeltaPillSentiment, string> = {
  positive: "bg-success/10 text-success-ink",
  negative: "bg-destructive/10 text-destructive-ink",
  neutral: "bg-muted text-muted-foreground",
};

/** Tone classes for text-only delta chips that skip the pill styling. */
export function deltaToneClass(sentiment: DeltaPillSentiment): string {
  return TONE_CLASSES[sentiment];
}

/**
 * Reads the direction from a prefixed label ("+12%", "−3 pts") when the
 * caller does not pass one explicitly.
 */
function inferDirection(delta: string): DeltaPillDirection {
  const trimmed = delta.trimStart();
  if (trimmed.startsWith("−") || trimmed.startsWith("-")) return "down";
  if (trimmed.startsWith("+")) return "up";
  return "flat";
}

export function DeltaPill({
  delta,
  direction,
  sentiment = "neutral",
  className,
}: {
  /** Label, e.g. "+12%" or "33% faster". A falsy value renders nothing. */
  delta?: string | null;
  /** Which way the metric moved; inferred from the sign of `delta` if omitted. */
  direction?: DeltaPillDirection;
  /** Whether the move was good; drives the tint. Defaults to neutral. */
  sentiment?: DeltaPillSentiment;
  className?: string;
}) {
  if (!delta) return null;

  const resolved = direction ?? inferDirection(delta);
  const Icon =
    resolved === "down"
      ? RiArrowDownCircleFill
      : resolved === "up"
        ? RiArrowUpCircleFill
        : RiIndeterminateCircleFill;

  return (
    <span
      className={cn(
        "flex shrink-0 items-center gap-1 rounded-full py-0.5 pr-2 pl-1",
        TONE_CLASSES[sentiment],
        className,
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      <span className="whitespace-nowrap text-xs font-medium tabular-nums">
        {delta}
      </span>
    </span>
  );
}
