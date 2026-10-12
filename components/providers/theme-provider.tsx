"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

import {
  isThemePreference,
  themeStorageKey,
  type ThemePreference,
} from "@/features/theme/types";
import {
  defaultUiScale,
  isUiScale,
  uiScaleRootFontSizePercent,
  uiScaleStorageKey,
  type UiScale,
} from "@/features/theme/ui-scale-types";
import {
  persistThemePreference,
  readPersistedThemePreference,
} from "@/features/theme/persistence";
import {
  persistUiScalePreference,
  readPersistedUiScalePreference,
} from "@/features/theme/ui-scale-persistence";

type ResolvedTheme = "light" | "dark";

type ThemeProviderProps = PropsWithChildren<{
  attribute?: "class";
  defaultTheme?: ThemePreference;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  storageKey?: string;
  defaultUiScale?: UiScale;
  uiScaleStorageKey?: string;
}>;

type ThemeContextValue = {
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: ThemePreference) => void;
  theme: ThemePreference;
  uiScale: UiScale;
  setUiScale: (scale: UiScale) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({
  children,
  defaultTheme = "system",
  disableTransitionOnChange = false,
  enableSystem = true,
  storageKey = themeStorageKey,
  defaultUiScale: defaultScale = defaultUiScale,
  uiScaleStorageKey: scaleStorageKey = uiScaleStorageKey,
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemePreference>(() =>
    readStoredTheme(storageKey, defaultTheme),
  );
  const [uiScale, setUiScaleState] = useState<UiScale>(() =>
    readStoredUiScale(scaleStorageKey, defaultScale),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );
  const resolvedTheme = resolveTheme(theme, enableSystem, systemTheme);

  const applyTheme = useCallback(
    (nextResolvedTheme: ResolvedTheme) => {
      const cleanup = disableTransitionOnChange
        ? disableThemeTransitions()
        : null;

      applyResolvedTheme(nextResolvedTheme);
      cleanup?.();
    },
    [disableTransitionOnChange],
  );

  const setTheme = useCallback(
    (nextTheme: ThemePreference) => {
      setThemeState(nextTheme);
      persistThemePreference(nextTheme, {
        storageKey,
      });
    },
    [storageKey],
  );

  const setUiScale = useCallback(
    (nextScale: UiScale) => {
      setUiScaleState(nextScale);
      persistUiScalePreference(nextScale, {
        storageKey: scaleStorageKey,
      });
    },
    [scaleStorageKey],
  );

  useEffect(() => {
    applyTheme(resolvedTheme);
  }, [applyTheme, resolvedTheme]);

  useEffect(() => {
    applyUiScale(uiScale);
  }, [uiScale]);

  useEffect(() => {
    if (!enableSystem) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemTheme(getSystemTheme());
    };

    mediaQuery.addEventListener("change", handleChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [applyTheme, enableSystem, theme]);

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }

      if (event.newValue && isThemePreference(event.newValue)) {
        setThemeState(event.newValue);
        return;
      }

      setThemeState(defaultTheme);
    };

    window.addEventListener("storage", handleStorage);

    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [defaultTheme, storageKey]);

  useEffect(() => {
    const handleScaleStorage = (event: StorageEvent) => {
      if (event.key !== scaleStorageKey) {
        return;
      }

      if (event.newValue && isUiScale(event.newValue)) {
        setUiScaleState(event.newValue);
        return;
      }

      setUiScaleState(defaultScale);
    };

    window.addEventListener("storage", handleScaleStorage);

    return () => {
      window.removeEventListener("storage", handleScaleStorage);
    };
  }, [defaultScale, scaleStorageKey]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      resolvedTheme,
      setTheme,
      theme,
      uiScale,
      setUiScale,
    }),
    [resolvedTheme, setTheme, theme, uiScale, setUiScale],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const value = useContext(ThemeContext);

  if (!value) {
    // If context is lost during SSR (a known Next.js App Router edge case across
    // async boundaries), return a safe dummy object so the server render doesn't crash.
    if (typeof window === "undefined") {
      return {
        resolvedTheme: "light",
        setTheme: () => {},
        theme: "system",
        uiScale: "default",
        setUiScale: () => {},
      } as ThemeContextValue;
    }

    throw new Error("useTheme must be used within ThemeProvider.");
  }

  return value;
}

function readStoredTheme(
  storageKey: string,
  fallbackTheme: ThemePreference,
): ThemePreference {
  if (typeof window === "undefined") {
    return fallbackTheme;
  }

  try {
    const storedTheme = readPersistedThemePreference({
      storageKey,
    });

    if (storedTheme && isThemePreference(storedTheme)) {
      return storedTheme;
    }

    // One-time migration from the legacy BoardUI key: the old sidebar toggle
    // wrote `boardui:theme` instead of the canonical key, so adopt it once
    // and persist through the canonical path (storage + cookie).
    const legacyTheme = window.localStorage.getItem("boardui:theme");

    if (legacyTheme === "light" || legacyTheme === "dark") {
      persistThemePreference(legacyTheme, {
        storageKey,
      });

      try {
        window.localStorage.removeItem("boardui:theme");
      } catch {}
      return legacyTheme;
    }
  } catch {}

  return fallbackTheme;
}

function readStoredUiScale(
  storageKey: string,
  fallbackScale: UiScale,
): UiScale {
  if (typeof window === "undefined") {
    return fallbackScale;
  }

  try {
    const storedScale = readPersistedUiScalePreference({
      storageKey,
    });

    if (storedScale && isUiScale(storedScale)) {
      return storedScale;
    }
  } catch {}

  return fallbackScale;
}

function resolveTheme(
  theme: ThemePreference,
  enableSystem: boolean,
  systemTheme: ResolvedTheme,
): ResolvedTheme {
  if (theme === "dark") {
    return "dark";
  }

  if (theme === "system" && enableSystem) {
    return systemTheme;
  }

  return "light";
}

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyResolvedTheme(theme: ResolvedTheme) {
  const root = document.documentElement;

  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

function applyUiScale(scale: UiScale) {
  const root = document.documentElement;

  root.dataset.uiScale = scale;
  root.style.fontSize = `${uiScaleRootFontSizePercent[scale]}%`;
}

function disableThemeTransitions() {
  const style = document.createElement("style");

  style.appendChild(
    document.createTextNode(
      "*,*::before,*::after{transition:none!important}",
    ),
  );
  document.head.appendChild(style);

  return () => {
    window.getComputedStyle(document.body);

    window.setTimeout(() => {
      document.head.removeChild(style);
    }, 1);
  };
}
