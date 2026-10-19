"use client";

import { useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import { CalendarDate, getLocalTimeZone, today } from "@internationalized/date";
import {
  RangeCalendar,
  type DateValue,
  type RangeValue,
} from "react-aria-components";

import { MonthPanel } from "@/components/shared/date-picker-shared";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  presetLabels,
  type AnalyticsRangePreset,
} from "@/features/analytics/lib/window";
import { cn } from "@/lib/utils";

import { useAnalyticsParams } from "./use-analytics-params";

const PAID_PRESETS: Array<Exclude<AnalyticsRangePreset, "custom">> = [
  "7d",
  "30d",
  "90d",
  "12m",
  "all",
];

function toCalendarDate(iso: string | null): CalendarDate | null {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [year, month, day] = iso.split("-").map(Number);
  try {
    return new CalendarDate(year, month, day);
  } catch {
    return null;
  }
}

function toIsoDate(date: DateValue): string {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

/**
 * Range control: preset list plus a dual-month React Aria range calendar for
 * custom windows. Custom dates are applied explicitly so picking a range never
 * fires a request per click; presets apply immediately.
 */
export function AnalyticsRangePicker({
  label,
  range,
  from,
  to,
}: {
  label: string;
  range: AnalyticsRangePreset;
  from: string | null;
  to: string | null;
}) {
  const { update, isPending } = useAnalyticsParams();
  const [open, setOpen] = useState(false);
  const [customRange, setCustomRange] = useState<RangeValue<CalendarDate> | null>(
    () => {
      const start = toCalendarDate(from);
      const end = toCalendarDate(to);
      return start && end ? { start, end } : null;
    },
  );

  const handlePreset = (preset: Exclude<AnalyticsRangePreset, "custom">) => {
    setOpen(false);
    update({ range: preset, from: null, to: null });
  };

  const handleApply = () => {
    if (!customRange?.start || !customRange.end) return;
    setOpen(false);
    update({
      range: "custom",
      from: toIsoDate(customRange.start),
      to: toIsoDate(customRange.end),
    });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label={`Date range: ${label}`}
          aria-pressed={range === "custom"}
          data-pending={isPending ? "" : undefined}
          className={cn("justify-start gap-1.5", isPending && "opacity-70")}
        >
          <CalendarDays data-icon="inline-start" aria-hidden />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto max-w-[calc(100vw-1.5rem)] p-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
          <ul className="flex shrink-0 flex-col gap-0.5 sm:w-36">
            {PAID_PRESETS.map((preset) => {
              const isActive = range === preset;
              return (
                <li key={preset}>
                  <button
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => handlePreset(preset)}
                    className={cn(
                      "flex w-full cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm outline-none transition-colors",
                      "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    <span>{presetLabels[preset]}</span>
                    {isActive ? <Check className="size-4" aria-hidden /> : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="flex min-w-0 flex-col gap-2 sm:border-l sm:border-border/70 sm:pl-4">
            <p className="meta-label">Custom range</p>
            <div className="overflow-x-auto">
              <RangeCalendar
                aria-label="Custom date range"
                value={customRange}
                onChange={setCustomRange}
                visibleDuration={{ months: 2 }}
                maxValue={today(getLocalTimeZone())}
                className="flex flex-col gap-2 outline-none"
              >
                <div className="flex gap-6">
                  <MonthPanel offset={0} showPrev />
                  <MonthPanel offset={1} showNext />
                </div>
              </RangeCalendar>
            </div>
            <div className="flex items-center justify-between gap-2">
              <p className="min-w-0 truncate text-xs text-muted-foreground">
                {customRange?.start && customRange.end
                  ? `${toIsoDate(customRange.start)} → ${toIsoDate(customRange.end)}`
                  : "Pick a start and end date"}
              </p>
              <Button
                size="sm"
                onClick={handleApply}
                disabled={!customRange?.start || !customRange?.end}
                className="shrink-0"
              >
                Apply
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Static range chip — the only range control a Free workspace sees. */
export function AnalyticsRangePill({ label }: { label: string }) {
  return (
    <span className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border/85 bg-muted/40 px-2.5 text-sm text-muted-foreground">
      <CalendarDays className="size-4" aria-hidden />
      {label}
    </span>
  );
}
