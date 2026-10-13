"use client";

import { useMemo, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { RiDashboardLine } from "@remixicon/react";

import {
  Breadcrumb,
  BreadcrumbItem,
} from "@/components/shared/breadcrumb";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  ADMIN_ROOT_PATH,
  getActiveAdminNavigationItem,
  getAdminBreadcrumbs,
} from "@/features/admin/navigation";

/**
 * Admin topbar.
 *
 * Mirrors the business dashboard's two topbar variants in one element: below
 * `lg` it takes `MobileTopBar`'s metrics (`h-13`, `border-b`, `px-3`) since the
 * admin has no separate mobile bar, and at `lg` and above it takes the desktop
 * topbar's (`h-12`, no border, `dashboard-topbar-inner` supplies the padding)
 * with the same `Breadcrumb`. The user menu lives in the sidebar footer on
 * desktop, matching the main app; it only appears here below `lg`, where the
 * sidebar is not rendered.
 */
export function AdminHeader({ userSlot }: { userSlot: ReactNode }) {
  const pathname = usePathname();

  const breadcrumbs = useMemo(() => getAdminBreadcrumbs(pathname), [pathname]);
  const activeNavItem = getActiveAdminNavigationItem(pathname);
  const ActiveIcon = activeNavItem?.icon ?? RiDashboardLine;

  return (
    <div className="sticky top-0 z-30 flex h-13 items-center border-b border-border/70 bg-background px-3 lg:h-12 lg:items-stretch lg:border-b-0 lg:px-0">
      <header className="flex min-w-0 flex-1 items-center">
        <div className="dashboard-topbar-inner min-w-0 flex-1">
          <div className="flex min-h-9 min-w-0 items-center gap-2 md:gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="md:hidden">
                <BrandMark href={ADMIN_ROOT_PATH} size="default" subtitle={null} />
              </div>
              <div className="hidden min-w-0 md:block">
                <Breadcrumb aria-label="Pages">
                  {breadcrumbs.map((item, index) => {
                    const isLast = index === breadcrumbs.length - 1;

                    if (isLast || !item.href) {
                      return (
                        <BreadcrumbItem
                          key={`${item.label}-${item.href ?? index}`}
                          current
                          icon={ActiveIcon}
                          className="text-sm font-normal text-foreground"
                        >
                          {item.label}
                        </BreadcrumbItem>
                      );
                    }

                    return (
                      <BreadcrumbItem
                        key={`${item.label}-${item.href ?? index}`}
                        href={item.href}
                        className="text-sm text-muted-foreground hover:bg-transparent hover:text-foreground"
                      >
                        {item.label}
                      </BreadcrumbItem>
                    );
                  })}
                </Breadcrumb>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2 lg:hidden">
              {userSlot}
            </div>
          </div>
        </div>
      </header>
    </div>
  );
}
