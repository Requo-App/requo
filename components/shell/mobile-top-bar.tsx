"use client";

import { type ReactNode } from "react";
import { MobileHeaderSlotTarget } from "@/components/shell/mobile-header-slot";
import { cn } from "@/lib/utils";

export type MobileTopBarProps = {
  /** Business avatar / switcher control. */
  businessControl?: ReactNode;
  /** Current page title or breadcrumb title. */
  pageTitle: string;
  /** Notification bell slot — always pinned rightmost. */
  notificationSlot?: ReactNode;
  className?: string;
};

/**
 * Mobile top application bar shown below `lg` breakpoint.
 * Layout: [business avatar] [current page title] [page actions] [bell].
 * Page-level actions (export, archived, create, …) portal into the actions
 * slot from each section; the bell stays pinned rightmost so it never
 * shifts with the title or the contextual actions.
 */
export function MobileTopBar({
  businessControl,
  pageTitle,
  notificationSlot,
  className,
}: MobileTopBarProps) {
  return (
    <div
      className={cn(
        "sticky top-0 z-30 flex h-13 items-center gap-2 border-b border-border/70 bg-background px-3 lg:hidden",
        className,
      )}
    >
      {/* Business avatar button */}
      {businessControl ? (
        <div className="flex size-8 shrink-0 items-center justify-center">
          {businessControl}
        </div>
      ) : null}

      {/* Page Title — a duplicate of the page's own heading, so it is not a
          heading: the page keeps the single h1 for the document. */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">
          {pageTitle}
        </p>
      </div>

      {/* Trailing actions: page actions first, bell always rightmost */}
      <MobileHeaderSlotTarget />
      {notificationSlot ? (
        <div className="flex size-9 shrink-0 items-center justify-center">
          {notificationSlot}
        </div>
      ) : null}
    </div>
  );
}
