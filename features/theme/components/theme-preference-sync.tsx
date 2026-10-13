"use client";

import { useLayoutEffect, useRef } from "react";

import { useTheme } from "@/components/providers/theme-provider";
import { updateThemePreferenceAction } from "@/features/theme/actions";
import {
  isThemePreference,
  themeStorageKey,
  themeUserStorageKey,
  type ThemePreference,
} from "@/features/theme/types";

type ThemePreferenceSyncProps = {
  themePreference: ThemePreference;
  userId: string;
};

export function ThemePreferenceSync({
  themePreference,
  userId,
}: ThemePreferenceSyncProps) {
  const { setTheme } = useTheme();
  const lastSeedKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const nextSeedKey = `${userId}:${themePreference}`;

    if (lastSeedKeyRef.current === nextSeedKey) {
      return;
    }

    lastSeedKeyRef.current = nextSeedKey;

    const storedUserId = window.localStorage.getItem(themeUserStorageKey);
    const storedTheme = window.localStorage.getItem(themeStorageKey);

    if (storedUserId === userId && storedTheme === themePreference) {
      return;
    }

    // A visitor can choose a theme on marketing pages before signing in. Keep
    // that explicit choice when the dashboard first mounts, then save it as
    // the authenticated profile preference so future navigations agree.
    if (
      !storedUserId &&
      storedTheme &&
      isThemePreference(storedTheme) &&
      storedTheme !== themePreference
    ) {
      window.localStorage.setItem(themeUserStorageKey, userId);
      setTheme(storedTheme);
      void updateThemePreferenceAction(storedTheme).catch((error) => {
        console.error("Failed to promote pre-auth theme preference.", error);
      });
      return;
    }

    window.localStorage.setItem(themeUserStorageKey, userId);
    setTheme(themePreference);
  }, [setTheme, themePreference, userId]);

  return null;
}
