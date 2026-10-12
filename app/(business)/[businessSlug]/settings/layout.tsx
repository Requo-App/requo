import { Suspense } from "react";

import { getAccountProfileForUser } from "@/features/account/queries";
import { resolveUserAvatarSrc } from "@/features/account/utils";
import { getUnifiedSettingsNavigation } from "@/features/settings/navigation";
import { SettingsShellFrame, SettingsUserMenu } from "@/features/settings/components/settings-shell-frame";
import {
  BusinessSwitcherSkeleton,
  MobileBusinessSwitcherSkeleton,
  UserMenuSkeleton,
} from "@/components/shell/dashboard-shell-slots";
import {
  BusinessSwitcherSlot,
  MobileBusinessSwitcherSlot,
  ThemeSyncSlot,
} from "@/components/shell/business-data-slots";
import { BusinessCheckoutProvider } from "@/features/billing/components/business-checkout-provider";
import { getBusinessBillingShellOverview } from "@/features/billing/queries";
import { getAppShellContext } from "@/lib/app-shell/context";
import { requireSession } from "@/lib/auth/session";

/**
 * Settings layout using the same sidebar shell pattern as the business
 * dashboard. Renders a collapsible sidebar with settings navigation and
 * a content inset area. No back button — navigation is handled by the
 * sidebar itself.
 *
 * Mounts BusinessCheckoutProvider so paywall components inside settings
 * (knowledge, pricing, email, members, billing, etc.) can open the plan
 * selection sheet through the same shared state used in the main shell.
 *
 * The outer component is synchronous; the `params` await lives inside a
 * Suspense-wrapped child shell so entering settings never blocks on this
 * layout and sibling navigations stay instant.
 */
export default function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <SettingsShell params={params}>{children}</SettingsShell>
    </Suspense>
  );
}

async function SettingsShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;
  const groups = getUnifiedSettingsNavigation(businessSlug);

  return (
    <>
      <Suspense fallback={null}>
        <ThemeSyncSlot businessSlug={businessSlug} />
      </Suspense>
      <SettingsShellFrame
        businessSlug={businessSlug}
        groups={groups}
        userMenuSlot={
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenuSlot businessSlug={businessSlug} />
          </Suspense>
        }
        businessSwitcherSlot={
          <Suspense fallback={<BusinessSwitcherSkeleton />}>
            <BusinessSwitcherSlot businessSlug={businessSlug} />
          </Suspense>
        }
        mobileBusinessSwitcherSlot={
          <Suspense fallback={<MobileBusinessSwitcherSkeleton />}>
            <MobileBusinessSwitcherSlot businessSlug={businessSlug} />
          </Suspense>
        }
      >
        <Suspense fallback={children}>
          <CheckoutProviderSlot businessSlug={businessSlug}>
            {children}
          </CheckoutProviderSlot>
        </Suspense>
      </SettingsShellFrame>
    </>
  );
}

/**
 * Streams the BusinessCheckoutProvider mount alongside the shell so the
 * settings layout doesn't block on a billing fetch. If the billing query
 * fails or the user is on the highest plan, children render without the
 * provider — the UpgradeButton falls back to its self-contained sheet.
 */
async function CheckoutProviderSlot({
  businessSlug,
  children,
}: {
  businessSlug: string;
  children: React.ReactNode;
}) {
  const { businessContext } = await getAppShellContext(businessSlug);
  const billing = await getBusinessBillingShellOverview(
    businessContext.business.id,
  ).catch(() => null);

  if (!billing) {
    return <>{children}</>;
  }

  return (
    <BusinessCheckoutProvider billing={billing}>
      {children}
    </BusinessCheckoutProvider>
  );
}

/* -------------------------------------------------------------------------- */
/*  Streamed slots                                                             */
/* -------------------------------------------------------------------------- */

async function UserMenuSlot({ businessSlug }: { businessSlug: string }) {
  const session = await requireSession();
  const [shellContext, profile] = await Promise.all([
    getAppShellContext(businessSlug),
    getAccountProfileForUser(session.user.id),
  ]);

  const { user } = shellContext;

  const avatarSrc = resolveUserAvatarSrc({
    avatarStoragePath: profile?.avatarStoragePath,
    profileUpdatedAt: profile?.updatedAt,
    oauthImage: user.image ?? null,
  });

  return (
    <SettingsUserMenu
      user={{ id: user.id, email: user.email, name: user.name, avatarSrc }}
      businessSlug={businessSlug}
    />
  );
}