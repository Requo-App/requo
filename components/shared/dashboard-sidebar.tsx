"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  Asterisk,
  Calendar,
  Home,
  Image as ImageIcon,
  Landmark,
  Megaphone,
  MessageCircle,
  PanelLeft,
  Search,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SettingsModal } from "./settings-modal";
import { Badge } from "@/components/shared/badge";
import { CloseButton } from "@/components/shared/close-button";
import { Button } from "@/components/ui/button";
import { DashboardTeamMenu } from "./dashboard-team-menu";
import { DashboardUserMenu } from "./dashboard-user-menu";

/**
 * Collapsible navigation panel with two presentations:
 *
 * - Panel (default): expanded 264px wide with p 12, radius/3xl (24px), a white
 *   1px border, elevation shadow, and secondary bg; collapsed 60px wide
 *   (36px icon items + 12px padding).
 * - Inset (`inset`): a seamless rail on the shell frame with a constant 8px
 *   padding. Expanded 264px, collapsed 52px (8px padding + a 36px icon
 *   column). Rows stay left-anchored while the rail narrows, so icons hold
 *   their x instead of sliding.
 *
 * The two states morph into each other: the panel width animates while
 * labels / badges / kbd collapse via max-width + opacity.
 */

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

/**
 * Collapsible text/badge slot: blurs + fades + shrinks away when the rail
 * closes, and blurs back in on expand. The icons/rows themselves stay pinned in
 * place — only these label/badge slots animate — so nothing jumps to center.
 */
function Collapsible({ collapsed, children, className }: { collapsed: boolean; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "flex min-w-0 items-center overflow-hidden whitespace-nowrap transition-[max-width,opacity,filter] shell-sidebar-motion",
        // Expanded, the cap is the row itself: a fixed cap (it was 160px)
        // clipped any label wider than it, "Components and Blocks" included.
        collapsed ? "max-w-0 opacity-0 blur-[3px]" : "max-w-full opacity-100 blur-0",
        className,
      )}
    >
      {children}
    </span>
  );
}

