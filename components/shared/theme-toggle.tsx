"use client";

import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { RiMoonLine, RiSunLine } from "@remixicon/react";
import { Switch as AriaSwitch } from "react-aria-components";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { SwitchTrack } from "@/components/shared/switch";
import { useTheme } from "@/components/theme-provider";
import { updateThemePreferenceAction } from "@/features/theme/actions";
import { themeUserStorageKey } from "@/features/theme/types";

export type ThemeMode = "light" | "dark";

const THEME_TRANSITION_DURATION = 820;
const THEME_TRANSITION_EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const THEME_TRANSITION_STYLE_ID = "boardui-theme-transition-style";

type ThemeTransitionOrigin = { x: number; y: number };

type ViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (update: () => void) => ViewTransition;
};

let themeTransitionRunning = false;

function createBlurCircleMask() {
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">',
    '<defs><filter id="blur" x="-50%" y="-50%" width="200%" height="200%">',
    '<feGaussianBlur stdDeviation="2" /></filter></defs>',
    '<circle cx="50" cy="50" r="42" fill="white" filter="url(#blur)" />',
    "</svg>",
  ].join("");

  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function installThemeTransitionStyle(
  { x, y }: ThemeTransitionOrigin,
  radius: number,
  duration: number,
) {
  document.getElementById(THEME_TRANSITION_STYLE_ID)?.remove();

  const mask = createBlurCircleMask();
  const finalMaskSize = radius * 2.5;
  const finalMaskX = x - finalMaskSize / 2;
  const finalMaskY = y - finalMaskSize / 2;
  const style = document.createElement("style");
  style.id = THEME_TRANSITION_STYLE_ID;
  style.textContent = `
    ::view-transition-new(root) {
      -webkit-mask-image: ${mask};
      mask-image: ${mask};
      -webkit-mask-repeat: no-repeat;
      mask-repeat: no-repeat;
      animation: boardui-theme-mask-reveal ${duration}ms ${THEME_TRANSITION_EASING} both;
      transform-origin: ${x}px ${y}px;
      will-change: -webkit-mask-size, -webkit-mask-position, mask-size, mask-position;
    }

    @keyframes boardui-theme-mask-reveal {
      from {
        -webkit-mask-position: ${x}px ${y}px;
        mask-position: ${x}px ${y}px;
        -webkit-mask-size: 0px 0px;
        mask-size: 0px 0px;
      }
      to {
        -webkit-mask-position: ${finalMaskX}px ${finalMaskY}px;
        mask-position: ${finalMaskX}px ${finalMaskY}px;
        -webkit-mask-size: ${finalMaskSize}px ${finalMaskSize}px;
        mask-size: ${finalMaskSize}px ${finalMaskSize}px;
      }
    }
  `;
  document.head.appendChild(style);
  return style;
}

function elementCenter(element: HTMLElement | null): ThemeTransitionOrigin {
  if (!element) {
    return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  }
  const rect = element.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

function normalizedOrigin(
  origin: ThemeTransitionOrigin | null,
  element: HTMLElement | null,
): ThemeTransitionOrigin {
  const fallback = elementCenter(element);
  const x = origin?.x ?? fallback.x;
  const y = origin?.y ?? fallback.y;
  return {
    x: Math.min(Math.max(x, 0), window.innerWidth),
    y: Math.min(Math.max(y, 0), window.innerHeight),
  };
}

/**
 * Reveals the next theme from the interaction point using the View Transition
 * API. Keyboard activation starts at the control's center. Unsupported
 * browsers and reduced-motion users receive the same immediate theme change.
 * The `update` callback commits the theme (canonical ThemeProvider state);
 * it runs inside the transition so the reveal snapshots the new theme.
 */
export async function applyThemeWithTransition(
  {
    origin = null,
    element = null,
    duration = THEME_TRANSITION_DURATION,
    update,
  }: {
    origin?: ThemeTransitionOrigin | null;
    element?: HTMLElement | null;
    duration?: number;
    update: () => void;
  },
) {
  if (typeof document === "undefined") {
    return;
  }

  const transitionDocument = document as ViewTransitionDocument;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!transitionDocument.startViewTransition || reduceMotion) {
    update();
    return;
  }
  if (themeTransitionRunning) return;

  const { x, y } = normalizedOrigin(origin, element);
  const radius = Math.hypot(
    Math.max(x, window.innerWidth - x),
    Math.max(y, window.innerHeight - y),
  );

  themeTransitionRunning = true;
  document.documentElement.classList.add("theme-transitioning");
  const transitionStyle = installThemeTransitionStyle({ x, y }, radius, duration);
  try {
    const transition = transitionDocument.startViewTransition(() => {
      flushSync(() => update());
    });

    await transition.ready;
    await transition.finished;
  } catch {
    // If the browser aborts a transition mid-flight, still commit the theme.
    // The commit is idempotent, so re-running it here is safe.
    update();
  } finally {
    transitionStyle.remove();
    document.documentElement.classList.remove("theme-transitioning");
    themeTransitionRunning = false;
  }
}

