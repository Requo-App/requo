"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import { createPortal } from "react-dom";
import {
  RiBankCardLine,
  RiBookOpenLine,
  RiCheckboxCircleFill,
  RiCloseLine,
  RiCodeBlock,
  RiDatabase2Line,
  RiGitMergeLine,
  RiOrganizationChart,
  RiPaletteLine,
  RiPlugLine,
  RiSchoolLine,
  RiSettings6Line,
  RiSettingsLine,
  RiToolsFill,
} from "@remixicon/react";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { SettingsGeneral } from "@/components/shared/settings-general";
import { SettingsProfile } from "@/components/shared/settings-profile";
import { SettingsStorage } from "@/components/shared/settings-storage";
import { SettingsTools } from "@/components/shared/settings-tools";

/**
 * The app-wide settings modal, opened from any sidebar's "Settings" item.
 *
 * Shell (1:1 with the design):
 *   backdrop  black at 70%.
 *   panel     871×614 (max-height 614), radius/3xl (24px), white, shadow/xs.
 *   rail      274px, bg background/secondary, 1px right border, p 10 —
 *             same group/item recipe as the board-team dropdown menus
 *             (label pl-8, items p-8 radius/2lg icon-20 + body-medium),
 *             selected row bg background/secondary/hover.
 *   content   px 32 (274 + 32 = 306 title inset), title row fixed,
 *             the page itself scrolls when taller than the shell (General).
 *
 * Open/close animation: the panel fades in from scale 0.96 + 8px rise
 * (200ms), the backdrop cross-fades (150ms); the same transition plays in
 * reverse on close, and the modal unmounts only after the exit finishes.
 */

export type SettingsPage = "general" | "profile" | "storage" | "tools";

export interface SettingsModalProps {
  /** Controlled open state, owned by the host page, sidebar, or menu. */
  isOpen: boolean;
  /** Called by the backdrop, close button, and Escape key. */
  onClose: () => void;
  /** Page selected each time the modal opens. */
  defaultPage?: SettingsPage;
  /** Optional product artwork used by the animated Current plan card. */
  planArtSrc?: string;
}

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

interface NavEntry {
  label: string;
  icon: IconComponent;
  /** Only pages that exist are navigable; the rest render as static rows. */
  page?: SettingsPage;
}

const NAV_GROUPS: { label: string; items: NavEntry[] }[] = [
  {
    label: "Settings",
    items: [
      { label: "General", icon: RiSettings6Line, page: "general" },
      { label: "Profile", icon: RiSchoolLine, page: "profile" },
      { label: "Appearance", icon: RiPaletteLine },
      { label: "Billing", icon: RiBankCardLine },
      { label: "Rules and Workflows", icon: RiOrganizationChart },
      { label: "Tools", icon: RiToolsFill, page: "tools" },
      { label: "Storage", icon: RiDatabase2Line, page: "storage" },
    ],
  },
  {
    label: "Desktop app",
    items: [
      { label: "General", icon: RiSettingsLine },
      { label: "Plugins", icon: RiPlugLine },
      { label: "Developer", icon: RiCodeBlock },
    ],
  },
  {
    label: "Customize",
    items: [
      { label: "Skills", icon: RiBookOpenLine },
      { label: "Git", icon: RiGitMergeLine },
    ],
  },
];

const PAGE_TITLES: Record<SettingsPage, string> = {
  general: "General",
  profile: "Profile",
  storage: "Storage",
  tools: "Tools",
};

const settingsBackdropVariants = cva(
  "absolute inset-0 cursor-default bg-[var(--modal-backdrop)] transition-opacity duration-150 ease-out",
  {
    variants: {
      visible: {
        true: "opacity-100",
        false: "opacity-0",
      },
    },
    defaultVariants: {
      visible: false,
    },
  },
);

const settingsShellVariants = cva(
  "relative transform-gpu transition-[opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
  {
    variants: {
      visible: {
        true: "scale-100 translate-y-0 opacity-100",
        false: "scale-[0.96] translate-y-2 opacity-0",
      },
    },
    defaultVariants: {
      visible: false,
    },
  },
);

