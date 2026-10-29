"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

import { BoarduiMainSidebar } from "@/components/shell/boardui-main-sidebar";
import { BoarduiSettingsSidebar } from "@/features/settings/components/boardui-settings-sidebar";
import type { SettingsNavigationGroup } from "@/features/settings/navigation";
import type { BusinessMemberRole } from "@/lib/business-members";
import { cn } from "@/lib/utils";

export type MobileFullscreenNavProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessSlug: string;
  role?: BusinessMemberRole;
  variant: "main" | "settings";
  groups?: SettingsNavigationGroup[];
  topSlot?: ReactNode;
  /** User profile menu rendered at the bottom of the sidebar (same as desktop). */
  bottomSlot?: ReactNode;
  checklistSlot?: ReactNode;
  /** When provided, the sidebar Search opens the global record search dialog (same as desktop). */
  onQuickSearch?: () => void;
};

/**
 * Fullscreen navigation overlay for mobile (below `lg`).
 *
 * Reuses the same sidebar UI as desktop (`BoarduiMainSidebar` for the main
 * business nav, `BoarduiSettingsSidebar` for settings) stretched fullscreen,
 * but strips the chrome that already lives elsewhere on mobile: no Settings
 * secondary row. The user profile menu renders at the bottom, same as
 * desktop.
 */
export function MobileFullscreenNav({
  open,
  onOpenChange,
  businessSlug,
  role = "owner",
  variant,
  groups = [],
  topSlot,
  bottomSlot,
  checklistSlot,
  onQuickSearch,
}: MobileFullscreenNavProps) {
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  // Two-phase mount so open and close both play the shared fullscreen
  // motion before the overlay leaves the DOM.
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafIds = useRef<number[]>([]);

  useEffect(() => {
    if (open) {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setMounted(true);
      rafIds.current.push(
        requestAnimationFrame(() =>
          rafIds.current.push(requestAnimationFrame(() => setVisible(true))),
        ),
      );
    } else if (mounted) {
      // Dismissal: exit animation first, then unmount.
      setVisible(false);
      unmountTimer.current = setTimeout(() => setMounted(false), 240);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted is write-only here
  }, [open]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Dropdowns and popovers opened from the nav are portaled above it
        // and dismiss from a capture listener first. Respect that dismissal
        // so one Escape closes the top layer, not both it and the nav.
        if (event.defaultPrevented) {
          return;
        }

        onOpenChange(false);
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      // The panel itself holds focus on open (tabIndex -1), so Shift+Tab must
      // wrap from the panel as well as from the first focusable control.
      const focusOutsidePanel = !panelRef.current.contains(active);
      if (
        event.shiftKey &&
        (active === first || active === panelRef.current || focusOutsidePanel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || focusOutsidePanel)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus();
    const restoreTarget = restoreFocusRef.current;
    return () => {
      for (const id of rafIds.current) cancelAnimationFrame(id);
      rafIds.current = [];
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      restoreTarget?.focus?.();
    };
  }, [mounted, onOpenChange]);

  // Close the overlay on successful navigation — instantly, so stale
  // navigation never animates over the destination.
  useEffect(() => {
    if (open) {
      // Leave instantly on navigation: a fading overlay over the destination
      // reads as a stuck screen, not as motion.
      setVisible(false);
      setMounted(false);
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!mounted) {
    return null;
  }

  const handleClose = () => onOpenChange(false);

  // The user profile menu renders at the bottom, same as desktop; an
  // additionally-passed checklist stacks above it.
  const resolvedBottomSlot =
    bottomSlot && checklistSlot ? (
      <div className="flex w-full flex-col gap-2">
        <div className="w-full">{checklistSlot}</div>
        {bottomSlot}
      </div>
    ) : (
      (bottomSlot ?? checklistSlot ?? undefined)
    );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label={variant === "main" ? "Business navigation" : "Settings navigation"}
      data-state={visible ? "open" : "closed"}
      className={cn(
        "motion-fullscreen-panel motion-fullscreen-nav fixed inset-0 z-50 flex flex-col bg-sidebar outline-none lg:hidden",
        !visible && "pointer-events-none",
      )}
    >
      <div className="h-dvh w-full pb-[env(safe-area-inset-bottom)]">
        {variant === "main" ? (
          <BoarduiMainSidebar
            businessSlug={businessSlug}
            role={role}
            topSlot={topSlot}
            bottomSlot={resolvedBottomSlot}
            onQuickSearch={onQuickSearch}
            mobile
            onClose={handleClose}
            hideSecondaryNav
            className="h-full w-full rounded-none border-0 shadow-none"
          />
        ) : (
          <BoarduiSettingsSidebar
            businessSlug={businessSlug}
            groups={groups}
            topSlot={topSlot}
            bottomSlot={resolvedBottomSlot}
            mobile
            onClose={handleClose}
            className="h-full w-full rounded-none border-0 shadow-none"
          />
        )}
      </div>
    </div>
  );
}
