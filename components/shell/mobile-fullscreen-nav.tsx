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
 * workspace nav, `BoarduiSettingsSidebar` for settings) stretched fullscreen,
 * but strips the chrome that already lives elsewhere on mobile: no theme
 * toggle, and no Support/Settings secondary rows. The user profile menu
 * renders at the bottom, same as desktop.
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
  // Two-phase mount so open plays a 240ms slide while route-change closes
  // stay instant (the pathname effect below unmounts without animating).
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
      // Dismissal: quick 180ms slide-out before unmount.
      setVisible(false);
      unmountTimer.current = setTimeout(() => setMounted(false), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted is write-only here
  }, [open ]);

  useEffect(() => {
    if (!mounted) {
      return;
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
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
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
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
      aria-label={variant === "main" ? "Workspace navigation" : "Settings navigation"}
      data-state={visible ? "open" : "closed"}
      className={cn(
        "fixed inset-0 z-50 flex flex-col bg-sidebar outline-none lg:hidden",
        "transition-[transform,opacity] ease-[var(--motion-ease-emphasized)]",
        visible
          ? "translate-x-0 opacity-100 duration-[240ms]"
          : "-translate-x-4 pointer-events-none opacity-0 duration-[180ms]",
      )}
    >
      <div className="h-dvh w-full">
        {variant === "main" ? (
          <BoarduiMainSidebar
            businessSlug={businessSlug}
            role={role}
            topSlot={topSlot}
            bottomSlot={resolvedBottomSlot}
            onQuickSearch={onQuickSearch}
            mobile
            onClose={handleClose}
            showThemeToggle={false}
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
            showThemeToggle={false}
            className="h-full w-full rounded-none border-0 shadow-none"
          />
        )}
      </div>
    </div>
  );
}