function NavItem({
  icon: Icon,
  label,
  badge,
  badgeLabel,
  isSelected = false,
  collapsed = false,
  inset = false,
  href = "#",
  onClick,
}: {
  icon: IconComponent;
  label: string;
  badge?: ReactNode;
  badgeLabel?: string;
  isSelected?: boolean;
  collapsed?: boolean;
  /**
   * Inset rail: the row keeps its full width and horizontal padding while the
   * rail animates, so the icon is left-anchored instead of being re-centered
   * inside a shrinking row.
   */
  inset?: boolean;
  href?: string;
  /** Action rows (e.g. Settings → modal) intercept the navigation. */
  onClick?: () => void;
}) {
  const accessibleLabel = badgeLabel ? `${label}, ${badgeLabel}` : label;
  const content = (
    <>
      {/* Collapsed: drop the gap too — it still offsets the icon next to the
          zero-width (invisible) label, leaving the icon off-center. */}
      <span
        className={cn(
          "flex min-w-0 items-center gap-2",
          !collapsed && "flex-1",
          collapsed && "gap-0",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <Collapsible collapsed={collapsed} className="flex-1">
          <span className="truncate text-sm font-medium">{label}</span>
        </Collapsible>
      </span>
      {badge && (
        <Collapsible collapsed={collapsed} className="shrink-0">
          {badge}
        </Collapsible>
      )}
    </>
  );
  const className = cn(
    "flex h-8 w-full items-center justify-between gap-2 rounded-lg px-2",
    "text-sm font-medium text-muted-foreground",
    "transition-[background-color,color] shell-sidebar-motion",
    !isSelected &&
      "hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/60",
    // Selected state: the row stays foreground-coloured over a slightly
    // stronger fill than hover (8% light / 10% dark), and keeps that fill
    // while hovered.
    isSelected && "bg-sidebar-selected text-sidebar-foreground",
    collapsed && (inset ? "justify-start gap-0" : "w-9 justify-center gap-0 px-0"),
  );

  if (onClick) {
    return (
      <a
        href={href}
        onClick={(event) => {
          event.preventDefault();
          onClick();
        }}
        aria-current={isSelected ? "page" : undefined}
        aria-label={accessibleLabel}
        title={collapsed ? label : undefined}
        className={className}
      >
        {content}
      </a>
    );
  }

  // Internal routes use Next.js Link so dashboard navigation stays
  // client-side (instant navigation + prefetch). External links and
  // decoration-only rows (href="#") keep a plain anchor.
  if (href.startsWith("/") && !href.startsWith("//")) {
    return (
      <Link
        href={href}
        prefetch
        aria-current={isSelected ? "page" : undefined}
        aria-label={accessibleLabel}
        title={collapsed ? label : undefined}
        className={className}
      >
        {content}
      </Link>
    );
  }

  return (
    <a
      href={href}
      aria-current={isSelected ? "page" : undefined}
      aria-label={accessibleLabel}
      title={collapsed ? label : undefined}
      className={className}
    >
      {content}
    </a>
  );
}

/** A primary navigation row. Rows without an `href` are decoration only. */
export interface DashboardNavItem {
  key: string;
  label: string;
  icon: IconComponent;
  href?: string;
  badge?: string | number;
  /**
   * Screen-reader suffix for the badge (e.g. "4 unread"). The visible badge
   * is otherwise hidden from assistive tech because the row sets an explicit
   * `aria-label` from `label` alone.
   */
  badgeLabel?: string;
}

/**
 * A section of navigation rows. A missing/empty label renders the rows without
 * a section header (e.g. the standalone Home row).
 */
export interface DashboardNavGroup {
  label?: string;
  items: DashboardNavItem[];
}

/** Kept as a name for callers that typed their `selected` prop; any key works. */
export type DashboardNavKey = string;

function subscribeToPlatform() {
  return () => {};
}

function getShortcutHint() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? "⌘ K" : "Ctrl K";
}

function getServerShortcutHint() {
  return "Ctrl K";
}

/** The Pro dashboard's navigation, the default set. */
export const DASHBOARD_NAV: DashboardNavItem[] = [
  { key: "home", label: "Home", icon: Home, href: "/templates/dashboard", badge: 152 },
  { key: "marketing", label: "Marketing", icon: Megaphone, href: "/templates/marketing" },
  { key: "calendar", label: "Calendar", icon: Calendar, href: "/templates/calendar" },
  { key: "finance", label: "Finance", icon: Landmark, href: "/templates/finance" },
  { key: "medical", label: "Medical Report", icon: Asterisk, href: "/templates/medical-profile" },
  { key: "ai-chat", label: "AI Chat", icon: MessageCircle, href: "/templates/ai-chat" },
  { key: "ai-image", label: "AI Image Generation", icon: ImageIcon, href: "/templates/ai-image-generation" },
  { key: "profile", label: "Profile", icon: UserRound, href: "/templates/ai-profile" },
];

/**
 * The primary rows. A component of its own so the closures over `collapsed`
 * and the search query live here: built inline in the sidebar, the compiler
 * could not tell they leave `mobile` untouched and dropped the sidebar's
 * manual memoization.
 */
function NavRows({
  items,
  query,
  selected,
  collapsed,
  inset,
  secondaryMatch,
}: {
  items: DashboardNavItem[];
  query: string;
  selected: string;
  collapsed: boolean;
  inset: boolean;
  /** Whether Settings matches, so "No results" only shows when nothing does. */
  secondaryMatch: boolean;
}) {
  const shown = items.filter((item) => item.label.toLocaleLowerCase().includes(query));
  if (shown.length === 0 && !secondaryMatch && !collapsed) {
    return <p className="px-2 py-3 text-body-regular text-muted-foreground">No results</p>;
  }
  return shown.map((item) => {
      const isSelected = selected === item.key;
      return (
        <NavItem
          key={item.key}
          icon={item.icon}
          label={item.label}
          href={item.href}
          isSelected={isSelected}
          collapsed={collapsed}
          inset={inset}
          badge={
            item.badge !== undefined ? (
              <Badge color="neutral">{item.badge}</Badge>
            ) : undefined
          }
          badgeLabel={item.badgeLabel}
        />
      );
    });
}

function GroupedNavRows({
  groups,
  query,
  selected,
  collapsed,
  inset,
  secondaryMatch,
}: {
  groups: DashboardNavGroup[];
  query: string;
  selected: string;
  collapsed: boolean;
  inset: boolean;
  /** Whether Settings matches, so "No results" only shows when nothing does. */
  secondaryMatch: boolean;
}) {
  const filtered = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) =>
        item.label.toLocaleLowerCase().includes(query),
      ),
    }))
    .filter((group) => group.items.length > 0);
  if (filtered.length === 0 && !secondaryMatch && !collapsed) {
    return <p className="px-2 py-3 text-body-regular text-muted-foreground">No results</p>;
  }
  return filtered.map((group, groupIndex) => (
    <div
      key={group.label ?? `group-${groupIndex}`}
      className={cn("flex w-full flex-col gap-0.5", collapsed && "items-start")}
    >
      {group.label && !collapsed ? (
        <div className="mt-0.5 flex h-8 w-full items-center px-2 text-xs font-medium text-muted-foreground/70">
          <span className="truncate">{group.label}</span>
        </div>
      ) : null}
      {group.items.map((item) => {
        const isSelected = selected === item.key;
        return (
          <NavItem
            key={item.key}
            icon={item.icon}
            label={item.label}
            href={item.href}
            isSelected={isSelected}
            collapsed={collapsed}
            inset={inset}
            badge={
              item.badge !== undefined ? (
                <Badge color="neutral">{item.badge}</Badge>
              ) : undefined
            }
            badgeLabel={item.badgeLabel}
          />
        );
      })}
    </div>
  ));
}

