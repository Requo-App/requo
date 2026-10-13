import type { Metadata } from "next";
import { Suspense } from "react";

import { ImpersonationBanner } from "@/components/shell/impersonation-banner";
import {
  MobileUserMenuSkeleton,
  UserMenuSkeleton,
} from "@/components/shell/dashboard-shell-slots";
import { requireAdminConsoleUser } from "@/features/admin/access";
import { AdminShell } from "@/features/admin/components/shell/admin-shell";
import {
  AdminMobileUserMenu,
  AdminUserMenu,
} from "@/features/admin/components/shell/admin-user-menu";
import { ThemePreferenceSync } from "@/features/theme/components/theme-preference-sync";
import { UiScaleSync } from "@/features/theme/components/ui-scale-sync";
import { getThemePreferenceForUser } from "@/features/theme/queries";
import { getUiScalePreferenceForUser } from "@/features/theme/ui-scale-queries";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  absoluteTitle: "Requo Admin",
  description: "Internal operations surface for Requo administrators.",
});

export const preferredRegion = "syd1";

/**
 * Exempt the layout entry point from instant validation — the admin session
 * cookie check always redirects unauthenticated users, which prevents
 * validation from reaching the page segment. Sibling navigations within
 * the console (e.g. /admin/users → /admin/businesses) are still validated
 * by the `instant` exports on each page.
 */
export const instant = false;

/**
 * Admin console layout (auth-gated).
 *
 * Mirrors the business dashboard shell (`(main)/layout.tsx`): the outer
 * component is synchronous and renders the structural chrome (rail +
 * topbar) instantly from static navigation data alone. The admin session
 * read lives in Suspense-wrapped slot components below, so the rail,
 * breadcrumbs, and page shell paint before the session resolves —
 * exactly how the business dashboard streams its user menu.
 *
 * `requireAdminConsoleUser()` remains the single authorization boundary:
 * every slot, every page region (via `withAdminViewLog`), and every
 * query/mutation re-checks via `requireAdminUser()`, so privileged data
 * can never render on the strength of the layout alone. Non-admins see
 * only static chrome before the gate's redirect/403 lands — the fallbacks
 * above the gate are skeleton chips, never console content.
 */
export default function AdminConsoleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AdminShell
      banner={
        <Suspense fallback={null}>
          <ImpersonationBanner />
        </Suspense>
      }
      sidebarUserSlot={
        <Suspense fallback={<UserMenuSkeleton />}>
          <AdminSidebarUserSlot />
        </Suspense>
      }
      headerUserSlot={
        <Suspense fallback={<MobileUserMenuSkeleton />}>
          <AdminCompactUserSlot />
        </Suspense>
      }
      mobileNavUserSlot={
        <Suspense fallback={<UserMenuSkeleton />}>
          <AdminSidebarUserSlot />
        </Suspense>
      }
    >
      <Suspense fallback={null}>
        <ThemeSyncSlot />
      </Suspense>
      {children}
    </AdminShell>
  );
}

async function AdminSidebarUserSlot() {
  const { user } = await requireAdminConsoleUser();

  return (
    <AdminUserMenu
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        avatarSrc: user.image ?? null,
      }}
    />
  );
}

async function AdminCompactUserSlot() {
  const { user } = await requireAdminConsoleUser();

  return (
    <AdminMobileUserMenu
      user={{
        id: user.id,
        name: user.name,
        email: user.email,
        avatarSrc: user.image ?? null,
      }}
    />
  );
}

async function ThemeSyncSlot() {
  const { user } = await requireAdminConsoleUser();
  const [themePreference, uiScale] = await Promise.all([
    getThemePreferenceForUser(user.id),
    getUiScalePreferenceForUser(user.id),
  ]);

  return (
    <>
      {/* Keep the admin console's theme + UI scale in step with the rest of the
          product, the same way the business dashboard shell does. */}
      <ThemePreferenceSync themePreference={themePreference} userId={user.id} />
      <UiScaleSync uiScale={uiScale} userId={user.id} />
    </>
  );
}
