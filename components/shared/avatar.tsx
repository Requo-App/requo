/* eslint-disable @next/next/no-img-element */
import type { HTMLAttributes, Ref } from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Sizes used in the designs (px):
//   xs = 20   breadcrumb business marks     (initials 10/15 semibold)
//   sm = 24   table rows                     (initials 12/16 semibold)
//   md = 32   sidebar business / team card  (initials 16/22 semibold)
//   lg = 36   people cards                   (initials 18/24 semibold)
//
// Renders a photo when `src` is given, otherwise centered initials on a
// tinted disc. Initial tints:
//   neutral → muted bg, muted text
//   blue    → primary tint bg, primary text
//   lime    → success tint bg, success text
//   pink    → destructive tint bg, destructive text

type AvatarSize = "xs" | "sm" | "md" | "lg";
type AvatarColor = "neutral" | "blue" | "lime" | "pink";

export interface AvatarProps extends HTMLAttributes<HTMLSpanElement> {
  size?: AvatarSize;
  color?: AvatarColor;
  /** Photo URL. Wins over `initials`. */
  src?: string;
  alt?: string;
  /** Fallback initials, e.g. "M". */
  initials?: string;
  ref?: Ref<HTMLSpanElement>;
}

const avatarVariants = cva(
  "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full text-center align-middle transition-[width,height,font-size] [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)]",
  {
    variants: {
      size: {
        xs: "size-5 text-[10px] leading-[15px] font-semibold",
        sm: "size-6 text-caption-1-semibold tracking-normal",
        md: "size-8 text-headline-semibold",
        lg: "size-9 text-[18px] leading-6 font-semibold",
      },
      color: {
        neutral: "bg-muted text-muted-foreground",
        blue: "bg-primary/10 text-primary-ink",
        lime: "bg-success/15 text-success-ink",
        pink: "bg-destructive/10 text-destructive-ink",
      },
    },
    defaultVariants: {
      size: "md",
      color: "neutral",
    },
  },
);

export function Avatar({
  size = "md",
  color = "neutral",
  src,
  alt,
  initials,
  className,
  ref,
  ...props
}: AvatarProps) {
  return (
    <span
      ref={ref}
      className={cn(avatarVariants({ size, color }), className)}
      {...props}
    >
      {src ? (
        <img
          src={src}
          alt={alt ?? ""}
          loading="lazy"
          decoding="async"
          className="size-full object-cover"
        />
      ) : (
        initials
      )}
    </span>
  );
}
