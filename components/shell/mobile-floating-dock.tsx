"use client";

import { useEffect, useRef, useState } from "react";
import { RiHomeLine, RiSearchLine, RiSettings4Line } from "@remixicon/react";

import { cn } from "@/lib/utils";

export type MobileFloatingDockProps = {
  navOpen: boolean;
  settingsOpen: boolean;
  searchOpen: boolean;
  onHomeClick: () => void;
  onSearchClick: () => void;
  onSettingsClick: () => void;
  directionThreshold?: number;
  threshold?: number;
};

type DockScrollState = "top" | "visible" | "hidden";

/**
 * Floating 3-action pill for mobile: Home always opens the main fullscreen
 * navigation, Search opens fullscreen global record search, Settings opens
 * the fullscreen settings navigation. The user profile lives at the bottom
 * of the sidebars instead of the dock.
 *
 * The pill stays horizontally centered and auto-hides on scroll down,
 * sliding back in on scroll up (or near the top) — mirroring
 * `PublicPageScrollHeader`.
 */
export function MobileFloatingDock({
  navOpen,
  settingsOpen,
  searchOpen,
  onHomeClick,
  onSearchClick,
  onSettingsClick,
  directionThreshold = 4,
  threshold = 32,
}: MobileFloatingDockProps) {
  const [scrollState, setScrollState] =
    useState<DockScrollState>("top");
  const lastScrollYRef = useRef(0);

  useEffect(() => {
    let frameId = 0;

    const updateState = () => {
      frameId = 0;

      const currentScrollY = Math.max(window.scrollY, 0);
      const previousScrollY = lastScrollYRef.current;
      const scrollDelta = currentScrollY - previousScrollY;

      lastScrollYRef.current = currentScrollY;

      if (currentScrollY <= threshold) {
        setScrollState((current) => (current === "top" ? current : "top"));
        return;
      }

      if (Math.abs(scrollDelta) < directionThreshold) return;

      const nextState: DockScrollState =
        scrollDelta < 0 ? "visible" : "hidden";
      setScrollState((current) =>
        current === nextState ? current : nextState,
      );
    };

    const requestUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateState);
    };

    lastScrollYRef.current = Math.max(window.scrollY, 0);
    window.addEventListener("scroll", requestUpdate, { passive: true });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      window.removeEventListener("scroll", requestUpdate);
    };
  }, [directionThreshold, threshold]);

  // No route-change reset needed: navigation scrolls the page back to the
  // top, which fires the handler above and returns the dock to "top".
  const hidden = scrollState === "hidden";

  return (
    <nav
      aria-label="Mobile navigation"
      data-scroll-state={scrollState}
      className={cn(
        "fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 -translate-x-1/2 lg:hidden",
        "transition-[translate,opacity] duration-(--motion-duration-base) ease-(--motion-ease-emphasized)",
        hidden
          ? "translate-y-[calc(100%+1.5rem)] opacity-0"
          : "translate-y-0 opacity-100",
        hidden && "pointer-events-none",
      )}
    >
      <div className="flex items-center gap-1 rounded-full border border-border/70 bg-background/95 px-2 py-1.5 shadow-lg backdrop-blur supports-backdrop-filter:bg-background/85">
        <button
          type="button"
          onClick={onHomeClick}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors active:scale-95",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            navOpen
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground active:text-foreground",
          )}
        >
          <RiHomeLine className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onSearchClick}
          aria-label="Search records"
          aria-expanded={searchOpen}
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors active:scale-95",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            searchOpen
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground active:text-foreground",
          )}
        >
          <RiSearchLine className="size-5" aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={onSettingsClick}
          aria-label="Open settings"
          aria-expanded={settingsOpen}
          className={cn(
            "flex size-11 items-center justify-center rounded-full transition-colors active:scale-95",
            "outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring",
            settingsOpen
              ? "bg-primary/10 text-primary"
              : "text-muted-foreground hover:bg-muted hover:text-foreground active:text-foreground",
          )}
        >
          <RiSettings4Line className="size-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
