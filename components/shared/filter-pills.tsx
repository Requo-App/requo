"use client";

import { cn } from "@/lib/utils";

type FilterPillOption<T extends string> = {
  label: string;
  value: T;
};

type FilterPillsProps<T extends string> = {
  label: string;
  options: readonly FilterPillOption<T>[];
  value: T;
  onChange: (value: T) => void;
};

/**
 * Compact pill group for narrow overlays (e.g. archived sheets) where a
 * full `DataListToolbar` combobox row would stack awkwardly. Mirrors the
 * active status colour with semantic tokens only.
 */
export function FilterPills<T extends string>({
  label,
  options,
  value,
  onChange,
}: FilterPillsProps<T>) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="meta-label">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={option.value}
              aria-pressed={active}
              className={cn(
                "inline-flex min-h-7 items-center rounded-full border px-3 py-1 text-xs font-medium transition-[transform,background-color,border-color,color] duration-150 ease-[var(--motion-ease-standard)] active:scale-[0.97] disabled:pointer-events-none",
                active
                  ? "border-primary/30 bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
              )}
              onClick={() => onChange(option.value)}
              type="button"
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
