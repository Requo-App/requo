"use client";

import { RiInformationFill } from "@remixicon/react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Metric definition trigger for KPI cards.
 *
 * Kept in a client module so Radix's `asChild` slot clones an element created
 * on the same side of the server/client boundary. A server component passing
 * a button into the client trigger hydrates as an extra node.
 */
export function MetricHint({ label, hint }: { label: string; hint: string }) {
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={`About ${label}`}
            className="flex shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RiInformationFill className="size-4" aria-hidden />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-[240px]">{hint}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