export interface ThemeToggleProps {
  /** Compact icon-only treatment for a collapsed sidebar rail. */
  collapsed?: boolean;
  /**
   * Visual treatment for the control. `glass-segmented` is the landing nav's
   * skin: literal black/white rather than theme tokens, because it sits on the
   * hero shader's near-white band in both themes and a token that follows the
   * page would invert out of sight in dark mode.
   */
  appearance?: "sidebar" | "segmented" | "sidebar-segmented" | "glass-segmented";
  className?: string;
  /** Circular reveal duration in milliseconds. */
  transitionDuration?: number;
}

const themeSegmentGroupVariants = cva("relative inline-flex w-fit items-center gap-1 rounded-full", {
  variants: {
    glass: {
      // Mobile: 2px padding + 28px segments = 32px tall, matching the
      // small icon buttons beside it. Desktop keeps the roomier 40px.
      // Padding lives in the branches (not the base) so only one ever
      // reaches the DOM.
      true: "p-0.5 sm:p-1",
      false: "p-1",
    },
    surface: {
      // No track of its own: the host supplies the surface. A fill
      // here would paint over it. Kept registry-safe — this component
      // never imports the landing page's glass.
      glass: "z-10 bg-transparent",
      sidebar: "bg-sidebar-accent",
      muted: "bg-muted",
    },
  },
  defaultVariants: {
    glass: false,
    surface: "muted",
  },
});

const themeSegmentThumbVariants = cva(
  "pointer-events-none absolute rounded-full border border-border shadow-xs transition-transform duration-200 ease",
  {
    variants: {
      // Position/size live in the branches so only one set reaches the DOM.
      glass: {
        true: "top-0.5 left-0.5 size-7 sm:top-1 sm:left-1 sm:size-8",
        false: "top-1 left-1 size-8",
      },
      surface: {
        glass: "bg-card",
        sidebar: "bg-card",
        muted: "bg-card",
      },
      active: {
        // Segment width + the 4px gap: 28+4 on mobile, 32+4 above it.
        light: "",
        darkGlass: "translate-x-8 sm:translate-x-9",
        dark: "translate-x-9",
      },
    },
    defaultVariants: {
      glass: false,
      surface: "muted",
      active: "light",
    },
  },
);

const themeSegmentButtonVariants = cva(
  "relative z-10 grid cursor-pointer place-items-center rounded-full outline-none transition-colors duration-150 ease focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      // Segment size lives in the branches so only one reaches the DOM.
      glass: {
        true: "size-7 sm:size-8",
        false: "size-8",
      },
      tone: {
        glassSelected: "text-black dark:text-white",
        glassIdle: "text-black/45 hover:text-black/70 dark:text-white/45 dark:hover:text-white/70",
        selected: "text-foreground",
        idle: "text-muted-foreground hover:text-foreground",
      },
    },
    defaultVariants: {
      glass: false,
      tone: "idle",
    },
  },
);

const themeCollapsedButtonVariants = cva(
  "flex size-9 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors duration-150 ease hover:bg-accent hover:text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {},
  },
);

const themeRowSwitchVariants = cva(
  "flex w-full cursor-pointer items-center justify-between rounded-md p-2 transition-colors duration-150 ease hover:bg-accent",
  {
    variants: {
      focusVisible: {
        true: "ring-2 ring-inset ring-ring",
        false: "",
      },
    },
    defaultVariants: {
      focusVisible: false,
    },
  },
);

/**
 * Manual light/dark control backed by the canonical ThemeProvider
 * (`requo-theme` storage + cookie + profile preference). It renders the
 * resolved theme and persists an explicit light/dark choice, so it never
 * disagrees with Appearance settings or reverts on reload.
 */
