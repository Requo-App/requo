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
    // The dashboard shell scrolls inside its card, not the window.
    const scrollTarget =
      document.querySelector<HTMLElement>("[data-shell-scroll]") ?? window;

    const readScrollTop = () =>
      Math.max(
        scrollTarget instanceof HTMLElement
          ? scrollTarget.scrollTop
          : scrollTarget.scrollY,
        0,
      );

    const updateState = () => {
      frameId = 0;

      const currentScrollY = readScrollTop();
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

    lastScrollYRef.current = readScrollTop();

    scrollTarget.addEventListener("scroll", requestUpdate, { passive: true });

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      scrollTarget.removeEventListener("scroll", requestUpdate);
    };
  }, [directionThreshold, threshold]);

  // Route changes reset the shell scroller, which fires the handler above and
  // returns the dock to "top".
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
      <div className="overlay-surface flex items-center gap-1 rounded-full border px-2 py-1.5">
        <button
          type="button"
          onClick={onHomeClick}
          aria-label="Open navigation"
          aria-expanded={navOpen}
          className={cn(
            "motion-press flex size-11 items-center justify-center rounded-full",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            navOpen
              ? "bg-primary/10 text-primary-ink"
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
            "motion-press flex size-11 items-center justify-center rounded-full",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            searchOpen
              ? "bg-primary/10 text-primary-ink"
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
            "motion-press flex size-11 items-center justify-center rounded-full",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
            settingsOpen
              ? "bg-primary/10 text-primary-ink"
              : "text-muted-foreground hover:bg-muted hover:text-foreground active:text-foreground",
          )}
        >
          <RiSettings4Line className="size-5" aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
