"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";

type BulkActionBarProps = {
  selectedCount: number;
  totalOnPage: number;
  totalMatchingFilters?: number;
  maxSelection: number;
  allOnPageSelected: boolean;
  onSelectAllOnPage: () => void;
  onSelectAllMatchingFilters?: () => void;
  /**
   * Label for the "select everything matching the filters" affordance.
   * Defaults to "Select all (up to N)". Override it when the handler can
   * only reach the rows that are already loaded — the label must not
   * promise a set the handler cannot deliver.
   */
  selectAllMatchingFiltersLabel?: string;
  selectAllMatchingFiltersPending?: boolean;
  onDeselectAll: () => void;
  children: React.ReactNode;
};

export function BulkActionBar({
  selectedCount,
  totalOnPage,
  totalMatchingFilters,
  maxSelection,
  allOnPageSelected,
  onSelectAllOnPage,
  onSelectAllMatchingFilters,
  selectAllMatchingFiltersLabel,
  selectAllMatchingFiltersPending = false,
  onDeselectAll,
  children,
}: BulkActionBarProps) {
  const [mounted, setMounted] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  useEffect(() => {
    if (selectedCount > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsVisible(true);
      setIsExiting(false);
    } else if (isVisible) {
      setIsExiting(true);
      const timer = setTimeout(() => {
        setIsVisible(false);
        setIsExiting(false);
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [selectedCount, isVisible]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && selectedCount > 0) {
        onDeselectAll();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedCount, onDeselectAll]);

  if (!mounted || (!isVisible && selectedCount === 0)) {
    return null;
  }

  const content = (
    <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] lg:bottom-4 z-50 flex justify-center px-3 sm:px-4 pointer-events-none">
      <div
        data-padding="none"
        className="overlay-surface pointer-events-auto motion-safe:data-[state=open]:animate-in motion-safe:data-[state=open]:fade-in-0 motion-safe:data-[state=open]:slide-in-from-bottom-2 motion-safe:data-[state=open]:zoom-in-95 motion-safe:data-[state=open]:duration-200 motion-safe:data-[state=open]:ease-(--motion-ease-emphasized) motion-safe:data-[state=closed]:animate-out motion-safe:data-[state=closed]:fade-out-0 motion-safe:data-[state=closed]:slide-out-to-bottom-2 motion-safe:data-[state=closed]:zoom-out-95 motion-safe:data-[state=closed]:duration-150 motion-safe:data-[state=closed]:ease-(--motion-ease-standard) data-[state=closed]:pointer-events-none motion-reduce:animate-none flex w-full sm:w-max max-w-[calc(100vw-1.5rem)] sm:max-w-3xl flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 border px-3 py-2.5 sm:px-4"
        data-state={isExiting ? "closed" : "open"}
        role="toolbar"
        aria-label="Bulk actions"
      >
        <div className="flex min-w-0 items-center gap-2.5 sm:border-r sm:border-border/60 sm:pr-3">
          <span
            aria-live="polite"
            className="flex shrink-0 items-center gap-1.5 whitespace-nowrap text-sm"
          >
            <span className="flex min-w-6 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {selectedCount}
            </span>
            <span className="font-medium">selected</span>
          </span>

          <span
            aria-hidden="true"
            className="h-4 w-px shrink-0 bg-border/70"
          />

          <div className="flex min-w-0 items-center gap-1 whitespace-nowrap">
            {allOnPageSelected ? (
              <button
                className="shrink-0 rounded-sm px-1 py-0.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onDeselectAll}
                type="button"
              >
                Deselect all
              </button>
            ) : (
              <button
                className="shrink-0 rounded-sm px-1 py-0.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={onSelectAllOnPage}
                type="button"
              >
                Select page
              </button>
            )}

            {totalMatchingFilters !== undefined &&
              totalMatchingFilters > totalOnPage &&
              onSelectAllMatchingFilters && (
                <>
                  <span
                    aria-hidden="true"
                    className="shrink-0 select-none text-muted-foreground/50"
                  >
                    ·
                  </span>
                  <button
                    className="shrink-0 truncate rounded-sm px-1 py-0.5 text-sm font-medium text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                    disabled={
                      selectedCount >= maxSelection ||
                      selectAllMatchingFiltersPending
                    }
                    onClick={onSelectAllMatchingFilters}
                    type="button"
                  >
                    {selectAllMatchingFiltersLabel ??
                      `Select all (up to ${maxSelection})`}
                  </button>
                </>
              )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-2 sm:border-t-0 sm:pt-0">
          {children}
          <span
            aria-hidden="true"
            className="h-5 w-px shrink-0 bg-border/70"
          />
          <Button
            className="ml-auto size-8 shrink-0 rounded-full sm:ml-1"
            onClick={onDeselectAll}
            size="icon"
            variant="ghost"
            aria-label="Cancel selection"
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
