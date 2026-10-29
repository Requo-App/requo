"use client";

import { useState, useTransition } from "react";
import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  ChevronsUpDown,
  Lock,
  LogOut,
  Plus,
  Settings2,
  User,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth/client";
import { isBillingCurrency } from "@/lib/billing/currencies";
import type { BillingCurrency } from "@/lib/billing/types";
import { getDisplayFirstName } from "@/features/account/name";
import { AppearanceMenuSubmenu } from "@/features/theme/components/appearance-menu";
import { clearPersistedThemePreference } from "@/features/theme/persistence";
import { themeUserStorageKey } from "@/features/theme/types";
import { canManageOperationalBusinessSettings } from "@/lib/business-members";
import type { BusinessContext } from "@/lib/db/business-access";
import type { BusinessQuotaSnapshot } from "@/features/businesses/types";
import { BusinessAvatar } from "@/components/shared/business-avatar";
import { PlanBadge } from "@/components/shared/plan-badge";
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
import { useBusinessCheckout } from "@/features/billing/components/business-checkout-provider";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import {
  getBusinessHomePath,
  getBusinessSettingsPath,
} from "@/features/businesses/routes";
import { getDefaultBusinessSettingsPath } from "@/features/settings/navigation";
import { InviteMemberDialog } from "@/features/business-members/components/business-members-manager";
import { createBusinessMemberInviteAction } from "@/features/business-members/actions";
import { useActionStateWithSonner } from "@/hooks/use-action-state-with-sonner";
import type { BusinessMemberAssignableRole } from "@/lib/business-members";

function redirectToLogin() {
  // Clear the authenticated App Router state after sign-out with a full navigation.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.assign("/login");
}

/* -------------------------------------------------------------------------- */
/*  Business Switcher                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Versioned logo URL for switcher avatars. The `v` param busts the browser
 * cache the moment a new logo is saved (businesses.updatedAt changes on every
 * settings save) and lets the logo routes serve immutable caching.
 */
function getSwitcherLogoUrl(
  basePath: string,
  business: Pick<BusinessContext["business"], "logoStoragePath" | "updatedAt">,
) {
  if (!business.logoStoragePath) {
    return null;
  }

  return `${basePath}?v=${business.updatedAt.getTime()}`;
}

/** Businesses shown before the switcher list expands. */
const BUSINESS_LIST_PREVIEW_COUNT = 3;
/**
 * Rows that fit inside the expanded list before it scrolls. The list renders
 * every membership; this is only the viewport height cap.
 */
const BUSINESS_LIST_VISIBLE_ROWS = 10;

/**
 * Membership rows shared by the desktop and mobile business switchers.
 *
 * Three businesses show by default. The expander reveals the rest of the list
 * inside a viewport capped at ten rows, so larger accounts scroll instead of
 * growing the menu past the screen.
 */
