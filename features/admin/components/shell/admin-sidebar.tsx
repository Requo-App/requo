"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";

import {
  DashboardSidebar,
  type DashboardNavGroup,
} from "@/components/shared/dashboard-sidebar";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  ADMIN_ROOT_PATH,
  getActiveAdminNavigationItem,
  getAdminSidebarNavGroups,
} from "@/features/admin/navigation";

export type AdminSidebarProps = {
  /** Streamed user menu slot (Suspense-wrapped by the console layout). */
  userSlot: ReactNode;
  /** Rendered inside the mobile drawer: always expanded, close button instead of collapse. */
  mobile?: boolean;
  onClose?: () => void;
  /** Expanded width fills its container instead of the fixed rail (fullscreen mobile nav). */
  flat?: boolean;
  /** When provided, Search opens the global record search dialog. */
  onQuickSearch?: () => void;
  className?: string;
};

/**
 * Admin sidebar wired to the same BoardUI `DashboardSidebar` the business
 * dashboard uses.
 *
 * Requo's product sidebar is not the shadcn `Sidebar` — it is `DashboardSidebar`
 * (mounted via `BoarduiMainSidebar`), which owns the 264px/60px morph, the
 * quick-search affordance, and the selected-row pill. The admin mounts that
 * component unchanged and only swaps the navigation data, so the console's
 * rail is pixel-identical to the main app's.
 */
export function AdminSidebar({
  userSlot,
  mobile = false,
  onClose,
  flat = false,
  onQuickSearch,
  className,
}: AdminSidebarProps) {
  const pathname = usePathname();

  const groups = useMemo<DashboardNavGroup[]>(
    () => getAdminSidebarNavGroups(),
    [],
  );

  const selected = useMemo(() => {
    return getActiveAdminNavigationItem(pathname)?.href ?? ADMIN_ROOT_PATH;
  }, [pathname]);

  const topSlot = (
    // `BrandMark` collapses on the shadcn `data-collapsible=icon` attribute;
    // the BoardUI rail uses `data-collapsed` instead, so the wordmark is hidden
    // here through the sidebar group variant.
    <div className="w-full min-w-0 overflow-hidden px-3 group-data-[collapsed=true]/sidebar:px-0">
      <BrandMark
        className="group-data-[collapsed=true]/sidebar:gap-0 group-data-[collapsed=true]/sidebar:[&>span:last-child]:hidden"
        href={ADMIN_ROOT_PATH}
        subtitle="Admin"
      />
    </div>
  );

  const bottomSlot = (
    <div className="flex w-full flex-col gap-2 group-data-[collapsed=true]/sidebar:items-center group-data-[collapsed=true]/sidebar:gap-0">
      <div
        aria-hidden="true"
        className="w-full shrink-0 border-t border-sidebar-border group-data-[collapsed=true]/sidebar:hidden"
      />
      {userSlot}
    </div>
  );

  return (
    <DashboardSidebar
      groups={groups}
      selected={selected}
      topSlot={topSlot}
      bottomSlot={bottomSlot}
      onQuickSearch={onQuickSearch}
      mobile={mobile}
      onClose={onClose}
      flat={flat}
      // The grouped nav owns the Settings entry, so the demo secondary rows
      // (Support / Settings) are hidden.
      hideSecondaryNav
      className={className}
    />
  );
}
