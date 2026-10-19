"use client";

import { cn } from "@/lib/utils";

/**
 * Series toggling legend for multi-series charts. Same swatch vocabulary as
 * `ChartLegendContent` but interactive: clicking a series hides/shows it, and
 * hidden series read muted with a line-through label so the state is never
 * conveyed by color alone.
 */
export function ChartSeriesToggles({
  items,
  hidden,
  onToggle,
  className,
}: {
  items: Array<{ key: string; label: string; color: string }>;
  hidden: string[];
  onToggle: (key: string) => void;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-2", className)}>
      {items.map((item) => {
        const isHidden = hidden.includes(item.key);

        return (
          <li key={item.key}>
            <button
              type="button"
              aria-pressed={!isHidden}
              onClick={() => onToggle(item.key)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full text-xs outline-none transition-opacity",
                "focus-visible:ring-2 focus-visible:ring-ring",
                isHidden ? "opacity-50" : "opacity-100",
              )}
            >
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span
                className={cn(
                  "text-muted-foreground",
                  isHidden && "line-through decoration-muted-foreground/60",
                )}
              >
                {item.label}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
