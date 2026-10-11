"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import type { MotionState } from "@/hooks/use-animated-list";

export type MobileRecordRowProps = {
  id: string;
  href: string;
  title: ReactNode;
  subtitle?: ReactNode;
  statusBadge?: ReactNode;
  stateBadge?: ReactNode;
  metadata?: ReactNode;
  isSelected?: boolean;
  isSelectionDisabled?: boolean;
  onToggleSelect?: (id: string) => void;
  motionState?: MotionState;
  itemRef?: (node: HTMLElement | null) => void;
  className?: string;
};

/**
 * Mobile record row component for fast-scanning and accessible interaction
 * on phones and narrow viewports.
 */
export function MobileRecordRow({
  id,
  href,
  title,
  subtitle,
  statusBadge,
  stateBadge,
  metadata,
  isSelected = false,
  isSelectionDisabled = false,
  onToggleSelect,
  motionState,
  itemRef,
  className,
}: MobileRecordRowProps) {
  const hasCheckbox = Boolean(onToggleSelect);

  return (
    <div
      ref={itemRef}
      className={cn(
        "motion-list-item relative flex items-stretch rounded-xl border border-border/80 bg-background shadow-xs transition-colors hover:border-border hover:bg-accent/20 active:bg-accent/30",
        isSelected && "border-primary/40 bg-primary/5",
        className,
      )}
      data-motion-state={motionState}
      key={id}
    >
      {/* Leading Checkbox Control */}
      {hasCheckbox ? (
        <div className="flex w-11 shrink-0 items-center justify-center pl-2">
          <Checkbox
            aria-label="Select record"
            checked={isSelected}
            disabled={isSelectionDisabled}
            onCheckedChange={() => onToggleSelect?.(id)}
            className="size-4 rounded-md"
          />
        </div>
      ) : null}

      {/* Main touch-link target */}
      <Link
        href={href}
        prefetch={true}
        className={cn(
          "flex min-w-0 flex-1 items-center justify-between gap-3 py-3 pr-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-r-xl",
          !hasCheckbox && "pl-3.5",
        )}
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {/* Top Line: Title & Badges */}
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0 flex-1 font-semibold text-sm tracking-tight text-foreground truncate">
              {title}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {statusBadge}
              {stateBadge}
            </div>
          </div>

          {/* Subtitle / Customer info */}
          {subtitle ? (
            <div className="text-xs text-muted-foreground truncate">
              {subtitle}
            </div>
          ) : null}

          {/* Metadata line */}
          {metadata ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground/90">
              {metadata}
            </div>
          ) : null}
        </div>

        {/* Trailing Chevron */}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
      </Link>
    </div>
  );
}
