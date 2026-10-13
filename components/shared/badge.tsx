import type { HTMLAttributes, Ref } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Small numeric counter pill (nav item counts, unread totals).
//   - 12/16 semibold, tracking 0
//   - px 4, py 1, radius/sm (4px)
//   - primary → primary bg, light text (sits on the selected nav item)
//   - neutral → muted bg, muted text

type BadgeColor = "primary" | "neutral";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  ref?: Ref<HTMLSpanElement>;
}

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-sm px-1 py-px text-caption-1-semibold tracking-normal whitespace-nowrap",
  {
    variants: {
      color: {
        primary: "bg-primary text-primary-foreground",
        neutral: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      color: "neutral",
    },
  },
);

export function Badge({ color = "neutral", className, ref, ...props }: BadgeProps) {
  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ color }), className)}
      {...props}
    />
  );
}
