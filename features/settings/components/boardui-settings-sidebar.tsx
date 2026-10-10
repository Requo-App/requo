"use client";

import {
  Astroid,
  Bell,
  BookOpen,
  Building2,
  Receipt,
  FileText,
  LifeBuoy,
  Mail,
  Palette,
  ScrollText,
  Tag,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  DashboardSidebar,
  type DashboardNavGroup,
} from "@/components/shared/dashboard-sidebar";
import type { SettingsNavigationGroup } from "@/features/settings/navigation";

/**
 * String-icon map mirroring `settingsIcons` in `settings-shell-frame.tsx`.
 * Kept local so the frame can import this adapter without a module cycle.
 */
const boarduiSettingsIcons: Record<string, LucideIcon> = {
  user: User,
  users: Users,
  palette: Palette,
  bell: Bell,
  building: Building2,
  astroid: Astroid,
  receipt: Receipt,
  "file-text": FileText,
  mail: Mail,
  tag: Tag,
  book: BookOpen,
  "life-buoy": LifeBuoy,
  scroll: ScrollText,
};

type BoarduiSettingsSidebarProps = {
  businessSlug: string;
  groups: SettingsNavigationGroup[];
  /** Rendered at the top of the sidebar in place of the demo workspace menu. */
  topSlot?: ReactNode;
  /** Rendered at the bottom of the sidebar in place of the demo team card. */
  bottomSlot?: ReactNode;
  /** Rendered inside the mobile drawer: always expanded, close button instead of collapse. */
  mobile?: boolean;
  onClose?: () => void;
  /** Hide the app-level theme control (e.g. mobile nav owns its own chrome). */
  showThemeToggle?: boolean;
  /** Extra classes merged onto the sidebar panel (e.g. fullscreen overrides). */
  className?: string;
};

/**
 * Settings sidebar wired to the BoardUI Sidebar (`DashboardSidebar` with
 * `groups` + `selected`).
 *
 * The User / Workspace / Other navigation groups render as labeled
 * sections; the demo secondary Support/Settings rows are hidden because
 * the settings shell owns its own navigation (Help & Support lives in the
 * Other group).
 */
export function BoarduiSettingsSidebar({
  businessSlug: _businessSlug,
  groups,
  topSlot,
  bottomSlot,
  mobile = false,
  onClose,
  showThemeToggle = true,
  className,
}: BoarduiSettingsSidebarProps) {
  const pathname = usePathname();

  const flatItems = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups],
  );

  const navGroups = useMemo<DashboardNavGroup[]>(
    () =>
      groups.map((group) => ({
        label: group.label,
        items: group.items.map((item) => ({
          key: item.href,
          label: item.label,
          icon: boarduiSettingsIcons[item.icon] ?? User,
          href: item.href,
        })),
      })),
    [groups],
  );

  const selected = useMemo(() => {
    const match = flatItems
      .filter(
        (item) =>
          pathname === item.href || pathname.startsWith(`${item.href}/`),
      )
      .sort((a, b) => b.href.length - a.href.length)[0];

    return match?.href ?? flatItems[0]?.href ?? "settings";
  }, [flatItems, pathname]);

  return (
    <DashboardSidebar
      groups={navGroups}
      selected={selected}
      topSlot={topSlot}
      bottomSlot={bottomSlot}
      hideSecondaryNav
      mobile={mobile}
      onClose={onClose}
      showThemeToggle={showThemeToggle}
      className={className}
    />
  );
}
