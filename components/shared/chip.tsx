import type { HTMLAttributes, Ref } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Colored label chip. Three emphasis levels, all rounded radius/md (6px), px 6:
//
//   bold    py 2, Body 1/Medium   (14/20/500) — status + percentage deltas
//   subtle  py 4, Body 1/Medium   (14/20/500) — price chips
//   caption py 4, Caption 1/Medium (12/16/500, tracking .15) — role tags
//
// Status pairs are semantic so the same component follows both color modes:
//   lime/rose/yellow/cyan/blue → light 200/800 · dark 950 @ 60% / tinted text
//   purple → light 100/600 · dark 900/300 (delta chips)
//   neutral → tertiary bg, secondary text
//   gray → secondary bg, primary text
//   soft → secondary bg, secondary text

type ChipVariant = "bold" | "subtle" | "caption";
type ChipColor = "lime" | "rose" | "yellow" | "cyan" | "blue" | "purple" | "neutral" | "gray" | "soft";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: ChipVariant;
  color?: ChipColor;
  ref?: Ref<HTMLSpanElement>;
}

const chipVariants = cva(
  "inline-flex items-center justify-center rounded-md px-1.5 whitespace-nowrap transition-[padding,font-size] [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)]",
  {
    variants: {
      variant: {
        bold: "py-0.5 text-body-medium",
        subtle: "py-1 text-body-medium",
        caption: "py-1 text-caption-1-medium",
      },
      color: {
        lime: "bg-status-lime-background text-status-lime-text",
        rose: "bg-status-rose-background text-status-rose-text",
        yellow: "bg-status-yellow-background text-status-yellow-text",
        cyan: "bg-status-cyan-background text-status-cyan-text",
        blue: "bg-status-blue-background text-status-blue-text",
        purple: "bg-status-purple-background text-status-purple-text",
        neutral: "bg-background-tertiary-default text-text-secondary",
        gray: "bg-background-secondary-default text-text-primary",
        soft: "bg-background-secondary-default text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "bold",
      color: "neutral",
    },
  },
);

export function Chip({
  variant = "bold",
  color = "neutral",
  className,
  ref,
  ...props
}: ChipProps) {
  return (
    <span
      ref={ref}
      className={cn(chipVariants({ variant, color }), className)}
      {...props}
    />
  );
}
