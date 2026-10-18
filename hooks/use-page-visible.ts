"use client";

import { useSyncExternalStore } from "react";

function subscribeToVisibilityChange(onStoreChange: () => void) {
  document.addEventListener("visibilitychange", onStoreChange);

  return () => document.removeEventListener("visibilitychange", onStoreChange);
}

function pageIsVisible() {
  return document.visibilityState === "visible";
}

/**
 * Whether the tab is visible. Marketing stages that animate on their own use
 * this to stop while the visitor is elsewhere — a hidden tab still runs CSS
 * animations and decodes video otherwise.
 */
export function usePageVisible(): boolean {
  return useSyncExternalStore(
    subscribeToVisibilityChange,
    pageIsVisible,
    () => true,
  );
}
