import { Suspense } from "react";

import { RecentBusinessTracker } from "@/features/businesses/components/recent-business-tracker";
import { DashboardShellFrame } from "@/components/shell/dashboard-shell-frame";
import {
  BusinessSwitcherSkeleton,
  DashboardUserMenu,
  UserMenuSkeleton,
  MobileBusinessSwitcherSkeleton,
} from "@/components/shell/dashboard-shell-slots";
import {
  BusinessSwitcherSlot,
  MobileBusinessSwitcherSlot,
  ThemeSyncSlot,
} from "@/components/shell/business-data-slots";
import { Skeleton } from "@/components/ui/skeleton";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import { BusinessCheckoutProvider } from "@/features/billing/components/business-checkout-provider";
import { PlanSelectionProvider } from "@/features/billing/components/plan-selection-provider";
import { TrialBanner } from "@/features/billing/components/trial-banner";
import { UpgradeSuccessModal } from "@/features/billing/components/upgrade-success-modal";
import { LockedBusinessSurface } from "@/features/businesses/components/locked-business-surface";
import { ArchivedBusinessBanner } from "@/features/businesses/components/archived-business-banner";
import { unarchiveBusinessAction } from "@/features/businesses/actions";
import { getAccountProfileForUser } from "@/features/account/queries";
import { resolveUserAvatarSrc } from "@/features/account/utils";
import { getBusinessBillingShellOverview } from "@/features/billing/queries";
import { InquiryUnreadBadgeSlot } from "@/features/inquiries/components/inquiry-unread-badge-slot";
import { getBusinessNotificationBellView } from "@/features/notifications/queries";
import { DashboardNotificationBell } from "@/features/notifications/components/dashboard-notification-bell";
import { SidebarChecklistSection } from "@/features/onboarding/components/sidebar-checklist-section";
import {
  getBusinessHomePath,
  getBusinessSettingsPath,
} from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";

/**
 * Dashboard shell layout for the `(main)` route group.
 *
 * Renders the structural shell (sidebar frame, navigation, topbar) instantly
 * using only the business slug from the URL. Data-dependent sections (business
 * switcher, user menu, notifications, upgrade button) stream in via Suspense
 * boundaries so the user sees the real app chrome immediately.
 *
 * This eliminates the full-page skeleton flash on cold loads — only the
 * data-dependent slots show loading indicators.
 *
 * The outer component is synchronous; the `params` await and all data reads
 * live inside a Suspense-wrapped child shell so sibling navigations paint the
 * destination route instantly instead of blocking on this layout.
 */
export default function BusinessMainLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  return (
    <>
      <UpgradeSuccessModal />
      <Suspense fallback={null}>
        <BusinessMainShell params={params}>{children}</BusinessMainShell>
      </Suspense>
    </>
  );
}