const settingsPanelVariants = cva(
  // overflow-CLIP, not hidden: hidden boxes are still programmatically
  // scrollable, so focusing a switch's hidden input in a row clipped
  // by the inner scroller made the browser scroll-reveal it through
  // the panel too — shifting the whole modal content up with no way
  // back. clip forbids scrolling outright.
  "relative flex h-[614px] max-h-[calc(100dvh-32px)] w-[871px] max-w-[calc(100vw-32px)] overflow-clip rounded-xl bg-background shadow-xs outline-none",
  {
    variants: {},
  },
);

const settingsNavItemVariants = cva(
  "flex w-full cursor-pointer items-center gap-2 rounded-md p-2 text-left outline-none transition-colors duration-150 ease focus-visible:ring-2 focus-visible:ring-ring",
  {
    variants: {
      selected: {
        true: "bg-accent",
        false: "hover:bg-accent/60",
      },
    },
    defaultVariants: {
      selected: false,
    },
  },
);

const settingsTitleRowVariants = cva("flex shrink-0 items-center justify-between px-8 pt-8", {
  variants: {
    page: {
      // Storage keeps a tighter title gap: its page already carries
      // 10px of scroll-safe headroom for the upload progress badge, so
      // the shared pb-3 read as a double margin above the dropzone.
      storage: "pb-1.5",
      default: "pb-3",
    },
  },
  defaultVariants: {
    page: "default",
  },
});

const settingsTopFadeVariants = cva(
  "pointer-events-none absolute inset-x-0 top-0 h-10 bg-linear-to-b from-card to-transparent transition-opacity duration-200 ease-out",
  {
    variants: {
      scrolled: {
        true: "opacity-100",
        false: "opacity-0",
      },
    },
    defaultVariants: {
      scrolled: false,
    },
  },
);

const settingsSavedToastVariants = cva(
  "pointer-events-none absolute bottom-0 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-card py-1 pr-2.5 pl-1.5 shadow-[var(--overlay-surface-shadow)] transition-[opacity,transform] duration-200 ease-out",
  {
    variants: {
      phase: {
        shown: "translate-y-1/2 opacity-100 scale-100",
        // Starts below the resting spot, rises in; keeps drifting up on exit.
        hidden: "translate-y-[calc(50%+12px)] opacity-0 scale-90",
        leaving: "translate-y-[calc(50%-10px)] opacity-0 scale-90",
      },
    },
    defaultVariants: {
      phase: "hidden",
    },
  },
);

