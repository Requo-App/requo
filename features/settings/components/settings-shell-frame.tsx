"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState, useTransition } from "react";
import {
  ArrowLeft,
  Astroid,
  Bell,
  BookOpen,
  Building2,
  FileText,
  Home as HomeIcon,
  LifeBuoy,
  LogOut,
  Mail,
  Palette,
  Receipt,
  ScrollText,
  Tag,
  User,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { authClient } from "@/lib/auth/client";
import { getDisplayFirstName } from "@/features/account/name";
import { ChevronDownSmall } from "@/components/shared/chevrons";
import { AppearanceMenuSubmenu } from "@/features/theme/components/appearance-menu";
import { clearPersistedThemePreference } from "@/features/theme/persistence";
import { themeUserStorageKey } from "@/features/theme/types";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  useSidebar,
} from "@/components/ui/sidebar";
import { Spinner } from "@/components/ui/spinner";
import { BoarduiSettingsSidebar } from "@/features/settings/components/boardui-settings-sidebar";
import { getBusinessHomePath } from "@/features/businesses/routes";
import {
  Breadcrumb,
  BreadcrumbItem,
} from "@/components/shared/breadcrumb";
import { getDashboardBreadcrumbs } from "@/components/shell/dashboard-navigation";
import { MobileFloatingDock } from "@/components/shell/mobile-floating-dock";
import { MobileFullscreenNav } from "@/components/shell/mobile-fullscreen-nav";
import { MobileGlobalSearch } from "@/components/shell/mobile-global-search";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import type { SettingsNavigationGroup } from "@/features/settings/navigation";

export const settingsIcons: Record<string, LucideIcon> = {
  user: User,
  palette: Palette,
  bell: Bell,
  building: Building2,
  astroid: Astroid,
  users: Users,
  receipt: Receipt,
  "file-text": FileText,
  mail: Mail,
  tag: Tag,
  book: BookOpen,
  "life-buoy": LifeBuoy,
  scroll: ScrollText,
};

export type SettingsUserData = {
  id: string;
  name: string;
  email: string;
  avatarSrc: string | null;
};

export type SettingsShellFrameProps = {
  children: ReactNode;
  businessSlug: string;
  groups: SettingsNavigationGroup[];
  user?: SettingsUserData;
  userMenuSlot?: ReactNode;
  /** Streamed business switcher slot (same compact switcher as the main sidebar). */
  businessSwitcherSlot: ReactNode;
  /** Streamed mobile top bar business switcher slot. */
  mobileBusinessSwitcherSlot?: ReactNode;
};

/**
 * Settings shell frame using the BoardUI Sidebar.
 *
 * `BoarduiSettingsSidebar` maps the grouped settings navigation onto
 * BoardUI's `DashboardSidebar` (`groups` + `selected`) as a seamless rail on
 * the shell frame, following the docs usage example. The main area is an
 * inset card with constant top/right/bottom gaps and its own scroll
 * container. The business switcher streams in as the top slot (same compact
 * switcher as the main sidebar); the user menu streams in as the bottom
 * slot. Help & Support lives in the Other navigation group.
 *
 * `SidebarProvider` is kept (without shadcn `Sidebar` chrome) because the
 * streamed business switcher / user menu slots consume its sidebar context
 * (`useSidebar` for mobile-drawer dismissal).
 */
