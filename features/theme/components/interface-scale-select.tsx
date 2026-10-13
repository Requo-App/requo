"use client";

import { useTransition } from "react";

import { useTheme } from "@/components/providers/theme-provider";
import {
  SelectContent,
  SelectItem,
  SelectRoot,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUiScalePreferenceAction } from "@/features/theme/ui-scale-actions";
import {
  isUiScale,
  uiScaleLabels,
  uiScales,
  type UiScale,
} from "@/features/theme/ui-scale-types";
import { themeUserStorageKey } from "@/features/theme/types";

type InterfaceScaleSelectProps = {
  userId: string;
  id?: string;
};

/**
 * Interface scale dropdown for the Appearance settings page.
 * Persists like the theme preference: localStorage + cookie immediately,
 * `profiles.ui_scale` in the background with revert on failure.
 */
export function InterfaceScaleSelect({
  userId,
  id = "interface-scale",
}: InterfaceScaleSelectProps) {
  const { setUiScale, uiScale } = useTheme();
  const [isPending, startTransition] = useTransition();

  function handleValueChange(value: string) {
    if (!isUiScale(value) || value === uiScale || isPending) {
      return;
    }

    const previousScale: UiScale = uiScale;

    window.localStorage.setItem(themeUserStorageKey, userId);
    setUiScale(value);

    startTransition(async () => {
      const result = await updateUiScalePreferenceAction(value);

      if (result.ok) return;

      console.error(result.error);
      setUiScale(previousScale);
    });
  }

  return (
    <SelectRoot
      value={uiScale}
      onValueChange={handleValueChange}
      disabled={isPending}
    >
      <SelectTrigger id={id} aria-label="Interface scale" className="w-full">
        <SelectValue placeholder="Select scale" />
      </SelectTrigger>
      <SelectContent>
        {uiScales.map((scale) => (
          <SelectItem key={scale} value={scale}>
            {uiScaleLabels[scale]}
          </SelectItem>
        ))}
      </SelectContent>
    </SelectRoot>
  );
}
