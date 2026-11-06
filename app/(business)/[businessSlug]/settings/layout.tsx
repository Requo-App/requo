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
import { PlanSelectionProvider } from "@/features/billing/components/plan-selection-provider";
import { getBusinessBillingShellOverview } from "@/features/billing/queries";
import { getAppShellContext } from "@/lib/app-shell/context";
import {
  isCloudDeployment,
  isSelfHostedDeployment,
} from "@/lib/deployment";

/**
 * Settings layout using the same sidebar shell pattern as the business
 * dashboard. Renders a collapsible sidebar with settings navigation, a back
 * row to the business home, and a content inset area.
 *
 * Mounts BusinessCheckoutProvider so entitlement components inside settings
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
  const groups = getUnifiedSettingsNavigation(businessSlug, {
    includeBilling: isCloudDeployment(),
  });

  return (
    <>
      <Suspense fallback={null}>
        <ThemeSyncSlot businessSlug={businessSlug} />
      </Suspense>
      <PlanSelectionProvider>
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
      </PlanSelectionProvider>
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
  if (isSelfHostedDeployment()) {
    return <>{children}</>;
  }

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
  const { user } = await getAppShellContext(businessSlug);
  const profile = await getAccountProfileForUser(user.id);

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