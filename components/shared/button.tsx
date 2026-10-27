import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ComponentType,
  ReactNode,
  Ref,
} from "react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * Button — primary / secondary / ghost / danger actions in three sizes.
 *
 * Sizing (kept 1:1 with the BoardUI original):
 *
 *                       Medium                    Small                     Xs
 *   container          h=36, p=8,   r=10         h=32, px=8 py=6, r=8      h=24, px=8, r=4
 *   gap                 2px                       2px                      1px
 *   icon                20×20                     18×18                    14×14
 *   label wrapper       px=4                      px=2                     px=2
 *   text style          Body 1/Medium             Body 1/Medium            Caption 1/Semibold
 *   icon-only square    36×36 (content-derived)   32×32 (forced size)      24×24 (forced size)
 *
 * `xs` is the smallest tier — every dimension scales down by the same ~0.667
 * factor, rounded to clean pixel values.
 *
 * Icons are rendered by the component itself via the `leadingIcon` /
 * `trailingIcon` props so the consumer can't pass the wrong size. Pass
 * a Remix Icon component reference (`RiAddLine`, not `<RiAddLine />`).
 *
 * For icon-only buttons:
 *   <Button iconOnly leadingIcon={RiAddLine} aria-label="Add" />
 *
 * The HTML `type` prop is preserved; the visual enum is named `variant` to
 * avoid the clash.
 */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "medium" | "small" | "xs";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export interface ButtonLinkProps
  extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "children"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconOnly?: boolean;
  leadingIcon?: IconComponent;
  trailingIcon?: IconComponent;
  children?: ReactNode;
  ref?: Ref<HTMLAnchorElement>;
}

const buttonBase = [
  "inline-flex items-center justify-center gap-0.5 whitespace-nowrap overflow-hidden",
  "font-sans select-none cursor-pointer",
  "button-press-motion",
  "outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:cursor-not-allowed aria-disabled:cursor-not-allowed",
].join(" ");

// Base shape per size (used when label is present OR medium icon-only).
const buttonSizeClasses: Record<ButtonSize, string> = {
  medium: "h-9 rounded-md p-2 text-body-medium",
  small: "h-8 rounded-lg px-2 py-1.5 text-body-medium",
  xs: "h-6 rounded-sm px-2 text-caption-1-semibold",
};

// Icon-only override:
//   Medium → keep p-2; w expands from content (8+20+8 = 36) → square.
//   Small  → forces 32×32 even though 8+18+8=34, so hard-set size-8 and zero
//            the padding; the inner flex centers the 18px icon.
//   Xs     → forces 24×24, content-centered.
const buttonIconOnlySizeClasses: Record<ButtonSize, string> = {
  medium: "", // base size already produces 36×36 with a 20px icon
  small: "size-8 p-0", // hard 32×32, content-centered
  xs: "size-6 p-0", // hard 24×24, content-centered
};

const buttonIconClasses: Record<ButtonSize, string> = {
  medium: "size-5 shrink-0", // 20px
  small: "size-[18px] shrink-0", // 18px
  xs: "size-3.5 shrink-0", // 14px
};

const buttonLabelClasses: Record<ButtonSize, string> = {
  medium: "inline-flex items-center justify-center px-1 shrink-0", // px=4
  small: "inline-flex items-center justify-center px-0.5 shrink-0", // px=2
  xs: "inline-flex items-center justify-center px-0.5 shrink-0", // px=2
};

const buttonVariantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-primary text-primary-foreground shadow-[var(--control-primary-shadow)]",
    "hover:bg-primary/90",
    "active:bg-primary/90",
    "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
    "aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:shadow-none",
  ].join(" "),
  danger: [
    "bg-destructive text-primary-foreground shadow-[var(--control-destructive-shadow)]",
    "hover:bg-destructive/90",
    "active:bg-destructive/90",
    "disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
    "aria-disabled:bg-muted aria-disabled:text-muted-foreground aria-disabled:shadow-none",
  ].join(" "),
  secondary: [
    "control-surface-secondary border text-foreground",
    "hover:border-[var(--control-border-hover)] hover:bg-[var(--control-bg-hover)]",
    "active:border-[var(--control-border-hover)] active:bg-[var(--control-bg-hover)]",
    "disabled:border-[var(--control-disabled-border)] disabled:bg-transparent disabled:text-[var(--control-disabled-fg)] disabled:shadow-none disabled:opacity-100",
    "aria-disabled:border-[var(--control-disabled-border)] aria-disabled:bg-transparent aria-disabled:text-[var(--control-disabled-fg)] aria-disabled:shadow-none aria-disabled:opacity-100",
  ].join(" "),
  ghost: [
    "text-muted-foreground",
    "hover:bg-accent hover:text-foreground active:bg-accent",
    "disabled:text-muted-foreground disabled:shadow-none",
    "aria-disabled:text-muted-foreground aria-disabled:shadow-none",
  ].join(" "),
};

const buttonVariants = cva(buttonBase, {
  variants: {
    variant: buttonVariantClasses,
    size: buttonSizeClasses,
    iconOnly: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    {
      iconOnly: true,
      size: "small",
      className: buttonIconOnlySizeClasses.small,
    },
    { iconOnly: true, size: "xs", className: buttonIconOnlySizeClasses.xs },
  ],
  defaultVariants: {
    variant: "primary",
    size: "medium",
    iconOnly: false,
  },
});

export function Button({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  children,
  className,
  type = "button",
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, size, iconOnly }), className)}
      {...props}
    >
      {Leading ? <Leading className={buttonIconClasses[size]} aria-hidden /> : null}
      {!iconOnly && children !== undefined && children !== null && (
        <span className={buttonLabelClasses[size]}>{children}</span>
      )}
      {!iconOnly && Trailing ? (
        <Trailing className={buttonIconClasses[size]} aria-hidden />
      ) : null}
    </button>
  );
}

/** Anchor counterpart to Button for navigational actions. */
export function ButtonLink({
  variant = "primary",
  size = "medium",
  iconOnly = false,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  children,
  className,
  ref,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      ref={ref}
      className={cn(buttonVariants({ variant, size, iconOnly }), className)}
      {...props}
    >
      {Leading ? <Leading className={buttonIconClasses[size]} aria-hidden /> : null}
      {!iconOnly && children !== undefined && children !== null && (
        <span className={buttonLabelClasses[size]}>{children}</span>
      )}
      {!iconOnly && Trailing ? (
        <Trailing className={buttonIconClasses[size]} aria-hidden />
      ) : null}
    </a>
  );
}

/** Style maps, exported for advanced composition and the dev Design Tuner. */
export const buttonStyles = {
  base: buttonBase,
  size: buttonSizeClasses,
  iconOnlySize: buttonIconOnlySizeClasses,
  icon: buttonIconClasses,
  label: buttonLabelClasses,
  variant: buttonVariantClasses,
};
