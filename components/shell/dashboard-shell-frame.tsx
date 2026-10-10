"use client";

import dynamic from "next/dynamic";

import { type ReactNode, useMemo, useState } from "react";
import { Home as HomeIcon } from "lucide-react";
import { usePathname } from "next/navigation";

import { BoarduiMainSidebar } from "@/components/shell/boardui-main-sidebar";
import {
  getActiveDashboardNavigationItem,
  getDashboardBreadcrumbs,
} from "@/components/shell/dashboard-navigation";
import { NavBadgeProvider } from "@/components/shell/nav-badge-context";
import {
  Breadcrumb,
  BreadcrumbItem,
} from "@/components/shared/breadcrumb";
import { MobileFloatingDock } from "@/components/shell/mobile-floating-dock";
import { MobileFullscreenNav } from "@/components/shell/mobile-fullscreen-nav";
import { MobileGlobalSearch } from "@/components/shell/mobile-global-search";
import { MobileHeaderSlotProvider } from "@/components/shell/mobile-header-slot";
import { SidebarProvider } from "@/components/ui/sidebar";
import { getBusinessAssistantPath } from "@/features/businesses/routes";
import { getUnifiedSettingsNavigation } from "@/features/settings/navigation";
import type { BusinessMemberRole } from "@/lib/business-members";

import { MobileTopBar } from "@/components/shell/mobile-top-bar";

const CommandMenu = dynamic(
  () =>
    import("@/components/shell/command-menu").then(
      (module) => module.CommandMenu,
    ),
  {
    loading: () => null,
  },
);

export type DashboardShellFrameProps = {
  children: ReactNode;
  /** Business slug from URL params — available synchronously. */
  businessSlug: string;
  /**
   * Role used for role-gated mobile items. The structural shell renders
   * instantly from the slug alone, so it defaults to the owner set — route
   * access itself is still enforced server-side.
   */
  role?: BusinessMemberRole;
  /** Streamed business switcher slot (Suspense-wrapped). */
  businessSwitcherSlot: ReactNode;
  /** Streamed user menu slot (Suspense-wrapped). */
  userMenuSlot: ReactNode;
  /** Streamed notification bell slot (Suspense-wrapped). */
  notificationSlot: ReactNode;
  /** Streamed upgrade button slot (Suspense-wrapped). */
  upgradeSlot: ReactNode;
  /** Streamed mobile top bar business switcher slot. */
  mobileBusinessSwitcherSlot?: ReactNode;
  /** Streamed getting started checklist for the sidebar. */
  checklistSlot?: ReactNode;
  /** Streamed theme sync slot (Suspense-wrapped). */
  themeSyncSlot?: ReactNode;
  /** Streamed banner slot below the top nav. */
  bannerSlot?: ReactNode;
  /** Streamed nav-badge sync slot (e.g. unread inquiry count). */
  navBadgeSlot?: ReactNode;
};

/**
 * Structural dashboard shell that renders instantly without awaiting data.
 *
 * The sidebar follows the BoardUI docs usage example: `BoarduiMainSidebar`
 * maps Requo navigation onto BoardUI's `DashboardSidebar` (`items` +
 * `selected`) inside a `flex min-h-screen bg-background` layout. The
 * business switcher, checklist, and user menu stream in as BoardUI sidebar
 * slots; the topbar, breadcrumbs, and mobile navigation stay Requo-owned.
 *
 * On mobile the shell shows a two-row top bar (bell left, section strip
 * below) plus a floating 3-action dock: Home always opens the fullscreen
 * main navigation, Search opens fullscreen global record search, and
 * Settings opens the fullscreen settings navigation. The user profile menu
 * lives at the bottom of the sidebars instead of the dock.
 *
 * Data-dependent sections stream in via Suspense boundaries from the server
 * layout, so users see the real shell chrome immediately. Role restrictions
 * are enforced server-side on the actual routes regardless.
 *
 * `SidebarProvider` is kept (without shadcn `Sidebar` chrome) because the
 * streamed business switcher / user menu slots consume its sidebar context
 * (`useSidebar` for mobile-drawer dismissal).
 */
