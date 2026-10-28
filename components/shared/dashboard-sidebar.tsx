"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import {
  RiAsterisk,
  RiBankLine,
  RiCalendarLine,
  RiChatAiLine,
  RiCloseLine,
  RiCustomerServiceLine,
  RiHomeLine,
  RiImageAiLine,
  RiMegaphoneLine,
  RiSearchLine,
  RiSettings4Line,
  RiSideBarFill,
  RiUserSmileLine,
} from "@remixicon/react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SettingsModal } from "./settings-modal";
import { ThemeToggle } from "./theme-toggle";
import { Badge } from "@/components/shared/badge";
import { CloseButton } from "@/components/shared/close-button";
import { DashboardTeamMenu } from "./dashboard-team-menu";
import { DashboardUserMenu } from "./dashboard-user-menu";

/**
 * Collapsible navigation panel with two presentations:
 *
 * - Panel (default): expanded 232px wide with p 12, radius/3xl (24px), a white
 *   1px border, elevation shadow, and secondary bg; collapsed 60px wide
 *   (36px icon items + 12px padding).
 * - Inset (`inset`): a seamless rail on the shell frame with a constant 8px
 *   padding. Expanded 232px, collapsed 52px (8px padding + a 36px icon
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
      <span className={cn("flex min-w-0 items-center gap-2", collapsed && "gap-0")}>
        <Icon
          className={cn("size-4.5 shrink-0", isSelected ? "text-sidebar-foreground" : "text-muted-foreground")}
          aria-hidden
        />
        <Collapsible collapsed={collapsed}>
          <span
            className={cn(
              "whitespace-nowrap text-sm leading-6 font-medium",
              isSelected ? "text-sidebar-foreground" : "text-muted-foreground",
            )}
          >
            {label}
          </span>
        </Collapsible>
      </span>
      {badge && <Collapsible collapsed={collapsed}>{badge}</Collapsible>}
    </>
  );
  const className = cn(
    "flex items-center justify-between gap-2 overflow-hidden rounded-md px-2 py-1.5",
    "transition-[width,background-color] shell-sidebar-motion",
    collapsed
      ? inset
        ? "w-full justify-start gap-0"
        : "w-9 justify-center gap-0 px-0"
      : "w-full",
    // Selected state mirrors the previous Requo sidebar: muted text that
    // turns sidebar-foreground on hover/select, with a quiet black/8
    // (white/10 in dark mode) pill behind the active row.
    "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground",
    isSelected && "bg-sidebar-selected font-medium text-sidebar-foreground",
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

/** A labeled section of navigation rows (e.g. User / Business / Other). */
export interface DashboardNavGroup {
  label: string;
  items: DashboardNavItem[];
}

/** Kept as a name for callers that typed their `selected` prop; any key works. */
export type DashboardNavKey = string;