export function ThemeToggle({
  collapsed = false,
  appearance = "sidebar",
  className,
  transitionDuration = THEME_TRANSITION_DURATION,
}: ThemeToggleProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  // Server always renders light (no localStorage/matchMedia); keep the first
  // client render on light so hydration matches, then switch to the stored
  // preference after mount.
  const effectiveTheme = mounted ? resolvedTheme : "light";
  const dark = effectiveTheme === "dark";
  const switchRef = useRef<HTMLLabelElement | null>(null);
  const pointerOriginRef = useRef<ThemeTransitionOrigin | null>(null);

  const requestTheme = (
    next: ThemeMode,
    origin: ThemeTransitionOrigin | null,
    element: HTMLElement | null,
  ) => {
    if (next === resolvedTheme) {
      return;
    }

    // An explicit sidebar choice wins over the cached profile value: clear
    // the user binding so ThemePreferenceSync promotes this choice to the
    // profile on the next dashboard mount instead of overwriting it with
    // stale data (same pattern as MarketingThemeToggle).
    try {
      window.localStorage.removeItem(themeUserStorageKey);
    } catch {
      // The control remains usable when storage is blocked or unavailable.
    }
    void updateThemePreferenceAction(next).catch((error) => {
      console.error("Failed to save theme preference.", error);
    });
    void applyThemeWithTransition({
      origin,
      element,
      duration: transitionDuration,
      update: () => {
        setTheme(next);
        // Mirror the provider's DOM write synchronously so the transition
        // snapshots the new theme; ThemeProvider reconciles right after.
        document.documentElement.classList.toggle("dark", next === "dark");
        document.documentElement.style.colorScheme = next;
      },
    });
  };

  if (
    appearance === "segmented" ||
    appearance === "sidebar-segmented" ||
    appearance === "glass-segmented"
  ) {
    const glass = appearance === "glass-segmented";
    const sidebarSurface = appearance === "sidebar-segmented";
    const options = [
      { mode: "light" as const, label: "Use light mode", Icon: RiSunLine },
      { mode: "dark" as const, label: "Use dark mode", Icon: RiMoonLine },
    ];

    return (
      <div
        role="group"
        aria-label="Theme"
        className={cn(
          themeSegmentGroupVariants({
            glass,
            surface: glass ? "glass" : sidebarSurface ? "sidebar" : "muted",
          }),
          className,
        )}
      >
        <span
          aria-hidden
          className={themeSegmentThumbVariants({
            glass,
            surface: glass ? "glass" : sidebarSurface ? "sidebar" : "muted",
            active: dark ? (glass ? "darkGlass" : "dark") : "light",
          })}
        />
        {options.map(({ mode, label, Icon }) => {
          const selected = effectiveTheme === mode;
          return (
            <button
              key={mode}
              type="button"
              aria-label={label}
              aria-pressed={selected}
              title={mode === "light" ? "Light mode" : "Dark mode"}
              onClick={(event) => {
                if (selected) return;
                const pointerOrigin =
                  event.clientX === 0 && event.clientY === 0
                    ? null
                    : { x: event.clientX, y: event.clientY };
                requestTheme(mode, pointerOrigin, event.currentTarget);
              }}
              className={themeSegmentButtonVariants({
                glass,
                tone: glass
                  ? selected
                    ? "glassSelected"
                    : "glassIdle"
                  : selected
                    ? "selected"
                    : "idle",
              })}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>
    );
  }

  if (collapsed) {
    const Icon = dark ? RiSunLine : RiMoonLine;
    return (
      <button
        type="button"
        aria-label={dark ? "Use light mode" : "Use dark mode"}
        aria-pressed={dark}
        title={dark ? "Light mode" : "Dark mode"}
        onClick={(event) => {
          const pointerOrigin =
            event.clientX === 0 && event.clientY === 0
              ? null
              : { x: event.clientX, y: event.clientY };
          requestTheme(dark ? "light" : "dark", pointerOrigin, event.currentTarget);
        }}
        className={cn(
          themeCollapsedButtonVariants(),
          className,
        )}
      >
        <Icon className="size-5" aria-hidden />
      </button>
    );
  }

  return (
    <AriaSwitch
      ref={switchRef}
      isSelected={dark}
      onPointerDown={(event) => {
        pointerOriginRef.current = { x: event.clientX, y: event.clientY };
      }}
      onChange={(selected) => {
        const origin = pointerOriginRef.current;
        pointerOriginRef.current = null;
        requestTheme(selected ? "dark" : "light", origin, switchRef.current);
      }}
      aria-label="Dark mode"
      className={({ isFocusVisible }) =>
        cn(
          themeRowSwitchVariants({ focusVisible: isFocusVisible }),
          className,
        )
      }
    >
      {(state) => (
        <>
          <span className="flex min-w-0 items-center gap-2">
            <RiMoonLine className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            <span className="text-body-medium text-muted-foreground">Dark mode</span>
          </span>
          <SwitchTrack state={state} size="sm" shape="pill" />
        </>
      )}
    </AriaSwitch>
  );
}
