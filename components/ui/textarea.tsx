import * as React from "react"

import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "control-surface flex field-sizing-content min-h-32 w-full rounded-md border px-3 py-2 text-base transition-[border-color,background-color,box-shadow] outline-none placeholder:text-muted-foreground/90 focus-visible:border-ring/60 focus-visible:ring-4 focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:border-[var(--control-disabled-border)] disabled:bg-[var(--control-bg)] disabled:text-[var(--control-disabled-fg)] disabled:shadow-none disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/10 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