/** The Pro dashboard's navigation, the default set. */
export const DASHBOARD_NAV: DashboardNavItem[] = [
  { key: "home", label: "Home", icon: RiHomeLine, href: "/templates/dashboard", badge: 152 },
  { key: "marketing", label: "Marketing", icon: RiMegaphoneLine, href: "/templates/marketing" },
  { key: "calendar", label: "Calendar", icon: RiCalendarLine, href: "/templates/calendar" },
  { key: "finance", label: "Finance", icon: RiBankLine, href: "/templates/finance" },
  { key: "medical", label: "Medical Report", icon: RiAsterisk, href: "/templates/medical-profile" },
  { key: "ai-chat", label: "AI Chat", icon: RiChatAiLine, href: "/templates/ai-chat" },
  { key: "ai-image", label: "AI Image Generation", icon: RiImageAiLine, href: "/templates/ai-image-generation" },
  { key: "profile", label: "Profile", icon: RiUserSmileLine, href: "/templates/ai-profile" },
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
  /** Whether Support or Settings matches, so "No results" only shows when nothing does. */
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
  /** Whether Support or Settings matches, so "No results" only shows when nothing does. */
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
  return filtered.map((group) => (
    <div key={group.label} className={cn("flex w-full flex-col gap-1", collapsed && "items-start")}>
      <div
        className={cn(
          "overflow-hidden whitespace-nowrap transition-[max-height,opacity] shell-sidebar-motion",
          collapsed ? "max-h-0 opacity-0" : "max-h-8 opacity-100",
        )}
      >
        <span className="block px-2 pt-2 text-body-2-medium text-muted-foreground/60">
          {group.label}
        </span>
      </div>
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
  showThemeToggle = true,
  selected = "home",
  items = DASHBOARD_NAV,
  groups,
  flat = false,
  inset = false,
  className,
  topSlot,
  bottomSlot,
  settingsHref,
  supportHref,
  hideSecondaryNav = false,
  onQuickSearch,
}: {
  /** Rendered inside the mobile drawer: always expanded, close button instead of collapse. */
  mobile?: boolean;
  onClose?: () => void;
  /** Expanded width fills its container below `lg` instead of the fixed
   *  232px (e.g. the landing page, where the sidebar isn't in a drawer).
   *  Collapsed width stays the fixed rail at every breakpoint — the whole
   *  point of collapsing is to shrink, so it must never get overridden back
   *  to full width. */
  fluid?: boolean;
  /** Hide the app-level theme control when the sidebar is used as marketing artwork. */
  showThemeToggle?: boolean;
  /** Which nav item shows the selected (filled blue) state. */
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
  /** When provided, the Settings secondary row links here instead of opening the demo SettingsModal. */
  settingsHref?: string;
  /** When provided, the Support secondary row links here (otherwise it stays decorative). */
  supportHref?: string;
  /** Hides the demo Support/Settings secondary rows (e.g. inside the settings shell, which owns its own nav). */
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
  const searchTriggerRef = useRef<HTMLButtonElement>(null);
  const searchFieldRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const collapsed = mobile ? false : collapsedState;
  // The inset presentation belongs to the desktop shell; the mobile drawer
  // keeps the panel's padding and nav inset.
  const railInset = inset && !mobile;
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = (label: string) => label.toLocaleLowerCase().includes(normalizedQuery);
  const secondaryLabels = ["Support", "Settings"];
  const secondaryMatch = secondaryLabels.some(matches);

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
    const onShortcut = (event: KeyboardEvent) => {
      if (event.key.toLocaleLowerCase() === "l" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        activateSearch();
      }
    };

    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, [activateSearch]);

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
              : "w-full p-3 lg:w-[14.5rem]"
            : railInset
              ? "w-[14.5rem] p-2"
              : "w-[14.5rem] p-3",
        className,
      )}
    >
      {/* Pinned header: the business switcher and search stay put while
          only the primary nav below scrolls. Horizontal bleed (`-mx-2` +
          `w-[calc(100%+1rem)]` + `px-2`) matches the nav scroller so all rows
          align; no vertical negative margin here so it never overlaps the
          scroller. */}
      <div
        className="-mx-2 flex w-[calc(100%+1rem)] shrink-0 flex-col gap-3 px-2 pt-2 pb-1"
      >
        {/* Business switcher / collapse control */}
        <div
          className={cn(
            "flex w-full transition-[gap] shell-sidebar-motion",
            collapsed
              ? "flex-col-reverse items-start justify-center gap-2.5"
              : "flex-row items-center justify-between",
          )}
        >
          {/* The clip is here to hide the label as `max-width` animates shut,
              but it also cropped the trigger's hover pill down to four corner
              arcs. Same trick as the scroller: pad the clip box out by the
              pill's 8px reach and pull it back with a negative margin, so the
              widths below are 16px larger than the footprint they produce. */}
          <div
            className={cn(
              "min-w-0 transition-[max-width,opacity,transform,scale] shell-sidebar-motion",
              // Collapsed: the slot stays mounted in a centered 36px column.
              // Expanded-only rows hide themselves via
              // `group-data-[collapsed=true]/sidebar` (the aside carries
              // `group/sidebar` + `data-collapsed`); avatar-only collapsed
              // triggers do the reverse. Never `hidden` here — that would
              // remove the collapsed business avatar too.
              collapsed
                ? "flex w-9 items-center justify-center"
                : // `flex-1` fixes the slot to the full header width so the
                  // trigger never resizes with the business name length — long
                  // names truncate instead. The desktop expanded rail caps it
                  // to its rail footprint; the full-width mobile drawer keeps
                  // the whole row, so the switcher matches search and nav.
                  "-m-2 min-w-0 flex-1 overflow-hidden p-2",
              !collapsed &&
                (mobile && flat && searchActive
                  ? "max-w-0 scale-95 opacity-0"
                  : mobile
                    ? "max-w-none scale-100 opacity-100"
                    : "max-w-[12.875rem] scale-100 opacity-100"),
            )}
          >
            {topSlot ? (
              <div className="w-full min-w-0">{topSlot}</div>
            ) : (
              <DashboardUserMenu
                collapsed={collapsed}
                suppressHover={suppressUserHover}
                onHoverSuppressionEnd={() => setSuppressUserHover(false)}
                avatarClassName={
                  flat
                    ? "bg-sidebar-accent"
                    : undefined
                }
              />
            )}
          </div>
          {mobile && flat ? (
            <div
              ref={searchFieldRef}
              className={cn(
                "flex h-9 items-center overflow-hidden rounded-full bg-sidebar-accent transition-[width,box-shadow] shell-sidebar-motion",
                searchActive
                  ? "w-full gap-2 pr-2.5 pl-2 ring-2 ring-inset ring-sidebar-ring"
                  : "w-9 gap-0 px-2",
              )}
            >
              <button
                ref={searchTriggerRef}
                type="button"
                aria-label="Search"
                onClick={activateSearch}
                className="flex size-5 shrink-0 cursor-pointer items-center justify-center text-muted-foreground"
              >
                <RiSearchLine className="size-5" aria-hidden />
              </button>
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Filter template navigation"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    deactivateSearch(true);
                  }
                }}
                placeholder="Search..."
                tabIndex={searchActive ? 0 : -1}
                className={cn(
                  "min-w-0 bg-transparent text-body-medium tracking-[-0.015em] text-foreground outline-none placeholder:text-muted-foreground",
                  "transition-[width,opacity] [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)]",
                  searchActive
                    ? "w-full flex-1 opacity-100 delay-100"
                    : "pointer-events-none w-0 flex-none opacity-0 delay-0",
                )}
              />
              <CloseButton
                size="2xs"
                aria-label="Clear navigation search"
                onClick={() => deactivateSearch(true)}
                className={cn(
                  "motion-transition shrink-0 bg-sidebar-accent",
                  searchActive ? "opacity-100 delay-150" : "pointer-events-none opacity-0 delay-0",
                )}
              />
            </div>
          ) : mobile ? (
            <button
              type="button"
              aria-label="Close sidebar"
              onClick={onClose}
              className="cursor-pointer text-muted-foreground"
            >
              <RiCloseLine className="size-5" aria-hidden />
            </button>
          ) : (
            <button
              type="button"
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              aria-expanded={!collapsed}
              onClick={() => {
                const isExpanding = collapsedState;
                if (!isExpanding) deactivateSearch(false);
                setCollapsed(!collapsedState);
                setSuppressUserHover(isExpanding);
              }}
              className={cn(
                "cursor-pointer text-muted-foreground",
                collapsed && "flex w-9 items-center justify-center",
              )}
            >
              <RiSideBarFill
                className={cn("motion-icon-swap size-5", !collapsed && "-scale-x-100")}
                aria-hidden
              />
            </button>
          )}
        </div>

        <div className={cn("flex w-full flex-col gap-3", collapsed && "items-start")}>
          {/* Quick search */}
          {!flat && (searchActive && !collapsed ? (
            <div
              ref={searchFieldRef}
              className="motion-transition flex w-full items-center gap-2 rounded-full bg-sidebar-accent py-2 pr-2.5 pl-2 ring-2 ring-inset ring-sidebar-ring"
            >
              <RiSearchLine className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              <input
                ref={searchInputRef}
                type="search"
                aria-label="Filter template navigation"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    deactivateSearch(true);
                  }
                }}
                placeholder="Search navigation…"
                className="min-w-0 flex-1 bg-transparent text-body-medium text-foreground outline-none placeholder:text-muted-foreground"
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
                "flex w-full cursor-pointer items-center gap-2 rounded-full bg-sidebar-accent px-2 py-1.5 hover:bg-sidebar-accent/70",
                "transition-[width,border-radius,background-color] shell-sidebar-motion",
                collapsed &&
                  (railInset
                    ? // Keep the same 8px inset so the icon does not slide as
                      // the rail narrows; the parent supplies the 36px width.
                      "justify-start gap-0 p-2"
                    : "size-9 justify-center gap-0 p-0"),
              )}
            >
              <span
                className={cn(
                  "flex min-w-0 items-center gap-2",
                  collapsed ? "gap-0" : "flex-1",
                )}
              >
                <RiSearchLine className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <Collapsible collapsed={collapsed}>
                  <span className="whitespace-nowrap text-sm leading-6 font-medium text-muted-foreground">
                    Search
                  </span>
                </Collapsible>
              </span>
            </button>
          ))}
        </div>
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
          {/* Primary nav. The 2px inset applies to the panel rail's expanded
              state only: its collapsed column is exactly as wide as a 36px
              item, so extra padding would push every item right and the panel
              clip would shave the selected fill. The inset rail instead keeps
              rows at `w-full` and left-anchors their content, so no per-state
              padding is needed. */}
          <nav
            aria-label="Primary"
            className={cn(
              "flex w-full flex-col gap-1",
              collapsed ? "items-start" : !railInset && "px-0.5",
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

      <div className={cn("flex w-full shrink-0 flex-col gap-3", collapsed && "items-start")}>
        {showThemeToggle &&
          (collapsed ? (
            <ThemeToggle collapsed />
          ) : (
            <ThemeToggle
              appearance="sidebar-segmented"
              className={flat ? "!bg-sidebar-accent" : undefined}
            />
          ))}
        {/* Secondary nav */}
        {hideSecondaryNav ? null : (
          <nav className={cn("flex w-full flex-col gap-1", collapsed && "items-start")}>
            {matches("Support") && (
              <NavItem
                icon={RiCustomerServiceLine}
                label="Support"
                collapsed={collapsed}
                inset={railInset}
                href={supportHref}
              />
            )}
            {matches("Settings") &&
              (settingsHref ? (
                <NavItem
                  icon={RiSettings4Line}
                  label="Settings"
                  collapsed={collapsed}
                  inset={railInset}
                  href={settingsHref}
                />
              ) : (
                <NavItem
                  icon={RiSettings4Line}
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
          <div className={cn("w-full min-w-0", collapsed && "flex w-9 justify-center")}>
            {bottomSlot}
          </div>
        ) : (
          <DashboardTeamMenu
            collapsed={collapsed}
            className={flat ? "!bg-sidebar-accent" : undefined}
          />
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
