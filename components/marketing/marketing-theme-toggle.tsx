"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { themeUserStorageKey } from "@/features/theme/types";
import { cn } from "@/lib/utils";

const emptySubscribe = () => () => {};

export function MarketingThemeToggle({ className }: { className?: string }) {
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const { resolvedTheme, setTheme } = useTheme();

  const toggleTheme = () => {
    // The marketing toggle is an explicit choice that should be promoted to
    // the profile when the dashboard mounts, even for an already signed-in
    // visitor whose previous dashboard preference is cached locally.
    window.localStorage.removeItem(themeUserStorageKey);
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  };

  return (
    <Button
      aria-label="Toggle theme"
      className={cn(
        "size-8 rounded-lg text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      onClick={toggleTheme}
      size="icon-sm"
      type="button"
      variant="ghost"
    >
      {mounted && resolvedTheme === "dark" ? (
        <Sun className="size-4 transition-transform duration-200" />
      ) : (
        <Moon className="size-4 transition-transform duration-200" />
      )}
      <span className="sr-only">Toggle theme</span>
    </Button>
  );
}
