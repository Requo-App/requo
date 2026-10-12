"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import { AdminSidebar } from "@/features/admin/components/shell/admin-sidebar";

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

  useEffect(() => {
    if (!open) {
      return;
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onOpenChange(false);
      }
    };

    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onOpenChange]);

  // Close the overlay on successful navigation.
  useEffect(() => {
    if (open) {
      onOpenChange(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (!open) {
    return null;
  }

  const handleClose = () => onOpenChange(false);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin navigation"
      className="fixed inset-0 z-50 flex flex-col bg-sidebar lg:hidden"
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