export function DashboardShellFrame({
  children,
  businessSlug,
  role = "owner",
  businessSwitcherSlot,
  userMenuSlot,
  notificationSlot,
  upgradeSlot: _upgradeSlot,
  mobileBusinessSwitcherSlot,
  checklistSlot,
  themeSyncSlot,
  bannerSlot,
  navBadgeSlot,
}: DashboardShellFrameProps) {
  const pathname = usePathname();
  const [commandOpen, setCommandOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [settingsNavOpen, setSettingsNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const breadcrumbs = useMemo(() => getDashboardBreadcrumbs(pathname), [pathname]);
  const settingsGroups = useMemo(
    () => getUnifiedSettingsNavigation(businessSlug),
    [businessSlug],
  );

  const sidebarBottomSlot = (
    <div className="flex w-full flex-col gap-2 group-data-[collapsed=true]/sidebar:items-center group-data-[collapsed=true]/sidebar:gap-0">
      {checklistSlot ? (
        <div className="w-full group-data-[collapsed=true]/sidebar:hidden">
          {checklistSlot}
        </div>
      ) : null}
      {userMenuSlot}
    </div>
  );

  const currentPageLabel = breadcrumbs.at(-1)?.label ?? "Home";
  const assistantPath = getBusinessAssistantPath(businessSlug);
  const isAssistantPaneRoute =
    pathname === assistantPath || pathname.startsWith(`${assistantPath}/chat/`);
  const activeNavItem = getActiveDashboardNavigationItem(pathname);
  const ActiveIcon = activeNavItem?.icon ?? HomeIcon;

  return (
    <SidebarProvider defaultOpen>
      {themeSyncSlot}
      <NavBadgeProvider>
      {navBadgeSlot}
      <div className="flex min-h-svh flex-1 bg-background transition-[padding-left] duration-300 ease-in-out lg:pl-[14.5rem] lg:has-[aside[data-collapsed=true]]:pl-[3.75rem]">
        {/* Desktop sidebar — fixed BoardUI panel flush to the left screen edge (hidden below lg; mobile uses the top bar + floating dock). Fixed, not sticky: sticky rails ride up over the last pixels of long pages whenever the viewport shrinks below `h-svh` (e.g. a horizontal scrollbar), while a fixed rail never moves. This row reserves the rail width via padding, tracking the collapsed rail through the aside's `data-collapsed` flag. */}
        <div className="fixed inset-y-0 left-0 z-40 hidden lg:block">
          <BoarduiMainSidebar
            businessSlug={businessSlug}
            role={role}
            topSlot={businessSwitcherSlot}
            bottomSlot={sidebarBottomSlot}
            onQuickSearch={() => setCommandOpen(true)}
          />
        </div>

        <div
          className="flex min-w-0 flex-1 flex-col"
          data-assistant-route={isAssistantPaneRoute || undefined}
          data-slot="sidebar-inset"
        >
          <MobileHeaderSlotProvider>
          {/* Mobile top app bar (below lg) */}
          <MobileTopBar
            businessControl={mobileBusinessSwitcherSlot}
            pageTitle={currentPageLabel}
            notificationSlot={notificationSlot}
          />

          {/* Desktop Topbar row (lg and above) */}
          <div className="sticky top-0 z-30 hidden h-12 items-stretch bg-background lg:flex">
            <header className="flex min-w-0 flex-1 items-center">
              <div className="dashboard-topbar-inner min-w-0 flex-1">
                <div className="flex min-h-9 min-w-0 items-center gap-2 md:gap-2.5">
                  <div className="min-w-0 flex-1">
                    <Breadcrumb aria-label="Pages">
                      {breadcrumbs.map((item, index) => {
                        const isLast = index === breadcrumbs.length - 1;

                    if (isLast || !item.href) {
                      return (
                        <BreadcrumbItem
                          key={`${item.label}-${item.href ?? index}`}
                          current
                          icon={ActiveIcon}
                          className="text-sm font-normal text-foreground"
                        >
                          {item.label}
                        </BreadcrumbItem>
                      );
                    }

                    return (
                      <BreadcrumbItem
                        key={`${item.label}-${item.href ?? index}`}
                        href={item.href}
                        className="text-sm text-muted-foreground hover:bg-transparent hover:text-foreground"
                      >
                        {item.label}
                      </BreadcrumbItem>
                    );
                      })}
                    </Breadcrumb>
                  </div>
                  <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 md:min-w-0 md:flex-initial md:justify-start">
                    {notificationSlot}
                  </div>
                </div>
              </div>
            </header>
          </div>
          {bannerSlot}

          {/* Content */}
          <div className="min-w-0 flex-1 pb-28 lg:pb-0" data-slot="dashboard-scroll-area">
            <main className="dashboard-main">
              <div className="dashboard-content">{children}</div>
            </main>
          </div>

          {/* Mobile floating dock + fullscreen overlays */}
          <MobileFloatingDock
            navOpen={navOpen}
            settingsOpen={settingsNavOpen}
            searchOpen={searchOpen}
            onHomeClick={() => {
              setSearchOpen(false);
              setSettingsNavOpen(false);
              setNavOpen((current) => !current);
            }}
            onSearchClick={() => {
              setNavOpen(false);
              setSettingsNavOpen(false);
              setSearchOpen((current) => !current);
            }}
            onSettingsClick={() => {
              setNavOpen(false);
              setSearchOpen(false);
              setSettingsNavOpen((current) => !current);
            }}
          />
          <MobileFullscreenNav
            open={navOpen}
            onOpenChange={setNavOpen}
            businessSlug={businessSlug}
            role={role}
            variant="main"
            topSlot={businessSwitcherSlot}
            bottomSlot={sidebarBottomSlot}
            onQuickSearch={() => setCommandOpen(true)}
          />
          <MobileFullscreenNav
            open={settingsNavOpen}
            onOpenChange={setSettingsNavOpen}
            businessSlug={businessSlug}
            variant="settings"
            groups={settingsGroups}
            topSlot={businessSwitcherSlot}
            bottomSlot={sidebarBottomSlot}
          />
          <MobileGlobalSearch
            open={searchOpen}
            onOpenChange={setSearchOpen}
            businessSlug={businessSlug}
          />
          </MobileHeaderSlotProvider>
        </div>
      </div>
      </NavBadgeProvider>
      {/* Global record search dialog — opened from the sidebar Search. */}
      <CommandMenu
        businessSlug={businessSlug}
        open={commandOpen}
        onOpenChange={setCommandOpen}
        hideTrigger
      />
    </SidebarProvider>
  );
}
