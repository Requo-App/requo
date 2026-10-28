import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  Ref,
} from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Square icon-only button. Unlike `Button` (whose small size is radius/lg with
// an 18px icon), the icon button keeps radius/2lg (10px) at both sizes:
//
//            container   padding   icon
//   medium   36×36       8         20×20
//   small    32×32       8         16×16
//
// One variant in the designs: secondary (card fill, default border,
// xs shadow). Hover/active/disabled states reuse the secondary Button tokens.

type IconButtonSize = "medium" | "small";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  icon: IconComponent;
  size?: IconButtonSize;
  /** Accessible name — required since there is no visible label. */
  "aria-label": string;
  ref?: Ref<HTMLButtonElement>;
}

export interface IconLinkButtonProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  icon: IconComponent;
  size?: IconButtonSize;
  /** Accessible name — required since there is no visible label. */
  "aria-label": string;
  ref?: Ref<HTMLAnchorElement>;
}

const iconButtonVariants = cva(
  "relative inline-flex shrink-0 items-center justify-center overflow-visible rounded-md control-surface-secondary border text-foreground select-none cursor-pointer transition-[background-color,border-color,box-shadow,color] duration-150 ease outline-none focus-visible:ring-2 focus-visible:ring-ring hover:border-[var(--control-border-hover)] hover:bg-[var(--control-bg-hover)] active:border-[var(--control-border-hover)] active:bg-[var(--control-bg-hover)] disabled:cursor-not-allowed disabled:border-[var(--control-disabled-border)] disabled:bg-transparent disabled:text-[var(--control-disabled-fg)] disabled:opacity-100 disabled:shadow-none",
  {
    variants: {
      size: {
        medium: "size-9",
        small: "size-8",
      },
    },
    defaultVariants: {
      size: "medium",
    },
  },
);

const iconButtonIconVariants = cva("", {
  variants: {
    size: {
      medium: "size-5 shrink-0",
      small: "size-4 shrink-0",
    },
  },
  defaultVariants: {
    size: "medium",
  },
});

export function IconButton({
  icon: Icon,
  size = "medium",
  className,
  type = "button",
  ref,
  ...props
}: IconButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonVariants({ size }), className)}
      {...props}
    >
      <Icon className={iconButtonIconVariants({ size })} aria-hidden />
    </button>
  );
}

/** Anchor counterpart to IconButton for external and navigational actions. */
export function IconLinkButton({
  icon: Icon,
  size = "medium",
  className,
  ref,
  ...props
}: IconLinkButtonProps) {
  return (
    <a
      ref={ref}
      className={cn(iconButtonVariants({ size }), className)}
      {...props}
    >
      <Icon className={iconButtonIconVariants({ size })} aria-hidden />
    </a>
  );
}
