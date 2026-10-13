"use client";

import { useLayoutEffect, useRef } from "react";

import { useTheme } from "@/components/providers/theme-provider";
import { themeUserStorageKey } from "@/features/theme/types";
import {
  isUiScale,
  uiScaleStorageKey,
  type UiScale,
} from "@/features/theme/ui-scale-types";
import { updateUiScalePreferenceAction } from "@/features/theme/ui-scale-actions";

type UiScaleSyncProps = {
  uiScale: UiScale;
  userId: string;
};

export function UiScaleSync({ uiScale, userId }: UiScaleSyncProps) {
  const { setUiScale } = useTheme();
  const lastSeedKeyRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    const nextSeedKey = `${userId}:${uiScale}`;

    if (lastSeedKeyRef.current === nextSeedKey) {
      return;
    }

    lastSeedKeyRef.current = nextSeedKey;

    const storedUserId = window.localStorage.getItem(themeUserStorageKey);
    const storedScale = window.localStorage.getItem(uiScaleStorageKey);

    if (storedUserId === userId && storedScale === uiScale) {
      return;
    }

    // A visitor can choose a scale on marketing pages before signing in. Keep
    // that explicit choice when the dashboard first mounts, then save it as
    // the authenticated profile preference so future navigations agree.
    if (
      !storedUserId &&
      storedScale &&
      isUiScale(storedScale) &&
      storedScale !== uiScale
    ) {
      window.localStorage.setItem(themeUserStorageKey, userId);
      setUiScale(storedScale);
      void updateUiScalePreferenceAction(storedScale).catch((error) => {
        console.error("Failed to promote pre-auth interface scale.", error);
      });
      return;
    }

    window.localStorage.setItem(themeUserStorageKey, userId);
    setUiScale(uiScale);
  }, [setUiScale, uiScale, userId]);

  return null;
}
