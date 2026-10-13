"use client";

import Link from "next/link";
import { LogOut, User } from "lucide-react";
import { useTransition } from "react";

import { authClient } from "@/lib/auth/client";
import { getDisplayFirstName } from "@/features/account/name";
import { homePath } from "@/features/businesses/routes";
import { AppearanceMenuSubmenu } from "@/features/theme/components/appearance-menu";
import { clearPersistedThemePreference } from "@/features/theme/persistence";
import { themeUserStorageKey } from "@/features/theme/types";
import { clearOnboardingDraft } from "@/features/onboarding/helpers";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

type AccountUserMenuProps = {
  user: {
    id: string;
    email: string;
    name: string;
    avatarSrc: string | null;
  };
};

export function AccountUserMenu({ user }: AccountUserMenuProps) {
  const [isPending, startTransition] = useTransition();
  const displayName =
    getDisplayFirstName({ fullName: user.name }) || user.name;

  function handleLogout() {
    startTransition(async () => {
      const result = await authClient.signOut();

      if (result.error) {
        return;
      }

      window.localStorage.removeItem(themeUserStorageKey);
      clearPersistedThemePreference();
      clearOnboardingDraft();

      // A full reload clears client auth state after sign-out.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- Full reload is intentional after sign-out.
      window.location.assign("/login");
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Open user menu"
          className="inline-flex size-9 items-center justify-center rounded-full border border-border/70 bg-background/90 shadow-sm transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/25 sm:size-8"
          type="button"
        >
          <Avatar className="size-8">
            {user.avatarSrc ? (
              <AvatarImage alt={`${displayName} avatar`} src={user.avatarSrc} loading="eager" decoding="async" fetchPriority="high" />
            ) : null}
            <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 rounded-xl">
        <DropdownMenuLabel className="px-2 py-2.5">
          <div className="flex items-center gap-3">
            <Avatar className="size-8">
              {user.avatarSrc ? (
                <AvatarImage alt={`${displayName} avatar`} src={user.avatarSrc} loading="eager" decoding="async" fetchPriority="high" />
              ) : null}
              <AvatarFallback>{getInitials(displayName)}</AvatarFallback>
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
            <Link href={homePath} prefetch={true}>
              <User data-icon="inline-start" />
              Dashboard
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
              <Spinner aria-hidden="true" data-icon="inline-start" />
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
