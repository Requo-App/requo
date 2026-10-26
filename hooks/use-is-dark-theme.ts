"use client";

import { useSyncExternalStore } from "react";

const DARK_CLASS = "dark";

function subscribeToThemeClass(onStoreChange: () => void) {
  if (typeof MutationObserver === "undefined") {
    return () => {};
  }

  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["class"],
    attributes: true,
  });

  return () => observer.disconnect();
}

function isDarkTheme() {
  return document.documentElement.classList.contains(DARK_CLASS);
}

/**
 * Whether the document is currently in the dark theme.
 *
 * The theme provider writes the `dark` class before paint and keeps it in sync
 * through the marketing toggle. Reading the class (rather than the theme
 * context) lets server-rendered marketing stages stay provider-agnostic while
 * still reacting to a toggle mid-session.
 */
export function useIsDarkTheme(): boolean {
  return useSyncExternalStore(subscribeToThemeClass, isDarkTheme, () => false);
}
