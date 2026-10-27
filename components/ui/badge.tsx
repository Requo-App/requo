import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default:
          "border-primary/80 bg-primary text-primary-foreground shadow-[var(--control-primary-shadow)]",
        secondary:
          "control-surface-secondary border-border/80 text-secondary-foreground",
        // Colourless shell for semantic status pills: carries no background or
        // border colour so a tone class (bg-success/15 text-success-ink …) wins
        // through tailwind-merge without needing `!`. StatusBadge composes it.
        status:
          "border bg-transparent text-foreground",
        destructive:
          "border-destructive/22 bg-destructive/10 text-destructive-ink shadow-[var(--control-shadow)] focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:focus-visible:ring-destructive/40",
        outline:
          "control-surface border-border/85 text-foreground",
        ghost:
          "control-ghost-surface text-muted-foreground hover:border-border/55 hover:bg-[var(--control-accent-bg)] hover:text-foreground hover:shadow-[var(--control-shadow)]",
        link: "text-primary-ink underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span"

  return (
    <Comp
      data-slot="badge"
      data-variant={variant}
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