export function SettingsModal({
  isOpen,
  onClose,
  defaultPage = "general",
  planArtSrc,
}: SettingsModalProps) {
  const [page, setPage] = useState<SettingsPage>(defaultPage);

  // Mount/visible two-phase state so both the enter and the exit play the
  // full fade + scale transition before the DOM goes away.
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const unmountTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafIds = useRef<number[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // "Saved" toast — floats half-out of the panel's bottom edge for ~2s
  // whenever a profile field commits a change (Enter / blur). Three phases
  // so the motion is directional: it rises in from below ("hidden" starting
  // offset) and keeps drifting upward while fading out ("leaving" offset).
  const [savedPhase, setSavedPhase] = useState<"hidden" | "shown" | "leaving">("hidden");
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showSavedToast = () => {
    if (savedTimer.current) clearTimeout(savedTimer.current);
    setSavedPhase("shown");
    savedTimer.current = setTimeout(() => {
      setSavedPhase("leaving");
      // Reset to the below-the-edge start once the fade-out finished, so the
      // next save rises in from the bottom again (invisible: opacity 0 → 0).
      savedTimer.current = setTimeout(() => setSavedPhase("hidden"), 220);
    }, 2000);
  };

  // Top fade over the scrolling page so rows dissolve under the title row
  // instead of cutting sharply (same recipe as the medical alerts feed).
  const [contentScrolled, setContentScrolled] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      setPage(defaultPage);
      setMounted(true);
      // Double rAF: the panel must commit its hidden state before the
      // transition to visible starts, or the browser skips the animation.
      rafIds.current.push(
        requestAnimationFrame(() =>
          rafIds.current.push(
            requestAnimationFrame(() => setVisible(true)),
          ),
        ),
      );
    } else {
      setVisible(false);
      setSavedPhase("hidden");
      unmountTimer.current = setTimeout(() => setMounted(false), 230);
    }
    return () => {
      for (const id of rafIds.current) cancelAnimationFrame(id);
      rafIds.current = [];
      if (unmountTimer.current) clearTimeout(unmountTimer.current);
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaultPage only matters at the open transition
  }, [isOpen]);

  // Escape closes; focus moves into the dialog once mounted, traps Tab
  // inside, and restores focus to the opener on close/unmount.
  useEffect(() => {
    if (!isOpen || !mounted) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    panelRef.current?.focus();
    const restoreTarget = restoreFocusRef.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreTarget?.focus?.();
    };
  }, [isOpen, mounted, onClose]);

  if (!mounted || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-100 flex items-center justify-center p-4" role="presentation">
      {/* Backdrop — dark-mode modal reference uses black at 70%. */}
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
        className={settingsBackdropVariants({ visible })}
      />

      {/* Animated wrapper — carries the open/close transition for the panel
          AND the saved toast, which straddles the panel's bottom edge and so
          must live outside the panel's overflow-clip. Non-interactive while
          exiting so closing never leaves an invisible interactive layer. */}
      <div
        className={cn(
          settingsShellVariants({ visible }),
          !visible && "pointer-events-none",
        )}
      >
      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        tabIndex={-1}
        className={settingsPanelVariants()}
      >
        {/* Nav rail — the board-team dropdown group/item recipe */}
        <nav
          aria-label="Settings sections"
          className="flex w-[274px] shrink-0 flex-col gap-5 overflow-y-auto border-r border-border bg-muted p-2.5"
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label} className="flex w-full flex-col gap-1.5 pt-1">
              <span className="pl-2 text-body-medium text-muted-foreground">{group.label}</span>
              <div className="flex w-full flex-col gap-1">
                {group.items.map((item) => {
                  const selected = item.page !== undefined && item.page === page;
                  return (
                    <button
                      key={`${group.label}:${item.label}`}
                      type="button"
                      aria-current={selected ? "page" : undefined}
                      onClick={
                        item.page
                          ? () => {
                              setPage(item.page!);
                              setContentScrolled(false);
                            }
                          : undefined
                      }
                      className={settingsNavItemVariants({ selected })}
                    >
                      <item.icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <span
                        className={cn("truncate", selected ? "text-foreground" : "text-muted-foreground", "text-body-medium")}
                      >
                        {item.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Content pane — fixed title row, scrollable page below */}
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={settingsTitleRowVariants({ page: page === "storage" ? "storage" : "default" })}
          >
            <h2 className="text-title-3-medium text-foreground">{PAGE_TITLES[page]}</h2>
            <button
              type="button"
              aria-label="Close settings"
              onClick={onClose}
              className={cn(
                "flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full",
                "bg-muted text-muted-foreground",
                "transition-colors duration-150 ease hover:bg-accent",
                "outline-none focus-visible:ring-2 focus-visible:ring-ring",
              )}
            >
              <RiCloseLine className="size-4" aria-hidden />
            </button>
          </div>
          <div className="relative min-h-0 flex-1">
            <div
              className="h-full overflow-y-auto px-8 pb-8"
              onScroll={(e) => setContentScrolled(e.currentTarget.scrollTop > 0)}
            >
              {page === "profile" ? (
                <SettingsProfile onSaved={showSavedToast} />
              ) : page === "storage" ? (
                <SettingsStorage />
              ) : page === "tools" ? (
                <SettingsTools />
              ) : (
                <SettingsGeneral planArtSrc={planArtSrc} />
              )}
            </div>
            {/* Progressive top fade — eases in once the page is scrolled so
                content dissolves under the title row instead of hard-cutting. */}
            <div
              aria-hidden
              className={settingsTopFadeVariants({ scrolled: contentScrolled })}
            />
          </div>
        </div>
      </div>

      {/* Saved toast — straddles the panel's bottom edge, half in / half out. */}
      <div
        aria-live="polite"
        className={settingsSavedToastVariants({ phase: savedPhase })}
      >
        <RiCheckboxCircleFill className="size-4 shrink-0 text-success-ink" aria-hidden />
        <span className="text-body-2-medium whitespace-nowrap text-foreground">Saved</span>
      </div>
      </div>
    </div>,
    document.body,
  );
}
