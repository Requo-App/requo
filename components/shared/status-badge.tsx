import type { ComponentType } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Semantic status tones — the single vocabulary for status colour in the app.
 *
 * Every tone is backed by global colour tokens (`app/globals.css`), so none
 * carries a `dark:` pair: the token itself flips with the theme. The four
 * decorative hues (`progress`, `active`, `highlight`, `attention`) have no
 * semantic meaning; they are centralized here so that no feature code has to
 * reach for raw palette utilities — see `DESIGN.md`.
 *
 * Note: the tone is named `highlight`, not `accent`, because `--accent` is
 * already a *surface* token.
 */
export type StatusTone =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger"
  | "progress"
  | "active"
  | "highlight"
  | "attention";

export const statusTones: readonly StatusTone[] = [
  "neutral",
  "info",
  "success",
  "warning",
  "danger",
  "progress",
  "active",
  "highlight",
  "attention",
] as const;

/** Tones backed by a global token; these must not carry raw palette classes. */
export const tokenBackedStatusTones: readonly StatusTone[] = statusTones;

/**
 * The one tone -> class map.
 *
 * Every tone resolves through a token pair, so the same class string works in
 * both themes and no tone carries a `dark:` override.
 */
export const statusToneClassNames: Record<StatusTone, string> = {
  neutral: "border-border bg-muted text-muted-foreground",
  info: "border-info/30 bg-info/15 text-info-ink",
  success: "border-success/30 bg-success/15 text-success-ink",
  warning: "border-warning/30 bg-warning/15 text-warning-ink",
  danger: "border-destructive/30 bg-destructive/15 text-destructive-ink",
  progress:
    "border-[color:var(--status-progress-border)] bg-[var(--status-progress-bg)] text-[color:var(--status-progress-fg)]",
  active:
    "border-[color:var(--status-active-border)] bg-[var(--status-active-bg)] text-[color:var(--status-active-fg)]",
  highlight:
    "border-[color:var(--status-highlight-border)] bg-[var(--status-highlight-bg)] text-[color:var(--status-highlight-fg)]",
  attention:
    "border-[color:var(--status-attention-border)] bg-[var(--status-attention-bg)] text-[color:var(--status-attention-fg)]",
};

/**
 * The props the badge actually sets on an icon — deliberately minimal.
 *
 * Both lucide and `@remixicon/react` components are assignable to this, but a
 * full `SVGProps<SVGSVGElement>` is not: remixicon narrows `children` to
 * `undefined`, so it fails the contravariant props check against the wider
 * type. Declaring only what we pass keeps both libraries usable here.
 */
type StatusIconProps = {
  className?: string;
  "data-icon"?: string;
  "aria-hidden"?: boolean | "true" | "false";
};

type StatusIcon = ComponentType<StatusIconProps>;

export type StatusBadgeProps = {
  /** The semantic tone. Drives colour only — never the meaning. */
  tone: StatusTone;
  /**
   * Always rendered. Colour must never carry the meaning on its own, so the
   * label is required rather than optional.
   */
  label: string;
  /** Optional leading glyph, rendered `aria-hidden` (the label carries meaning). */
  icon?: StatusIcon;
  size?: "default" | "sm";
  className?: string;
};

/**
 * The single status pill for the product.
 *
 * Composes `Badge variant="status"`, which carries no background or border
 * colour, so the tone classes win through `tailwind-merge` without needing
 * `!important`. Do not restyle this per feature — add a tone instead.
 */
export function StatusBadge({
  tone,
  label,
  icon: Icon,
  size = "default",
  className,
}: StatusBadgeProps) {
  return (
    <Badge
      data-tone={tone}
      variant="status"
      className={cn(
        "shrink-0 rounded-full",
        size === "sm" ? "h-5 px-2" : null,
        statusToneClassNames[tone],
        className,
      )}
    >
      {Icon ? <Icon data-icon="inline-start" aria-hidden="true" /> : null}
      {label}
    </Badge>
  );
}
