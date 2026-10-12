"use client";

import { useTransition } from "react";
import { LogOut, Server } from "lucide-react";
import Link from "next/link";

import { ChevronDownSmall } from "@/components/shared/chevrons";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ADMIN_SYSTEM_PATH } from "@/features/admin/navigation";
import { getDisplayFirstName } from "@/features/account/name";
import { AppearanceMenuSubmenu } from "@/features/theme/components/appearance-menu";
import { clearPersistedThemePreference } from "@/features/theme/persistence";
import { themeUserStorageKey } from "@/features/theme/types";
import { authClient } from "@/lib/auth/client";

export type AdminShellUser = {
  id: string;
  name: string;
  email: string;
  avatarSrc: string | null;
};

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase())
    .join("");
}

/**
 * Sign the admin out through Better Auth.
 *
 * The legacy console posted to `/api/admin/logout`, which is a deprecated
 * shim that responds `410 Gone` — so sign-out could never succeed. Better
 * Auth owns the session, so `authClient.signOut()` is the only correct call.
 */
function useAdminSignOut() {
  const [isPending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      const result = await authClient.signOut();

      if (result.error) {
        return;
      }

      window.localStorage.removeItem(themeUserStorageKey);
      clearPersistedThemePreference();
      // Land on the console root: with no session the console gate bounces
      // to the main app, so signed-out admins never see a dead login route.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full reload is intentional after sign-out.
      window.location.assign("/");
    });
  }

  return { isPending, signOut };
}

function AdminMenuItems({
  user,
  onNavigate,
}: {
  user: AdminShellUser;
  onNavigate?: () => void;
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuItem asChild>
        <Link href={ADMIN_SYSTEM_PATH} prefetch={true} onClick={onNavigate}>
          <Server data-icon="inline-start" />
          System
        </Link>
      </DropdownMenuItem>
      <AppearanceMenuSubmenu userId={user.id} />
    </DropdownMenuGroup>
  );
}

function AdminMenuHeader({ user }: { user: AdminShellUser }) {
  const displayName =
    getDisplayFirstName({ fullName: user.name }) || user.name;
  return (
    <DropdownMenuLabel className="px-2 py-2.5">
      <div className="flex items-center gap-3">
        <Avatar className="rounded-lg">
          {user.avatarSrc ? (
            <AvatarImage
              alt={`${displayName} avatar`}
              src={user.avatarSrc}
              loading="eager"
              decoding="async"
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
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Badge className="ml-auto shrink-0" variant="secondary">
          Admin
        </Badge>
      </div>
    </DropdownMenuLabel>
  );
}

function AdminSignOutItem() {
  const { isPending, signOut } = useAdminSignOut();

  return (
    <DropdownMenuItem
      disabled={isPending}
      onSelect={(event) => {
        event.preventDefault();
        signOut();
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
  );
}

/**
 * Sidebar-footer admin menu. Mirrors `DashboardUserMenu` so the admin rail's
 * bottom slot matches the business dashboard exactly, including the collapsed
 * (icon-only) treatment driven by `data-collapsed` on the sidebar.
 */
export function AdminUserMenu({ user }: { user: AdminShellUser }) {
  const { isMobile, setOpenMobile } = useSidebar();
  const displayName =
    getDisplayFirstName({ fullName: user.name }) || user.name;

  function closeMobileSidebar() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="group/user-menu h-auto cursor-pointer justify-between rounded-xl border-2 border-transparent bg-sidebar-accent py-2 pr-3 pl-2.5 hover:border-sidebar-border hover:bg-sidebar-accent group-data-[collapsed=true]/sidebar:h-9 group-data-[collapsed=true]/sidebar:w-9 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:gap-0 group-data-[collapsed=true]/sidebar:rounded-full group-data-[collapsed=true]/sidebar:border-transparent group-data-[collapsed=true]/sidebar:bg-transparent group-data-[collapsed=true]/sidebar:p-0 data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"
              size="lg"
              tooltip={displayName}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <Avatar className="rounded-full border-0 bg-transparent">
                  {user.avatarSrc ? (
                    <AvatarImage
                      alt={`${displayName} avatar`}
                      src={user.avatarSrc}
                      loading="eager"
                      decoding="async"
                    />
                  ) : null}
                  <AvatarFallback className="border-0 bg-transparent text-foreground">
                    {getInitials(displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="flex min-w-0 flex-1 flex-col items-start justify-center group-data-[collapsed=true]/sidebar:hidden">
                  <span className="w-full truncate text-body-medium text-foreground">
                    {displayName}
                  </span>
                  <span className="w-full truncate text-body-regular text-muted-foreground">
                    {user.email}
                  </span>
                </span>
              </span>
              <span className="flex size-4 shrink-0 items-center justify-center rounded-xs text-muted-foreground transition-colors group-data-[collapsed=true]/sidebar:hidden group-data-[state=open]/user-menu:text-foreground">
                <ChevronDownSmall className="size-4 transition-transform [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] group-data-[state=open]/user-menu:rotate-180" />
              </span>
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-[min(16rem,calc(100vw-2rem))] rounded-xl"
          >
            <AdminMenuHeader user={user} />
            <DropdownMenuSeparator />
            <AdminMenuItems user={user} onNavigate={closeMobileSidebar} />
            <DropdownMenuSeparator />
            <AdminSignOutItem />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

/**
 * Compact icon-only admin menu for the mobile top bar, where the sidebar is
 * not rendered.
 */
export function AdminMobileUserMenu({ user }: { user: AdminShellUser }) {
  const displayName =
    getDisplayFirstName({ fullName: user.name }) || user.name;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent transition-colors hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-95"
          aria-label="Admin profile menu"
          type="button"
        >
          <Avatar className="size-8 rounded-lg">
            {user.avatarSrc ? (
              <AvatarImage
                alt={`${displayName} avatar`}
                src={user.avatarSrc}
                loading="eager"
                decoding="async"
              />
            ) : null}
            <AvatarFallback className="rounded-lg text-xs">
              {getInitials(displayName)}
            </AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[min(16rem,calc(100vw-2rem))] rounded-xl"
      >
        <AdminMenuHeader user={user} />
        <DropdownMenuSeparator />
        <AdminMenuItems user={user} />
        <DropdownMenuSeparator />
        <AdminSignOutItem />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
