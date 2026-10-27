import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-md border text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 outline-none select-none focus-visible:border-ring focus-visible:ring-4 focus-visible:ring-ring/15 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/15 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "button-primary-fixed enabled:hover:-translate-y-px",
        outline:
          "control-surface border-border/85 text-foreground enabled:hover:border-border enabled:hover:bg-[var(--control-bg-strong)] enabled:hover:text-accent-foreground enabled:hover:shadow-[var(--control-shadow-hover)] aria-expanded:bg-[var(--control-accent-bg)] aria-expanded:shadow-[var(--control-shadow-hover)]",
        secondary:
          "control-surface-secondary border-border/55 text-secondary-foreground enabled:hover:bg-[var(--control-secondary-bg-strong)] enabled:hover:shadow-[var(--control-shadow-hover)] aria-expanded:bg-[var(--control-secondary-bg-strong)] aria-expanded:shadow-[var(--control-shadow-hover)]",
        ghost:
          "control-ghost-surface text-muted-foreground enabled:hover:border-border/60 enabled:hover:bg-[var(--control-accent-bg)] enabled:hover:text-foreground enabled:hover:shadow-[var(--control-shadow)] aria-expanded:border-border/60 aria-expanded:bg-[var(--control-accent-bg)] aria-expanded:text-foreground aria-expanded:shadow-[var(--control-shadow)]",
        destructive:
          "button-destructive-fixed enabled:hover:-translate-y-px focus-visible:border-destructive focus-visible:ring-destructive/20",
        link: "text-primary-ink underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 sm:h-8",
        xs: "h-7 gap-1 px-2 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 sm:h-9",
        icon: "size-9 sm:size-8",
        "icon-xs": "size-7 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10 sm:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  type,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      {...(!asChild ? { type: type ?? "button" } : type ? { type } : {})}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
