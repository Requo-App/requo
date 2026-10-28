"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AdminSidebar } from "@/features/admin/components/shell/admin-sidebar";
import { cn } from "@/lib/utils";

export type AdminFullscreenNavProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Streamed user menu slot (Suspense-wrapped by the console layout). */
  userSlot: ReactNode;
  /** When provided, Search opens the global record search dialog. */
  onQuickSearch?: () => void;
};

/**
 * Fullscreen admin navigation overlay for mobile (below `lg`).
 *
 * Mirrors `MobileFullscreenNav` (which is business-slug coupled) but renders
 * the admin rail: the same `DashboardSidebar` chrome stretched fullscreen, with
 * the theme toggle and secondary rows stripped because the mobile surface owns
 * its own chrome.
 */
export function AdminFullscreenNav({
  open,
  onOpenChange,
  userSlot,
  onQuickSearch,
}: AdminFullscreenNavProps) {
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
    return () => {
      for (const id of rafIds.current) cancelAnimationFrame(id);
      rafIds.current = [];
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mounted is read at close time
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) {
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
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      restoreTarget?.focus?.();
    };
  }, [mounted, open, onOpenChange]);

  // Close the overlay on successful navigation — instantly, so stale
  // navigation never animates over the destination.
  useEffect(() => {
    if (open) {
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

  return (
    <div
      ref={panelRef}
      inert={!open}
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      aria-label="Admin navigation"
      data-state={visible ? "open" : "closed"}
      className={cn(
        "motion-fullscreen-panel motion-fullscreen-nav fixed inset-0 z-50 flex flex-col bg-sidebar outline-none lg:hidden",
        !visible && "pointer-events-none",
      )}
    >
      <div className="h-dvh w-full">
        <AdminSidebar
          userSlot={userSlot}
          onQuickSearch={onQuickSearch}
          mobile
          onClose={handleClose}
          className="h-full w-full rounded-none border-0 shadow-none"
        />
      </div>
    </div>
  );
}
