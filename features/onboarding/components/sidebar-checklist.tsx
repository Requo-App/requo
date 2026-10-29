"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Minimize2,
  PartyPopper,
  X,
} from "lucide-react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import type { ActivationChecklistItem } from "@/features/onboarding/activation-checklist";

export type ChecklistItem = ActivationChecklistItem;

type SidebarChecklistProps = {
  items: ChecklistItem[];
};

const CHECKLIST_DISMISSED_KEY = "requo:checklist:dismissed";

export function SidebarChecklist({ items }: SidebarChecklistProps) {
  const isMobile = useIsMobile();
  const [open, setOpen] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);

  const completedCount = items.filter((item) => item.complete).length;
  const totalCount = items.length;
  const allComplete = completedCount === totalCount;
  const progressPercent = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const currentStepId = items.find(
    (item) => !item.complete && !item.disabled,
  )?.id;

  // Check localStorage for dismissal
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (localStorage.getItem(CHECKLIST_DISMISSED_KEY)) {
          setDismissed(true);
        }
      } catch {
        // localStorage unavailable
      }
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // Show celebration when all items are complete
  useEffect(() => {
    if (!allComplete || dismissed) return;
    const showTimer = setTimeout(() => {
      setShowCelebration(true);
    }, 0);
    const hideTimer = setTimeout(() => {
      setShowCelebration(false);
    }, 5000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [allComplete, dismissed]);

  function handleDismiss() {
    try {
      localStorage.setItem(CHECKLIST_DISMISSED_KEY, new Date().toISOString());
    } catch {
      // localStorage unavailable
    }
    setDismissed(true);
    setOpen(false);
  }

  if (dismissed) {
    return null;
  }

  // Show celebration state when all complete
  if (allComplete && showCelebration) {
    return (
      <div className="px-4 pb-3 group-data-[collapsible=icon]:hidden">
        <div className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2.5">
          <PartyPopper className="size-4 shrink-0 text-primary-ink" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-foreground">All set!</p>
            <p className="text-[10px] text-muted-foreground">You&apos;ve completed all getting started steps.</p>
          </div>
          <button
            aria-label="Dismiss"
            className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            type="button"
          >
            <X className="size-3" />
          </button>
        </div>
      </div>
    );
  }

  if (allComplete) {
    return null;
  }

  return (
    <div className="px-4 pb-3 group-data-[collapsible=icon]:hidden">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="h-9 w-full justify-between gap-2 rounded-lg px-3 text-sm font-medium"
          >
            <span>Getting started</span>
            <span className="tabular-nums text-muted-foreground">
              {completedCount}/{totalCount}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align={isMobile ? "center" : "start"}
          className={cn(
            "p-0",
            isMobile
              ? // The trigger sits at the bottom of the fullscreen drawer.
                // Open upward inside the viewport instead of pushing a 320px
                // panel off the right edge.
                "w-[min(20rem,calc(100vw-1rem))]"
              : "w-80",
          )}
          collisionPadding={isMobile ? 8 : 12}
          side={isMobile ? "top" : "right"}
          sideOffset={8}
        >
          <div className="flex items-start justify-between border-b border-[var(--overlay-divider)] px-4 py-3">
            <div>
              <p className="font-heading text-sm font-semibold text-foreground">
                Getting started
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                {completedCount} of {totalCount} done
              </p>
            </div>
            <button
              aria-label="Close popover"
              className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setOpen(false)}
              type="button"
            >
              <Minimize2 className="size-3.5" />
            </button>
          </div>

          {/* Progress bar */}
          <div className="px-4 pt-3 pb-1">
            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary [transition:width_var(--motion-duration-slow)_var(--motion-ease-standard)]"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <ol className="flex flex-col px-2 py-1">
            {items.map((item, index) => {
              const isCurrent = item.id === currentStepId;
              const stepNumber = index + 1;

              const rowBody = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums",
                      item.complete && "bg-primary text-primary-foreground",
                      !item.complete &&
                        isCurrent &&
                        "border border-primary text-primary-ink",
                      !item.complete &&
                        !isCurrent &&
                        "border border-border text-muted-foreground",
                    )}
                  >
                    {item.complete ? (
                      <Check className="size-3" strokeWidth={3} />
                    ) : (
                      stepNumber
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span
                      className={cn(
                        "block truncate text-sm leading-5 font-medium",
                        item.complete || item.disabled
                          ? "text-muted-foreground"
                          : "text-foreground",
                      )}
                    >
                      {item.title}
                    </span>
                    <span className="block truncate text-xs leading-5 text-muted-foreground">
                      {item.detail}
                    </span>
                  </span>
                  {item.complete ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Done
                    </span>
                  ) : item.disabled ? (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      Locked
                    </span>
                  ) : item.external ? (
                    <ArrowUpRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  ) : (
                    <ArrowRight
                      className="size-3.5 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  )}
                </>
              );

              const rowClassName = cn(
                "flex items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors",
                !item.disabled && "hover:bg-accent/60",
                item.disabled && "opacity-60",
                isCurrent && "bg-accent/40",
              );

              if (item.disabled) {
                return (
                  <li key={item.id}>
                    <div className={rowClassName} aria-disabled="true">
                      {rowBody}
                    </div>
                  </li>
                );
              }

              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    {...(item.external
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : {})}
                    className={rowClassName}
                    aria-label={`${item.title} — ${item.actionLabel}`}
                  >
                    {rowBody}
                  </Link>
                </li>
              );
            })}
          </ol>

          {/* Dismiss option */}
          <div className="border-t border-[var(--overlay-divider)] px-4 py-2">
            <button
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={handleDismiss}
              type="button"
            >
              Hide checklist
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
