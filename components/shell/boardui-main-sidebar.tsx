"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  DashboardSidebar,
  type DashboardNavGroup,
  type DashboardNavItem,
} from "@/components/shared/dashboard-sidebar";
import {
  getDashboardNavigation,
  isDashboardNavigationItemActive,
  type DashboardNavigationSection,
} from "@/components/shell/dashboard-navigation";
import { useNavBadges } from "@/components/shell/nav-badge-context";
import { getBusinessInquiriesPath } from "@/features/businesses/routes";
import { getDefaultBusinessSettingsPath } from "@/features/settings/navigation";
import type { BusinessMemberRole } from "@/lib/business-members";

type BoarduiMainSidebarProps = {
  businessSlug: string;
  /**
   * Role used for role-gated items. The structural shell renders instantly
   * from the slug alone, so it passes the owner set — route access itself is
   * still enforced server-side.
   */
  role?: BusinessMemberRole;
  /** Rendered at the top of the sidebar in place of the demo business menu. */
  topSlot?: ReactNode;
  /** Rendered at the bottom of the sidebar in place of the demo team card. */
  bottomSlot?: ReactNode;
  /** When provided, Search opens the global record search dialog. */
  onQuickSearch?: () => void;
  /** Rendered inside the mobile drawer: always expanded, close button instead of collapse. */
  mobile?: boolean;
  onClose?: () => void;
  /** Hides the Settings row (e.g. mobile nav owns its own footer). */
  hideSecondaryNav?: boolean;
  /** Extra classes merged onto the sidebar panel (e.g. fullscreen overrides). */
  className?: string;
};

/**
 * Main dashboard sidebar wired to the BoardUI Sidebar following the docs
 * usage example (`DashboardSidebar` with `groups` + `selected`).
 *
 * Requo navigation (hrefs, labels, icons, active states) is mapped onto
 * BoardUI's `DashboardNavGroup[]` (Home standalone, then Sales and Business);
 * the Settings row points at the business settings entry.
 */
export function BoarduiMainSidebar({
  businessSlug,
  role = "owner",
  topSlot,
  bottomSlot,
  onQuickSearch,
  mobile = false,
  onClose,
  hideSecondaryNav = false,
  className,
}: BoarduiMainSidebarProps) {
  const pathname = usePathname();
  const { inquiryUnreadCount } = useNavBadges();

  const navigation = useMemo(
    () => getDashboardNavigation(businessSlug, role),
    [businessSlug, role],
  );

  const inquiriesHref = getBusinessInquiriesPath(businessSlug);

  const groups = useMemo<DashboardNavGroup[]>(() => {
    const sectionLabels: Record<DashboardNavigationSection, string> = {
      sales: "Sales",
      business: "Business",
    };
    const bySection = new Map<DashboardNavigationSection, DashboardNavItem[]>();
    const standalone: DashboardNavItem[] = [];

    for (const item of navigation) {
      const navItem: DashboardNavItem = {
        key: item.href,
        label: item.label,
        icon: item.icon,
        href: item.href,
        // Shared unread badge: hidden while streaming (null) and at zero.
        ...(item.href === inquiriesHref &&
        inquiryUnreadCount !== null &&
        inquiryUnreadCount > 0
          ? {
              badge: inquiryUnreadCount,
              badgeLabel: `${inquiryUnreadCount} unread`,
            }
          : {}),
      };

      if (!item.section) {
        standalone.push(navItem);
        continue;
      }

      const sectionItems = bySection.get(item.section) ?? [];
      sectionItems.push(navItem);
      bySection.set(item.section, sectionItems);
    }

    return [
      ...(standalone.length > 0 ? [{ items: standalone }] : []),
      ...(
        Object.entries(sectionLabels) as Array<
          [DashboardNavigationSection, string]
        >
      )
        .map(([section, label]) => ({
          label,
          items: bySection.get(section) ?? [],
        }))
        .filter((group) => group.items.length > 0),
    ];
  }, [navigation, inquiriesHref, inquiryUnreadCount]);

  const selected = useMemo(
    () =>
      navigation.find((item) =>
        isDashboardNavigationItemActive(pathname, item.href),
      )?.href ??
      navigation[0]?.href ??
      "home",
    [navigation, pathname],
  );

  return (
    <DashboardSidebar
      groups={groups}
      selected={selected}
      topSlot={topSlot}
      bottomSlot={bottomSlot}
      settingsHref={getDefaultBusinessSettingsPath(businessSlug, role)}
      onQuickSearch={onQuickSearch}
      mobile={mobile}
      onClose={onClose}
      hideSecondaryNav={hideSecondaryNav}
      inset
      className={className}
    />
  );
}