async function BusinessMainShell({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ businessSlug: string }>;
}) {
  const { businessSlug } = await params;

  return (
    <>
      <PlanSelectionProvider>
      <DashboardShellFrame
        businessSlug={businessSlug}
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
        userMenuSlot={
          <Suspense fallback={<UserMenuSkeleton />}>
            <UserMenuSlot businessSlug={businessSlug} />
          </Suspense>
        }
        notificationSlot={
          <Suspense fallback={<Skeleton className="size-9 rounded-lg" />}>
            <NotificationBellSlot businessSlug={businessSlug} />
          </Suspense>
        }
        upgradeSlot={
          <Suspense fallback={null}>
            <UpgradeSlot businessSlug={businessSlug} />
          </Suspense>
        }
        checklistSlot={
          <Suspense fallback={null}>
            <ChecklistSlot businessSlug={businessSlug} />
          </Suspense>
        }
        themeSyncSlot={
          <Suspense fallback={null}>
            <ThemeSyncSlot businessSlug={businessSlug} />
          </Suspense>
        }
        bannerSlot={
          <Suspense fallback={null}>
            <BannerSlot businessSlug={businessSlug} />
          </Suspense>
        }
        navBadgeSlot={
          <Suspense fallback={null}>
            <InquiryUnreadBadgeSlot businessSlug={businessSlug} />
          </Suspense>
        }
      >
        <Suspense fallback={null}>
          <RecentBusinessTrackerSlot businessSlug={businessSlug} />
        </Suspense>
        <BillingBoundary businessSlug={businessSlug}>
          {children}
        </BillingBoundary>
      </DashboardShellFrame>
      </PlanSelectionProvider>
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  Streamed slots — each resolves its own data independently                 */
/* -------------------------------------------------------------------------- */

async function UserMenuSlot({ businessSlug }: { businessSlug: string }) {
  const { user, businessContext } = await getAppShellContext(businessSlug);
  const profile = await getAccountProfileForUser(user.id);

  const avatarSrc = resolveUserAvatarSrc({
    avatarStoragePath: profile?.avatarStoragePath,
    profileUpdatedAt: profile?.updatedAt,
    oauthImage: user.image ?? null,
  });

  return (
    <DashboardUserMenu
      user={{
        id: user.id,
        email: user.email,
        name: user.name,
        avatarSrc,
      }}
      businessRole={businessContext.role}
      businessSlug={businessContext.business.slug}
      businessId={businessContext.business.id}
      currency={businessContext.business.defaultCurrency}
      plan={businessContext.business.plan}
    />
  );
}

async function NotificationBellSlot({ businessSlug }: { businessSlug: string }) {
  const { user, businessContext } = await getAppShellContext(businessSlug);

  const notificationView = await getBusinessNotificationBellView({
    businessId: businessContext.business.id,
    businessSlug: businessContext.business.slug,
    userId: user.id,
    memberSince: businessContext.memberJoinedAt,
  });

  return (
    <DashboardNotificationBell
      businessId={businessContext.business.id}
      businessSlug={businessContext.business.slug}
      initialView={notificationView}
      key={[
        businessContext.business.id,
        notificationView.unreadCount,
        notificationView.lastReadAt ?? "unread",
        notificationView.items[0]?.id ?? "empty",
      ].join(":")}
      userId={user.id}
    />
  );
}

async function UpgradeSlot({ businessSlug }: { businessSlug: string }) {
  const { businessContext } = await getAppShellContext(businessSlug);
  const billing = await getBusinessBillingShellOverview(
    businessContext.business.id,
  ).catch(() => null);

  if (!billing || billing.currentPlan === "business") {
    return null;
  }

  const isTrialing =
    billing.subscription?.status === "trialing" &&
    billing.currentPlan === "pro";

  return (
    <BusinessCheckoutProvider billing={billing}>
      <div className="shrink-0">
        <UpgradeButton
          className="whitespace-nowrap"
          currentPlan={billing.currentPlan}
          isTrialing={isTrialing}
          size="sm"
          targetPlan={isTrialing ? "pro" : undefined}
          userId={billing.userId}
          businessId={billing.businessId}
          businessSlug={businessContext.business.slug}
        >
          {isTrialing ? "Choose plan" : undefined}
        </UpgradeButton>
      </div>
    </BusinessCheckoutProvider>
  );
}

async function ChecklistSlot({ businessSlug }: { businessSlug: string }) {
  const { businessContext } = await getAppShellContext(businessSlug);

  return (
    <SidebarChecklistSection
      businessId={businessContext.business.id}
      businessSlug={businessContext.business.slug}
      publicInquiryEnabled={businessContext.business.publicInquiryEnabled}
    />
  );
}

async function BannerSlot({ businessSlug }: { businessSlug: string }) {
  const { businessContext } = await getAppShellContext(businessSlug);

  if (businessContext.business.recordState === "archived") {
    return (
      <ArchivedBusinessBanner
        dashboardHref={getBusinessHomePath(businessContext.business.slug)}
        unarchiveAction={unarchiveBusinessAction.bind(
          null,
          businessContext.business.id,
          businessContext.business.slug,
        )}
      />
    );
  }

  const billing = await getBusinessBillingShellOverview(
    businessContext.business.id,
  ).catch(() => null);

  if (
    billing?.currentPlan === "pro" &&
    billing.subscription?.status === "trialing" &&
    billing.subscription.trialEndsAt
  ) {
    return (
      <TrialBanner
        trialEndsAt={billing.subscription.trialEndsAt}
        billingHref={getBusinessSettingsPath(
          businessContext.business.slug,
          "billing",
        )}
      />
    );
  }

  return null;
}

async function RecentBusinessTrackerSlot({ businessSlug }: { businessSlug: string }) {
  const { businessContext } = await getAppShellContext(businessSlug);
  return <RecentBusinessTracker businessSlug={businessContext.business.slug} />;
}

function BillingBoundary({
  businessSlug,
  children,
}: {
  businessSlug: string;
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<>{children}</>}>
      <BillingBoundaryContent businessSlug={businessSlug}>
        {children}
      </BillingBoundaryContent>
    </Suspense>
  );
}

async function BillingBoundaryContent({
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

  const isArchived = businessContext.business.recordState === "archived";

  const lockedBanner =
    businessContext.business.recordState === "locked" && billing ? (
      <LockedBusinessSurface
        billing={billing}
        businessContext={businessContext}
      />
    ) : null;

  const body = (
    <div data-archived={isArchived || undefined} data-slot="archived-scope">
      {lockedBanner}
      {children}
    </div>
  );

  if (billing) {
    return (
      <BusinessCheckoutProvider billing={billing}>
        {body}
      </BusinessCheckoutProvider>
    );
  }

  return body;
}