export function DashboardSidebar({
  mobile = false,
  onClose,
  fluid = false,
  selected = "home",
  items = DASHBOARD_NAV,
  groups,
  flat = false,
  inset = false,
  className,
  topSlot,
  bottomSlot,
  settingsHref,
  hideSecondaryNav = false,
  onQuickSearch,
}: {
  /** Rendered inside the mobile drawer: always expanded, close button instead of collapse. */
  mobile?: boolean;
  onClose?: () => void;
  /** Expanded width fills its container below `lg` instead of the fixed
   *  264px rail (e.g. the landing page, where the sidebar isn't in a drawer).
   *  Collapsed width stays the fixed rail at every breakpoint — the whole
   *  point of collapsing is to shrink, so it must never get overridden back
   *  to full width. */
  fluid?: boolean;
  /** Which nav item shows the selected (filled) state. */
  selected?: DashboardNavKey;
  /** Primary navigation rows. The Pro dashboard's set unless a screen brings its own. */
  items?: DashboardNavItem[];
  /** Grouped navigation sections (e.g. User / Business / Other). Takes precedence over `items` when provided. */
  groups?: DashboardNavGroup[];
  /** Removes the floating panel treatment for a sidebar revealed beneath mobile content. */
  flat?: boolean;
  /**
   * Inset-app-shell rail: seamless frame background, 8px edge padding, and a
   * tight icon rail. The rail size is tuned here once; callers only place it.
   */
  inset?: boolean;
  className?: string;
  /** Replaces the demo business switcher at the top (e.g. with a business switcher). */
  topSlot?: ReactNode;
  /** Replaces the demo team card at the bottom (e.g. with the app user menu). */
  bottomSlot?: ReactNode;
  /** When provided, the Settings row links here instead of opening the demo SettingsModal. */
  settingsHref?: string;
  /** Hides the Settings row (e.g. inside the settings shell, which owns its own nav). */
  hideSecondaryNav?: boolean;
  /**
   * When provided, the Search row opens the global record search dialog
   * instead of filtering nav items.
   */
  onQuickSearch?: () => void;
} = {}) {
  const [collapsedState, setCollapsed] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [suppressUserHover, setSuppressUserHover] = useState(false);
  const [searchActive, setSearchActive] = useState(false);
  const [query, setQuery] = useState("");
  const shortcutHint = useSyncExternalStore(
    subscribeToPlatform,
    getShortcutHint,
    getServerShortcutHint,
  );
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const collapsed = mobile ? false : collapsedState;
  // The inset presentation belongs to the desktop shell; the mobile drawer
  // keeps the panel's padding and nav inset.
  const railInset = inset && !mobile;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (label: string) => label.toLocaleLowerCase().includes(normalizedQuery);
  const secondaryMatch = matches("Settings");

  const activateSearch = useCallback(() => {
    if (onQuickSearch) {
      onQuickSearch();
      return;
    }
    if (!mobile) setCollapsed(false);
    setSearchActive(true);
  }, [mobile, onQuickSearch]);

  const deactivateSearch = useCallback((restoreFocus: boolean) => {
    setQuery("");
    setSearchActive(false);
    if (restoreFocus) {
      window.requestAnimationFrame(() => searchTriggerRef.current?.focus());
    }
  }, []);

  useEffect(() => {
    if (!searchActive) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [searchActive]);

  useEffect(() => {
    if (!searchActive) return;

    const onOutsideClick = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && searchFieldRef.current?.contains(target)) return;
      deactivateSearch(false);
    };

    document.addEventListener("click", onOutsideClick);
    return () => document.removeEventListener("click", onOutsideClick);
  }, [deactivateSearch, searchActive]);

  useEffect(() => {
    // The main shell mounts the global command menu, which owns ⌘/Ctrl+K.
    // Settings and admin have no command menu, so their sidebar search takes it.
    if (onQuickSearch) return;

    const onShortcut = (event: KeyboardEvent) => {
      if (event.key.toLocaleLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        activateSearch();
      }
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [activateSearch, onQuickSearch]);

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "group/sidebar flex h-full shrink-0 flex-col overflow-hidden",
        flat
          ? "bg-background"
          : railInset
            ? // The inset shell uses one frame colour; the rail has no border,
              // panel fill, rounding, or shadow of its own.
              "bg-shell-frame"
            : // Flush to the screen's left edge: no left border or inset gap,
              // with rounding kept only on the top-right/bottom-right corners.
              // Depth comes from the sidebar surface + border + elevation shadow
              // (all flip in dark mode via CSS vars), matching the reference rail.
              "rounded-l-none rounded-r-3xl border border-l-0 border-sidebar-border bg-sidebar shadow-[var(--surface-shadow-md)]",
        "transition-[width] shell-sidebar-motion",
        collapsed
          ? railInset
            ? // 8px frame padding + the 36px icon column. Collapsed rows are
              // left-anchored (never re-centered) so icons hold their x while
              // the rail animates.
              "w-[3.25rem] p-2"
            : // Collapsed panel rail keeps the 60px spec: 1px border + 11px
              // padding on each side leaves an exactly 36px column.
              "w-[3.75rem] px-[0.6875rem] py-3"
          : mobile || fluid
            ? railInset
              ? "w-full p-2"
              : // The fullscreen mobile drawer keeps the same 8px inset as the
                // desktop rail so search, nav, and footer rows share one edge.
                "w-full p-2 lg:w-(--sidebar-rail-width)"
            : railInset
              ? "w-(--sidebar-rail-width) p-2"
              : "w-(--sidebar-rail-width) p-3",
        className,
      )}
    >
      {/* Pinned header: the business profile and search stay put while only
          the primary nav below scrolls. The rail supplies the 8px outer inset;
          the top slot owns its own inner 8px padding so its hover fill starts
          at the rail edge while labels still line up with the nav rows. */}
      <div className="flex w-full shrink-0 flex-col gap-1">
        <div
          className={cn(
            "flex w-full items-center gap-2",
            collapsed ? "flex-col justify-center" : "h-14",
          )}
        >
          <div
            className={cn(
              "min-w-0",
              collapsed ? "flex w-full justify-center" : "flex-1",
              // The built-in user menu has no inner padding of its own.
              !collapsed && !topSlot && "px-2",
            )}
          >
            {topSlot ? (
              <div className="w-full min-w-0">{topSlot}</div>
            ) : (
              <DashboardUserMenu
                collapsed={collapsed}
                suppressHover={suppressUserHover}
                onHoverSuppressionEnd={() => setSuppressUserHover(false)}
                avatarClassName={flat ? "bg-sidebar-accent" : undefined}
              />
            )}
          </div>
          {mobile ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Close sidebar"
              onClick={onClose}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" aria-hidden />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label="Toggle sidebar"
              aria-expanded={!collapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => {
                const isExpanding = collapsedState;
                if (!isExpanding) deactivateSearch(false);
                setCollapsed(!collapsedState);
                setSuppressUserHover(isExpanding);
              }}
              className={cn(
                "shrink-0 text-muted-foreground hover:text-foreground",
                collapsed && "size-9",
              )}
            >
              <PanelLeft className="size-4" aria-hidden />
            </Button>
          )}
        </div>

        {/* Quick search */}
        {!flat &&
          (searchActive && !collapsed ? (
            <div
              ref={searchFieldRef}
              className="flex h-8 w-full items-center gap-2 rounded-lg bg-sidebar-accent px-2 ring-2 ring-inset ring-sidebar-ring/40"
            >
              <Search
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Filter navigation"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    deactivateSearch(true);
                  }
                }}
                placeholder="Search navigation…"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
              />
              <CloseButton
                size="2xs"
                aria-label="Clear navigation search"
                onClick={() => deactivateSearch(true)}
                className="bg-sidebar-accent"
              />
            </div>
          ) : (
            <button
              ref={searchTriggerRef}
              type="button"
              aria-label="Search"
              title={collapsed ? "Search" : undefined}
              onClick={activateSearch}
              className={cn(
                "flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg bg-sidebar-accent px-2 text-muted-foreground",
                "transition-[background-color,color] shell-sidebar-motion hover:bg-sidebar-accent/70 hover:text-foreground",
                collapsed && "gap-0",
              )}
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <Collapsible collapsed={collapsed} className="flex-1">
                <span className="flex w-full min-w-0 items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">Search</span>
                  <span className="shrink-0 text-xs">{shortcutHint}</span>
                </span>
              </Collapsible>
            </button>
          ))}
      </div>

      {/* Primary nav scroller — the only scroll region in the rail. The
          header (switcher + search) above and the footer below stay pinned
          while this scrolls. `overflow-y: auto` forces the x axis to clip
          too, so padding moves the clip edge out and the matching negative
          margin borrows that space back from the rail's own padding,
          leaving every child exactly where it was (this keeps the selected
          item's 1px ring and focus rings unclipped). */}
      <div
        className="-mx-2 flex min-h-0 w-[calc(100%+1rem)] flex-1 flex-col overflow-y-auto px-2 py-2 [scrollbar-width:none]"
      >
        {/* Primary nav. Rows span the scroller width in every presentation,
            so their icons line up with the search row above; collapsed rows
            stay left-anchored instead of re-centering. */}
        <nav
          aria-label="Primary"
          className={cn(
            "flex w-full flex-col gap-0.5",
            collapsed && "items-start",
          )}
        >
          {groups && groups.length > 0 ? (
            <GroupedNavRows
              groups={groups}
              query={normalizedQuery}
              selected={selected}
              collapsed={collapsed}
              inset={railInset}
              secondaryMatch={secondaryMatch}
            />
          ) : (
            <NavRows
              items={items}
              query={normalizedQuery}
              selected={selected}
              collapsed={collapsed}
              inset={railInset}
              secondaryMatch={secondaryMatch}
            />
          )}
        </nav>
      </div>

      <div
        className={cn(
          "mt-auto flex w-full shrink-0 flex-col gap-2",
          collapsed && "items-start",
        )}
      >
        {/* Settings stays pinned to the bottom of the nav column. */}
        {hideSecondaryNav ? null : (
          <nav
            className={cn(
              "flex w-full flex-col gap-1",
              collapsed && "items-start",
            )}
          >
            {matches("Settings") &&
              (settingsHref ? (
                <NavItem
                  icon={Settings}
                  label="Settings"
                  collapsed={collapsed}
                  inset={railInset}
                  href={settingsHref}
                />
              ) : (
                <NavItem
                  icon={Settings}
                  label="Settings"
                  collapsed={collapsed}
                  inset={railInset}
                  onClick={() => setSettingsOpen(true)}
                />
              ))}
          </nav>
        )}

        {/* Team card → opens the profile menu next to the sidebar. Stays
            mounted when collapsed: expanded-only rows hide via
            `group-data-[collapsed=true]/sidebar`, avatar-only collapsed
            triggers do the reverse. */}
        {bottomSlot ? (
          <div
            className={cn(
              "w-full min-w-0",
              collapsed && "flex w-9 justify-center",
            )}
          >
            {bottomSlot}
          </div>
        ) : (
          <div className="flex w-full flex-col gap-2">
            <div
              aria-hidden="true"
              className="w-full border-t border-sidebar-border group-data-[collapsed=true]/sidebar:hidden"
            />
            <DashboardTeamMenu
              collapsed={collapsed}
              className={flat ? "!bg-sidebar-accent" : undefined}
            />
          </div>
        )}
      </div>

      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        planArtSrc="/templates/settings-plan-art.png"
      />
    </aside>
  );
}
