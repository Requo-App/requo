import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          "control-surface h-9 w-full min-w-0 rounded-md border px-3 py-1 text-base transition-[border-color,background-color,box-shadow] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/90 focus-visible:border-ring/60 focus-visible:ring-4 focus-visible:ring-ring/40 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-[var(--control-disabled-border)] disabled:bg-[var(--control-bg)] disabled:text-[var(--control-disabled-fg)] disabled:shadow-none disabled:opacity-100 aria-invalid:border-destructive aria-invalid:ring-4 aria-invalid:ring-destructive/10 sm:h-8 md:text-sm",
          className
        )}
        {...props}
      />
    )
  }
)

Input.displayName = "Input"

export { Input }
