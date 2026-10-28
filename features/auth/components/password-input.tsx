"use client";

import { Eye, EyeOff } from "lucide-react";
import { useState } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type PasswordInputProps = Omit<React.ComponentProps<typeof Input>, "type">;

export function PasswordInput({
  className,
  disabled,
  ...props
}: PasswordInputProps) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <div className="relative">
      <Input
        className={cn("pr-12", className)}
        disabled={disabled}
        type={isVisible ? "text" : "password"}
        {...props}
      />
      <button
        aria-label={isVisible ? "Hide password" : "Show password"}
        aria-pressed={isVisible}
        className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color] [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] hover:bg-accent/70 hover:text-foreground focus-visible:border-ring focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/20 disabled:pointer-events-none disabled:opacity-50"
        disabled={disabled}
        onClick={() => setIsVisible((current) => !current)}
        type="button"
      >
        <span className="relative flex size-4 items-center justify-center">
          <Eye
            className={cn(
              "absolute size-4 transition-[opacity,scale,rotate] [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)]",
              isVisible
                ? "scale-100 opacity-100 rotate-0"
                : "pointer-events-none scale-75 opacity-0 rotate-[-10deg]",
            )}
          />
          <EyeOff
            className={cn(
              "absolute size-4 transition-[opacity,scale,rotate] [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)]",
              isVisible
                ? "pointer-events-none scale-75 opacity-0 rotate-[10deg]"
                : "scale-100 opacity-100 rotate-0",
            )}
          />
        </span>
      </button>
    </div>
  );
}