export function SettingsShellFrame({
  children,
  businessSlug,
  groups,
  user,
  userMenuSlot,
  businessSwitcherSlot,
  mobileBusinessSwitcherSlot,
}: SettingsShellFrameProps) {
  const businessHomePath = getBusinessHomePath(businessSlug);
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);
  const [mainNavOpen, setMainNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const breadcrumbs = useMemo(
    () => getDashboardBreadcrumbs(pathname),
    [pathname],
  );
  const currentSectionLabel = breadcrumbs.at(-1)?.label ?? "Settings";
  const sidebarBottomSlot =
    userMenuSlot ??
    (user ? (
      <SettingsUserMenu user={user} businessSlug={businessSlug} />
    ) : null);

  return (
    <SidebarProvider defaultOpen>
      <div
        className="flex h-svh min-w-0 flex-1 overflow-hidden bg-shell-frame"
        data-shell-root
      >
        {/* Desktop sidebar — a seamless rail in the shell frame (hidden below lg; mobile uses the top/bottom bars). */}
        <div className="hidden h-full shrink-0 lg:block">
          <BoarduiSettingsSidebar
            businessSlug={businessSlug}
            groups={groups}
            topSlot={businessSwitcherSlot}
            bottomSlot={sidebarBottomSlot}
          />
        </div>

        {/* Inset content card; edge-to-edge below lg. */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-0 lg:p-2 lg:pl-0">
          <div
            className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-shell-card lg:rounded-xl lg:border lg:border-border lg:shadow-sm"
            data-slot="sidebar-inset"
          >
            {/* Mobile top app bar (below lg) */}
            <MobileTopBar
              businessControl={mobileBusinessSwitcherSlot}
              pageTitle={currentSectionLabel}
            />

            {/* Desktop topbar (lg and above) */}
            <div className="relative z-30 hidden h-12 shrink-0 items-stretch bg-transparent lg:flex">
              <header className="flex min-w-0 flex-1 items-center">
                <div className="dashboard-topbar-inner min-w-0 flex-1">
                  <div className="flex min-h-9 min-w-0 items-center gap-2 md:gap-2.5">
                    <Button
                      asChild
                      variant="ghost"
                      size="icon-sm"
                      className="hidden size-8 shrink-0 lg:inline-flex"
                    >
                      <Link href={businessHomePath} aria-label="Home">
                        <HomeIcon className="size-4" />
                      </Link>
                    </Button>
                    <span
                      aria-hidden="true"
                      className="hidden h-3.5 w-px shrink-0 self-center bg-border lg:block"
                    />
                    <div className="min-w-0 flex-1">
                      <Breadcrumb aria-label="Pages">
                        {breadcrumbs.map((item, index) => {
                          const isLast = index === breadcrumbs.length - 1;

                          if (isLast || !item.href) {
                            return (
                              <BreadcrumbItem
                                key={`${item.label}-${item.href ?? index}`}
                                current
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
                  </div>
                </div>
              </header>
            </div>

            <div
              className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-28 lg:pb-0"
              data-shell-scroll
              data-slot="dashboard-scroll-area"
            >
              <main className="dashboard-main">
                <div className="dashboard-content dashboard-page px-1 sm:px-0">{children}</div>
              </main>
            </div>

            {/* Mobile floating dock + fullscreen navs + global search.
                Home always opens the main navigation, Settings opens the
                settings navigation. */}
            <MobileFloatingDock
              navOpen={mainNavOpen}
              settingsOpen={navOpen}
              searchOpen={searchOpen}
              onHomeClick={() => {
                setSearchOpen(false);
                setNavOpen(false);
                setMainNavOpen((current) => !current);
              }}
              onSearchClick={() => {
                setNavOpen(false);
                setMainNavOpen(false);
                setSearchOpen((current) => !current);
              }}
              onSettingsClick={() => {
                setMainNavOpen(false);
                setSearchOpen(false);
                setNavOpen((current) => !current);
              }}
            />
            <MobileFullscreenNav
              open={mainNavOpen}
              onOpenChange={setMainNavOpen}
              businessSlug={businessSlug}
              variant="main"
              topSlot={businessSwitcherSlot}
              bottomSlot={sidebarBottomSlot}
            />
            <MobileFullscreenNav
              open={navOpen}
              onOpenChange={setNavOpen}
              businessSlug={businessSlug}
              variant="settings"
              groups={groups}
              topSlot={businessSwitcherSlot}
              bottomSlot={sidebarBottomSlot}
            />
            <MobileGlobalSearch
              open={searchOpen}
              onOpenChange={setSearchOpen}
              businessSlug={businessSlug}
            />
          </div>
        </div>
      </div>
    </SidebarProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Internal components                                                        */
/* -------------------------------------------------------------------------- */

export function SettingsUserMenu({ user, businessSlug }: { user: SettingsUserData; businessSlug: string }) {
  const [isPending, startTransition] = useTransition();
  const { isMobile, setOpenMobile } = useSidebar();
  const businessHomePath = getBusinessHomePath(businessSlug);
  const displayName =
    getDisplayFirstName({ fullName: user.name }) || user.name;

  function closeMobileSidebar() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  function handleLogout() {
    startTransition(async () => {
      const result = await authClient.signOut();
      if (result.error) return;
      window.localStorage.removeItem(themeUserStorageKey);
      clearPersistedThemePreference();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full reload is intentional after sign-out.
      window.location.assign("/login");
    });
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu modal={isMobile}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="group/user-menu h-auto cursor-pointer justify-between rounded-xl border-2 border-transparent bg-sidebar-accent py-2 pr-3 pl-2.5 shell-sidebar-motion hover:border-sidebar-border hover:bg-sidebar-accent group-data-[collapsed=true]/sidebar:h-9 group-data-[collapsed=true]/sidebar:w-9 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:gap-0 group-data-[collapsed=true]/sidebar:rounded-full group-data-[collapsed=true]/sidebar:border-transparent group-data-[collapsed=true]/sidebar:bg-transparent group-data-[collapsed=true]/sidebar:p-0 data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"
              size="lg"
              tooltip={displayName}
            >
              <Avatar className="size-8 shrink-0 rounded-full border-0 bg-transparent">
                {user.avatarSrc ? (
                  <AvatarImage
                    alt={`${displayName} avatar`}
                    src={user.avatarSrc}
                    loading="eager"
                    decoding="async"
                    fetchPriority="high"
                  />
                ) : null}
                <AvatarFallback className="border-0 bg-transparent text-foreground">
                  {getInitials(displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 max-w-full flex-1 items-center gap-2 overflow-hidden whitespace-nowrap opacity-100 transition-[max-width,opacity] shell-sidebar-motion group-data-[collapsed=true]/sidebar:max-w-0 group-data-[collapsed=true]/sidebar:opacity-0">
                <span className="flex min-w-0 flex-1 flex-col items-start justify-center">
                  <span className="w-full truncate text-body-medium text-foreground">
                    {displayName}
                  </span>
                  <span className="w-full truncate text-body-regular text-muted-foreground">
                    {user.email}
                  </span>
                </span>
                <span className="flex size-4 shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors group-data-[state=open]/user-menu:text-foreground">
                  <ChevronDownSmall className="size-4 transition-transform [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] group-data-[state=open]/user-menu:rotate-180" />
                </span>
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[min(16rem,calc(100vw-2rem))] rounded-xl"
            onFocusOutside={(event) => {
              // Safari can move focus out of the portaled sheet immediately
              // after a touch open. The mobile nav owns focus while it is
              // up, so do not let a transient focus escape dismiss the menu.
              if (isMobile) event.preventDefault();
            }}
            side="top"
          >
            <DropdownMenuLabel className="px-2 py-2.5">
              <div className="flex items-center gap-3">
                <Avatar className="size-8 rounded-lg">
                  {user.avatarSrc ? (
                    <AvatarImage
                      alt={`${displayName} avatar`}
                      src={user.avatarSrc}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                    />
                  ) : null}
                  <AvatarFallback className="rounded-lg">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {user.email}
                  </p>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link
                  href={businessHomePath}
                  prefetch={true}
                  onClick={closeMobileSidebar}
                >
                  <ArrowLeft data-icon="inline-start" />
                  Back to business
                </Link>
              </DropdownMenuItem>
              <AppearanceMenuSubmenu userId={user.id} />
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={isPending}
              onSelect={(event) => {
                event.preventDefault();
                handleLogout();
              }}
            >
              {isPending ? (
                <>
                  <Spinner data-icon="inline-start" aria-hidden="true" />
                  Signing out...
                </>
              ) : (
                <>
                  <LogOut data-icon="inline-start" />
                  Sign out
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase())
    .join("");
}
