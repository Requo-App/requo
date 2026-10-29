import { getAppShellContext } from "@/lib/app-shell/context";
import { requireSession } from "@/lib/auth/session";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";
import { getBusinessQuotaForUser } from "@/features/businesses/quota";
import { getThemePreferenceForUser } from "@/features/theme/queries";
import { ThemePreferenceSync } from "@/features/theme/components/theme-preference-sync";
import { getUiScalePreferenceForUser } from "@/features/theme/ui-scale-queries";
import { UiScaleSync } from "@/features/theme/components/ui-scale-sync";
import {
  BusinessSwitcher,
  MobileBusinessSwitcher,
} from "@/components/shell/dashboard-shell-slots";

/**
 * Shared streamed slots for the `(main)` and `settings` layouts.
 * Single home for the switcher/theme slots previously copy-pasted in both.
 */
export async function BusinessSwitcherSlot({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const { businessContext } = await getAppShellContext(businessSlug);
  const session = await requireSession();
  const allMemberships = await getBusinessMembershipsForUser(
    session.user.id,
    "all",
  );
  const memberships = allMemberships.filter(
    (m) => m.business.recordState !== "trash",
  );

  const businessQuota = await getBusinessQuotaForUser({
    ownerUserId: session.user.id,
  });

  return (
    <BusinessSwitcher
      currentBusiness={businessContext}
      memberships={memberships}
      businessQuota={businessQuota}
      userId={session.user.id}
      compact
    />
  );
}

export async function MobileBusinessSwitcherSlot({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const { businessContext } = await getAppShellContext(businessSlug);
  const session = await requireSession();
  const allMemberships = await getBusinessMembershipsForUser(
    session.user.id,
    "all",
  );
  const memberships = allMemberships.filter(
    (m) => m.business.recordState !== "trash",
  );

  const businessQuota = await getBusinessQuotaForUser({
    ownerUserId: session.user.id,
  });

  return (
    <MobileBusinessSwitcher
      currentBusiness={businessContext}
      memberships={memberships}
      businessQuota={businessQuota}
      userId={session.user.id}
    />
  );
}

export async function ThemeSyncSlot({
  businessSlug,
}: {
  businessSlug: string;
}) {
  const { user } = await getAppShellContext(businessSlug);
  const [themePreference, uiScale] = await Promise.all([
    getThemePreferenceForUser(user.id),
    getUiScalePreferenceForUser(user.id),
  ]);

  return (
    <>
      <ThemePreferenceSync themePreference={themePreference} userId={user.id} />
      <UiScaleSync uiScale={uiScale} userId={user.id} />
    </>
  );
}