function BusinessMembershipList({
  memberships,
  currentBusinessId,
  onNavigate,
}: {
  memberships: BusinessContext[];
  currentBusinessId: string;
  onNavigate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const canExpand = memberships.length > BUSINESS_LIST_PREVIEW_COUNT;
  const scrolls = expanded && memberships.length > BUSINESS_LIST_VISIBLE_ROWS;
  const previewMemberships = memberships.slice(0, BUSINESS_LIST_PREVIEW_COUNT);
  const extraMemberships = memberships.slice(BUSINESS_LIST_PREVIEW_COUNT);

  function renderMembership(membership: BusinessContext) {
    const isCurrent = membership.business.id === currentBusinessId;

    return (
      <DropdownMenuItem asChild key={membership.membershipId}>
        <Link
          href={getBusinessHomePath(membership.business.slug)}
          prefetch={true}
          onClick={onNavigate}
        >
          <BusinessAvatar
            name={membership.business.name}
            logoUrl={getSwitcherLogoUrl(
              `/api/business/${membership.business.slug}/logo`,
              membership.business,
            )}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {membership.business.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              /{membership.business.slug}
            </p>
          </div>
          <span className="meta-label">{membership.role}</span>
          {membership.business.recordState === "locked" ? (
            <Badge variant="outline" className="gap-1">
              <Lock className="size-3" />
              Locked
            </Badge>
          ) : null}
          {isCurrent ? <Check className="size-4 text-primary-ink" /> : null}
        </Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuGroup>
      <div
        className={cn(
          "flex flex-col",
          // Ten 3.25rem rows; the list still renders every membership.
          scrolls && "max-h-[32.5rem] overflow-y-auto overscroll-contain",
        )}
      >
        {previewMemberships.map(renderMembership)}
        {canExpand ? (
          <div
            // The accordion animates the row height while `inert` keeps the
            // collapsed links out of the tab order and the a11y tree.
            inert={expanded ? undefined : true}
            className={cn(
              "grid transition-[grid-template-rows] [transition-duration:var(--motion-duration-base)] [transition-timing-function:var(--motion-ease-standard)]",
              expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <div className="flex min-h-0 flex-col overflow-hidden">
              {extraMemberships.map(renderMembership)}
            </div>
          </div>
        ) : null}
      </div>
      {canExpand ? (
        <DropdownMenuItem
          className="min-h-8 justify-center gap-1.5 text-xs font-medium text-muted-foreground"
          onSelect={(event) => {
            event.preventDefault();
            setExpanded((value) => !value);
          }}
        >
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-3.5 transition-transform [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)]",
              expanded && "rotate-180",
            )}
          />
          {expanded ? "Show fewer businesses" : `Show all ${memberships.length} businesses`}
        </DropdownMenuItem>
      ) : null}
    </DropdownMenuGroup>
  );
}

export function BusinessSwitcher({
  currentBusiness,
  memberships,
  businessQuota,
  userId,
  compact = false,
  billingCurrency,
  isTrialing = false,
}: {
  currentBusiness: BusinessContext;
  memberships: BusinessContext[];
  businessQuota: BusinessQuotaSnapshot;
  userId: string;
  /** Compact single-row trigger (avatar + name + chevron) for the BoardUI sidebar. */
  compact?: boolean;
  /** Subscription currency for plan prices; falls back to the quote currency. */
  billingCurrency?: BillingCurrency;
  /** The business is inside its Pro trial and still needs a subscription. */
  isTrialing?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const businessCheckout = useBusinessCheckout();
  const [menuOpen, setMenuOpen] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BusinessMemberAssignableRole>("staff");
  const [, inviteFormAction, isInvitePending] = useActionStateWithSonner(
    createBusinessMemberInviteAction,
    {},
  );

  const liveplan =
    businessCheckout?.businessId === currentBusiness.business.id
      ? businessCheckout.currentPlan
      : null;

  const business =
    liveplan && liveplan !== currentBusiness.business.plan
      ? { ...currentBusiness.business, plan: liveplan }
      : currentBusiness.business;

  const shellMemberships = liveplan
    ? memberships.map((membership) =>
        membership.business.id === business.id
          ? { ...membership, business: { ...membership.business, plan: liveplan } }
          : membership,
      )
    : memberships;

  const upgradeCurrency =
    billingCurrency ??
    (isBillingCurrency(business.defaultCurrency)
      ? business.defaultCurrency
      : "USD");

  function closeMobileSidebar() {
    if (isMobile) {
      setOpenMobile(false);
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
        {compact ? (
          <button
            className="group/business-switcher flex h-8 w-full min-w-0 cursor-pointer items-center gap-2 rounded-lg px-2 text-left transition-[background-color,color] shell-sidebar-motion hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent group-data-[collapsed=true]/sidebar:size-9 group-data-[collapsed=true]/sidebar:shrink-0 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:gap-0 group-data-[collapsed=true]/sidebar:rounded-lg group-data-[collapsed=true]/sidebar:px-0"
            data-tour="business-switcher"
            type="button"
            aria-label={`Switch business — current business ${business.name}`}
            title={business.name}
          >
            <BusinessAvatar
              name={business.name}
              logoUrl={getSwitcherLogoUrl("/api/business/logo", business)}
              loading="eager"
              size="xs"
              className="shrink-0"
            />
            <span
              className="min-w-0 flex-1 truncate text-sm font-semibold text-sidebar-foreground group-data-[collapsed=true]/sidebar:hidden"
              title={business.name}
            >
              {business.name}
            </span>
            <PlanBadge
              plan={business.plan}
              size="sm"
              className="group-data-[collapsed=true]/sidebar:hidden"
            />
            <span
              aria-hidden="true"
              className="flex size-4 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors group-data-[state=open]/business-switcher:text-sidebar-foreground group-data-[collapsed=true]/sidebar:hidden"
            >
              <ChevronsUpDown className="size-4" />
            </span>
          </button>
        ) : (
        <button
          className="group/business-switcher control-surface w-full rounded-xl border p-3.5 text-left transition-[background-color,border-color,box-shadow,transform] [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] hover:bg-[var(--control-bg-hover)] data-[state=open]:bg-[var(--control-bg-hover)] data-[state=open]:shadow-[var(--control-shadow-hover)] group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0 group-data-[collapsible=icon]:flex group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:rounded-lg group-data-[collapsible=icon]:border-none group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:shadow-none hover:group-data-[collapsible=icon]:bg-sidebar-accent"
          data-tour="business-switcher"
          type="button"
        >
          <div className="flex items-start gap-3.5 group-data-[collapsible=icon]:gap-0 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:justify-center">
            <BusinessAvatar
              name={business.name}
              logoUrl={getSwitcherLogoUrl("/api/business/logo", business)}
              className="size-14 rounded-xl border-sidebar-border shadow-[inset_0_1px_0_var(--surface-highlight)] [&_[data-slot=avatar-image]]:rounded-xl [&_[data-slot=avatar-fallback]]:rounded-xl [&_[data-slot=avatar-fallback]]:text-sm [&_[data-slot=avatar-fallback]]:text-sidebar-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:rounded-lg [&_[data-slot=avatar-image]]:group-data-[collapsible=icon]:rounded-lg [&_[data-slot=avatar-fallback]]:group-data-[collapsible=icon]:rounded-lg [&_[data-slot=avatar-fallback]]:group-data-[collapsible=icon]:text-xs"
            />
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <div className="flex items-center justify-between gap-3">
                <p className="meta-label text-sidebar-foreground/60">Business</p>
                <ChevronsUpDown className="size-4 text-muted-foreground transition-transform [transition-duration:var(--motion-duration-fast)] [transition-timing-function:var(--motion-ease-standard)] group-data-[state=open]/business-switcher:rotate-180" />
              </div>
              <p className="mt-2 truncate text-sm font-semibold text-sidebar-foreground">
                {business.name}
              </p>
              <p className="mt-1 truncate text-sm text-muted-foreground">
                /{business.slug}
              </p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 group-data-[collapsible=icon]:hidden">
            <PlanBadge plan={business.plan} />
            <Badge
              className="text-sidebar-foreground"
              variant="outline"
            >
              {business.defaultCurrency}
            </Badge>
          </div>
        </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="w-[min(18rem,calc(100vw-2rem))] rounded-xl"
      >
        <DropdownMenuLabel className="px-2 py-2.5">
          Switch business
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <BusinessMembershipList
          memberships={shellMemberships}
          currentBusinessId={currentBusiness.business.id}
          onNavigate={closeMobileSidebar}
        />
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {businessQuota.allowed ? (
            <DropdownMenuItem asChild>
              <Link href="/new" onClick={closeMobileSidebar} prefetch={true}>
                <Plus data-icon="inline-start" />
                New business
              </Link>
            </DropdownMenuItem>
          ) : (
            <div className="flex items-center justify-between gap-2 px-2 py-1.5">
              <span className="flex items-center gap-2 text-sm text-muted-foreground opacity-60">
                <Plus data-icon="inline-start" className="size-4" />
                Limit reached ({businessQuota.current}/{businessQuota.limit})
              </span>
              <UpgradeButton
                businessId={business.id}
                businessSlug={business.slug}
                currency={upgradeCurrency}
                currentPlan={business.plan}
                isTrialing={isTrialing}
                onOpen={() => setMenuOpen(false)}
                size="sm"
                userId={userId}
              >
                Upgrade
              </UpgradeButton>
            </div>
          )}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link
              href={getBusinessSettingsPath(business.slug, "general")}
              prefetch={true}
              onClick={closeMobileSidebar}
            >
              <Settings2 data-icon="inline-start" />
              Business settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link
              href={getBusinessSettingsPath(business.slug, "profile")}
              prefetch={true}
              onClick={closeMobileSidebar}
            >
              <User data-icon="inline-start" />
              Account settings
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              closeMobileSidebar();
              setInviteOpen(true);
            }}
          >
            <UserPlus data-icon="inline-start" />
            Invite team members
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
      
      <InviteMemberDialog
        email={inviteEmail}
        isPending={isInvitePending}
        onEmailChange={setInviteEmail}
        onOpenChange={setInviteOpen}
        onRoleChange={setInviteRole}
        onSubmit={inviteFormAction}
        open={inviteOpen}
        role={inviteRole}
      />
    </>
  );
}

/* -------------------------------------------------------------------------- */
/*  User Menu                                                                  */
/* -------------------------------------------------------------------------- */

export function DashboardUserMenu({
  user,
  businessRole,
  businessSlug,
  plan,
  businessId,
  currency,
  isTrialing = false,
}: {
  user: {
    id: string;
    email: string;
    name: string;
    avatarSrc: string | null;
  };
  businessRole: BusinessContext["role"];
  businessSlug: string;
  plan: BusinessContext["business"]["plan"];
  businessId: string;
  currency?: string;
  /** The business is inside its Pro trial and still needs a subscription. */
  isTrialing?: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const { isMobile, setOpenMobile } = useSidebar();
  const [menuOpen, setMenuOpen] = useState(false);
  const upgradeCurrency =
    currency && isBillingCurrency(currency) ? currency : "USD";
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

      if (result.error) {
        return;
      }

      window.localStorage.removeItem(themeUserStorageKey);
      clearPersistedThemePreference();

      redirectToLogin();
    });
  }

  const canOpenBusinessSettings =
    canManageOperationalBusinessSettings(businessRole);
  const businessSettingsHref = getDefaultBusinessSettingsPath(
    businessSlug,
    businessRole,
  );

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu onOpenChange={setMenuOpen} open={menuOpen}>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="group/user-menu h-auto cursor-pointer justify-between rounded-xl border-2 border-transparent bg-sidebar-accent py-2 pr-3 pl-2.5 shell-sidebar-motion hover:border-sidebar-border hover:bg-sidebar-accent group-data-[collapsed=true]/sidebar:h-9 group-data-[collapsed=true]/sidebar:w-9 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:gap-0 group-data-[collapsed=true]/sidebar:rounded-full group-data-[collapsed=true]/sidebar:border-transparent group-data-[collapsed=true]/sidebar:bg-transparent group-data-[collapsed=true]/sidebar:p-0 data-[state=open]:border-sidebar-border data-[state=open]:bg-sidebar-accent"
              size="lg"
              tooltip={displayName}
            >
              <Avatar className="shrink-0 rounded-full border-0 bg-transparent">
                {user.avatarSrc ? (
                  <AvatarImage alt={`${displayName} avatar`} src={user.avatarSrc} loading="lazy" decoding="async" fetchPriority="low" />
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
          >
            <DropdownMenuLabel className="px-2 py-2.5">
              <div className="flex items-center gap-3">
                <Avatar className="rounded-lg">
                  {user.avatarSrc ? (
                    <AvatarImage alt={`${displayName} avatar`} src={user.avatarSrc} loading="lazy" decoding="async" fetchPriority="low" />
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
            {plan !== "business" ? (
              <>
                <div className="px-2 py-1.5">
                  <UpgradeButton
                    className="w-full whitespace-nowrap"
                    currency={upgradeCurrency}
                    currentPlan={plan}
                    isTrialing={isTrialing}
                    onOpen={() => setMenuOpen(false)}
                    size="sm"
                    variant="outline"
                    userId={user.id}
                    businessId={businessId}
                    businessSlug={businessSlug}
                  />
                </div>
                <DropdownMenuSeparator />
              </>
            ) : (
              <DropdownMenuSeparator />
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link
                  href={getBusinessSettingsPath(businessSlug, "profile")}
                  prefetch={true}
                  onClick={closeMobileSidebar}
                >
                  <User data-icon="inline-start" />
                  User settings
                </Link>
              </DropdownMenuItem>
              {canOpenBusinessSettings ? (
                <DropdownMenuItem asChild>
                  <Link
                    href={businessSettingsHref}
                    prefetch={true}
                    onClick={closeMobileSidebar}
                  >
                    <Settings2 data-icon="inline-start" />
                    Business settings
                  </Link>
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem asChild>
                <Link
                  href={getBusinessSettingsPath(businessSlug, "billing")}
                  prefetch={true}
                  onClick={closeMobileSidebar}
                >
                  <BriefcaseBusiness data-icon="inline-start" />
                  Billing
                  <PlanBadge plan={plan} className="ml-auto" />
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

/* -------------------------------------------------------------------------- */
/*  Mobile Top Bar Controls                                                    */
/* -------------------------------------------------------------------------- */

export function MobileBusinessSwitcher({
  currentBusiness,
  memberships,
  businessQuota,
  userId,
  billingCurrency,
  isTrialing = false,
}: {
  currentBusiness: BusinessContext;
  memberships: BusinessContext[];
  businessQuota: BusinessQuotaSnapshot;
  userId: string;
  /** Subscription currency for plan prices; falls back to the quote currency. */
  billingCurrency?: BillingCurrency;
  /** The business is inside its Pro trial and still needs a subscription. */
  isTrialing?: boolean;
}) {
  const businessCheckout = useBusinessCheckout();
  const [menuOpen, setMenuOpen] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<BusinessMemberAssignableRole>("staff");
  const [, inviteFormAction, isInvitePending] = useActionStateWithSonner(
    createBusinessMemberInviteAction,
    {},
  );

  const liveplan =
    businessCheckout?.businessId === currentBusiness.business.id
      ? businessCheckout.currentPlan
      : null;

  const business =
    liveplan && liveplan !== currentBusiness.business.plan
      ? { ...currentBusiness.business, plan: liveplan }
      : currentBusiness.business;

  const shellMemberships = liveplan
    ? memberships.map((membership) =>
        membership.business.id === business.id
          ? { ...membership, business: { ...membership.business, plan: liveplan } }
          : membership,
      )
    : memberships;

  const upgradeCurrency =
    billingCurrency ??
    (isBillingCurrency(business.defaultCurrency)
      ? business.defaultCurrency
      : "USD");

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className="motion-press flex size-8 shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            aria-label="Switch business"
            type="button"
          >
            <BusinessAvatar
              name={business.name}
              logoUrl={getSwitcherLogoUrl("/api/business/logo", business)}
              loading="eager"
            />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-[min(18rem,calc(100vw-2rem))] rounded-xl"
        >
          <DropdownMenuLabel className="px-2 py-2.5">
            Switch business
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <BusinessMembershipList
            memberships={shellMemberships}
            currentBusinessId={currentBusiness.business.id}
          />
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {businessQuota.allowed ? (
              <DropdownMenuItem asChild>
                <Link href="/new" prefetch={true}>
                  <Plus data-icon="inline-start" />
                  New business
                </Link>
              </DropdownMenuItem>
            ) : (
              <div className="flex items-center justify-between gap-2 px-2 py-1.5">
                <span className="flex items-center gap-2 text-sm text-muted-foreground opacity-60">
                  <Plus data-icon="inline-start" className="size-4" />
                  Limit reached ({businessQuota.current}/{businessQuota.limit})
                </span>
                <UpgradeButton
                  businessId={business.id}
                  businessSlug={business.slug}
                  currency={upgradeCurrency}
                  currentPlan={business.plan}
                  isTrialing={isTrialing}
                  onOpen={() => setMenuOpen(false)}
                  size="sm"
                  userId={userId}
                >
                  Upgrade
                </UpgradeButton>
              </div>
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link
                href={getBusinessSettingsPath(business.slug, "general")}
                prefetch={true}
              >
                <Settings2 data-icon="inline-start" />
                Business settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link
                href={getBusinessSettingsPath(business.slug, "profile")}
                prefetch={true}
              >
                <User data-icon="inline-start" />
                Account settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                setInviteOpen(true);
              }}
            >
              <UserPlus data-icon="inline-start" />
              Invite team members
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <InviteMemberDialog
        email={inviteEmail}
        isPending={isInvitePending}
        onEmailChange={setInviteEmail}
        onOpenChange={setInviteOpen}
        onRoleChange={setInviteRole}
        onSubmit={inviteFormAction}
        open={inviteOpen}
        role={inviteRole}
      />
    </>
  );
}

export function MobileUserMenu({
  user,
  businessRole,
  businessSlug,
  plan,
  businessId,
}: {
  user: {
    id: string;
    email: string;
    name: string;
    avatarSrc: string | null;
  };
  businessRole: BusinessContext["role"];
  businessSlug: string;
  plan: BusinessContext["business"]["plan"];
  businessId: string;
}) {
  const [isPending, startTransition] = useTransition();
  const displayName =
    getDisplayFirstName({ fullName: user.name }) || user.name;

  function handleLogout() {
    startTransition(async () => {
      const result = await authClient.signOut();
      if (result.error) return;
      window.localStorage.removeItem(themeUserStorageKey);
      clearPersistedThemePreference();
      redirectToLogin();
    });
  }

  const canOpenBusinessSettings =
    canManageOperationalBusinessSettings(businessRole);
  const businessSettingsHref = getDefaultBusinessSettingsPath(
    businessSlug,
    businessRole,
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="motion-press flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent hover:border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="User profile menu"
          type="button"
        >
          <Avatar className="size-8 rounded-lg">
            {user.avatarSrc ? (
              <AvatarImage alt={`${displayName} avatar`} src={user.avatarSrc} loading="lazy" decoding="async" fetchPriority="low" />
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
        <DropdownMenuLabel className="px-2 py-2.5">
          <div className="flex items-center gap-3">
            <Avatar className="rounded-lg">
              {user.avatarSrc ? (
                <AvatarImage alt={`${displayName} avatar`} src={user.avatarSrc} loading="lazy" decoding="async" fetchPriority="low" />
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
        {plan !== "business" ? (
          <>
            <div className="px-2 py-1.5">
              <UpgradeButton
                className="w-full whitespace-nowrap"
                currentPlan={plan}
                size="sm"
                variant="outline"
                userId={user.id}
                businessId={businessId}
                businessSlug={businessSlug}
              />
            </div>
            <DropdownMenuSeparator />
          </>
        ) : (
          <DropdownMenuSeparator />
        )}
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link
              href={getBusinessSettingsPath(businessSlug, "profile")}
              prefetch={true}
            >
              <User data-icon="inline-start" />
              User settings
            </Link>
          </DropdownMenuItem>
          {canOpenBusinessSettings ? (
            <DropdownMenuItem asChild>
              <Link
                href={businessSettingsHref}
                prefetch={true}
              >
                <Settings2 data-icon="inline-start" />
                Business settings
              </Link>
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem asChild>
            <Link
              href={getBusinessSettingsPath(businessSlug, "billing")}
              prefetch={true}
            >
              <BriefcaseBusiness data-icon="inline-start" />
              Billing
              <PlanBadge plan={plan} className="ml-auto" />
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
  );
}

/* -------------------------------------------------------------------------- */
/*  Skeleton fallbacks for streamed slots                                      */
/* -------------------------------------------------------------------------- */

export {
  BusinessSwitcherSkeleton,
  UserMenuSkeleton,
  MobileBusinessSwitcherSkeleton,
  MobileUserMenuSkeleton,
};

function BusinessSwitcherSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex h-8 w-full min-w-0 items-center gap-2 group-data-[collapsed=true]/sidebar:size-9 group-data-[collapsed=true]/sidebar:shrink-0 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:gap-0"
    >
      <div className="size-5 shrink-0 animate-pulse rounded-md bg-sidebar-accent" />
      <div className="h-4 min-w-0 flex-1 animate-pulse rounded-md bg-sidebar-accent group-data-[collapsed=true]/sidebar:hidden" />
      <div className="h-5 w-10 shrink-0 animate-pulse rounded-md bg-sidebar-accent group-data-[collapsed=true]/sidebar:hidden" />
      <div className="size-4 shrink-0 animate-pulse rounded bg-sidebar-accent group-data-[collapsed=true]/sidebar:hidden" />
    </div>
  );
}

function UserMenuSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="flex w-full items-center gap-3 rounded-lg px-2 py-2 group-data-[collapsed=true]/sidebar:w-9 group-data-[collapsed=true]/sidebar:justify-center group-data-[collapsed=true]/sidebar:gap-0 group-data-[collapsed=true]/sidebar:px-0 group-data-[collapsed=true]/sidebar:py-0"
    >
      <div className="size-8 shrink-0 animate-pulse rounded-lg bg-muted" />
      <div className="min-w-0 flex-1 space-y-1.5 group-data-[collapsed=true]/sidebar:hidden">
        <div className="h-3.5 w-24 animate-pulse rounded-md bg-muted" />
        <div className="h-3 w-32 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}

function MobileBusinessSwitcherSkeleton() {
  return <div className="size-8 animate-pulse rounded-lg bg-muted" />;
}

function MobileUserMenuSkeleton() {
  return <div className="size-8 animate-pulse rounded-lg bg-muted" />;
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase())
    .join("");
}
