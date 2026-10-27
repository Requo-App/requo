"use client";

import { useTransition } from "react";
import { Check } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { updateThemePreferenceAction } from "@/features/theme/actions";
import { InterfaceScaleSelect } from "@/features/theme/components/interface-scale-select";
import {
  isThemePreference,
  themePreferences,
  themeUserStorageKey,
  type ThemePreference,
} from "@/features/theme/types";
import { cn } from "@/lib/utils";

const themePreferenceCardLabels: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System settings",
};

type AppearanceSettingsFormProps = {
  userId: string;
};

export function AppearanceSettingsForm({ userId }: AppearanceSettingsFormProps) {
  const { setTheme, theme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const activeTheme = getActiveTheme(theme);

  function handleSelect(value: ThemePreference) {
    if (value === activeTheme || isPending) return;

    const previousTheme = activeTheme;

    window.localStorage.setItem(themeUserStorageKey, userId);
    setTheme(value);

    startTransition(async () => {
      const result = await updateThemePreferenceAction(value);

      if (result.ok) return;

      console.error(result.error);
      setTheme(previousTheme);
    });
  }

  return (
    <div className="flex w-full flex-col gap-8">
      <section aria-labelledby="appearance-theme-heading" className="flex flex-col gap-3">
        <h2
          id="appearance-theme-heading"
          className="text-sm leading-[1.35] font-medium text-foreground"
        >
          Appearance
        </h2>
        <div
          role="radiogroup"
          aria-label="Color theme"
          className="grid gap-3 sm:grid-cols-3"
        >
          {themePreferences.map((preference) => {
            const isActive = activeTheme === preference;

            return (
              <div key={preference} className="flex flex-col gap-2">
                <button
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  disabled={isPending}
                  onClick={() => handleSelect(preference)}
                  className={cn(
                    "relative overflow-hidden rounded-xl border border-border text-left transition-colors",
                    "focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none",
                    isPending && "pointer-events-none opacity-60",
                  )}
                >
                  <ThemePreviewCard preference={preference} />
                  {isActive && (
                    <span
                      aria-hidden="true"
                      className="absolute right-2 bottom-2 flex size-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm"
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                  )}
                  <span className="sr-only">
                    {themePreferenceCardLabels[preference]}
                    {isActive ? " (selected)" : ""}
                  </span>
                </button>
                <p
                  aria-hidden="true"
                  className={cn(
                    "text-sm leading-5",
                    isActive
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {themePreferenceCardLabels[preference]}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      <section
        aria-labelledby="appearance-interface-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-col gap-1">
          <h2
            id="appearance-interface-heading"
            className="text-sm leading-[1.35] font-medium text-foreground"
          >
            Interface
          </h2>
          <p className="text-sm leading-6 text-muted-foreground">
            Adjust the size of the interface.
          </p>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="interface-scale"
            className="text-sm leading-[1.35] font-medium text-muted-foreground"
          >
            Scale
          </label>
          <InterfaceScaleSelect userId={userId} id="interface-scale" />
        </div>
      </section>
    </div>
  );
}

function ThemePreviewCard({ preference }: { preference: ThemePreference }) {
  if (preference === "light") {
    return (
      <span aria-hidden="true" className="block bg-[var(--theme-preview-light-bg)] p-3">
        <span className="block rounded-lg bg-[var(--theme-preview-light-card)] px-3 py-4 text-lg font-medium text-[var(--theme-preview-light-fg)]">
          Aa
        </span>
      </span>
    );
  }

  if (preference === "dark") {
    return (
      <span aria-hidden="true" className="block bg-[var(--theme-preview-dark-bg)] p-3">
        <span className="block rounded-lg bg-[var(--theme-preview-dark-card)] px-3 py-4 text-lg font-medium text-[var(--theme-preview-dark-fg)] ring-1 ring-[color:var(--theme-preview-dark-border)]">
          Aa
        </span>
      </span>
    );
  }

  return (
    <span aria-hidden="true" className="flex bg-[var(--theme-preview-dark-bg)]">
      <span className="flex-1 bg-[var(--theme-preview-light-bg)] p-3 pr-1.5">
        <span className="block rounded-lg bg-[var(--theme-preview-light-card)] px-3 py-4 text-lg font-medium text-[var(--theme-preview-light-fg)]">
          Aa
        </span>
      </span>
      <span className="flex-1 bg-[var(--theme-preview-dark-bg)] p-3 pl-1.5">
        <span className="block rounded-lg bg-[var(--theme-preview-dark-card)] px-3 py-4 text-lg font-medium text-[var(--theme-preview-dark-fg)] ring-1 ring-[color:var(--theme-preview-dark-border)]">
          Aa
        </span>
      </span>
    </span>
  );
}

function getActiveTheme(theme: string | undefined): ThemePreference {
  if (theme && isThemePreference(theme)) return theme;
  return "system";
}
