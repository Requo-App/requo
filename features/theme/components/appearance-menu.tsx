"use client";

import { Fragment, useTransition } from "react";
import { MonitorCog, MoonStar, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { updateThemePreferenceAction } from "@/features/theme/actions";
import {
  isThemePreference,
  themePreferenceLabels,
  themePreferences,
  themeUserStorageKey,
  type ThemePreference,
} from "@/features/theme/types";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

const themePreferenceIcons = {
  light: Sun,
  dark: MoonStar,
  system: MonitorCog,
} satisfies Record<ThemePreference, typeof Sun>;

type AppearanceMenuProps = {
  className?: string;
  align?: "start" | "center" | "end";
  userId: string;
  iconOnly?: boolean;
};

type AppearanceMenuRadioGroupProps = {
  userId: string;
};

export function AppearanceMenu({
  className,
  align = "end",
  userId,
  iconOnly = false,
}: AppearanceMenuProps) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="Open appearance menu"
          className={className}
          size={iconOnly ? "icon" : "default"}
          type="button"
          variant="outline"
        >
          <MonitorCog data-icon="inline-start" />
          {iconOnly ? <span className="sr-only">Appearance</span> : "Appearance"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52 rounded-xl">
        <DropdownMenuLabel className="px-2 py-2.5">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AppearanceMenuRadioGroup userId={userId} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppearanceMenuSubmenu({
  userId,
}: {
  userId: string;
}) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Fragment>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="px-2 py-2.5">
          Appearance
        </DropdownMenuLabel>
        <AppearanceMenuRadioGroup userId={userId} />
      </Fragment>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <MonitorCog data-icon="inline-start" />
        Appearance
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-48 rounded-xl">
        <DropdownMenuLabel className="px-2 py-2.5">
          Appearance
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <AppearanceMenuRadioGroup userId={userId} />
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function AppearanceMenuRadioGroup({
  userId,
}: AppearanceMenuRadioGroupProps) {
  const { setTheme, theme } = useTheme();
  const [isPending, startTransition] = useTransition();
  const activeTheme = getActiveTheme(theme);

  function handleValueChange(value: string) {
    if (!isThemePreference(value) || value === activeTheme || isPending) {
      return;
    }

    const previousTheme = activeTheme;

    window.localStorage.setItem(themeUserStorageKey, userId);
    setTheme(value);

    startTransition(async () => {
      const result = await updateThemePreferenceAction(value);

      if (result.ok) {
        return;
      }

      console.error(result.error);
      setTheme(previousTheme);
    });
  }

  return (
    <DropdownMenuRadioGroup value={activeTheme} onValueChange={handleValueChange}>
      {themePreferences.map((themePreference) => {
        const Icon = themePreferenceIcons[themePreference];

        return (
          <DropdownMenuRadioItem
            disabled={isPending}
            key={themePreference}
            value={themePreference}
          >
            <Icon data-icon="inline-start" />
            <span className="flex-1">{themePreferenceLabels[themePreference]}</span>
            <span
              className={cn(
                "text-xs uppercase tracking-[0.14em] text-muted-foreground",
                activeTheme === themePreference ? "opacity-100" : "opacity-0",
              )}
            >
              on
            </span>
          </DropdownMenuRadioItem>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}

function getActiveTheme(theme: string | undefined): ThemePreference {
  if (theme && isThemePreference(theme)) {
    return theme;
  }

  return "system";
}
