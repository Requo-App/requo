"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  RiBriefcaseLine,
  RiDashboardLine,
  RiMenuLine,
  RiUserLine,
} from "@remixicon/react";

import { AdminFullscreenNav } from "@/features/admin/components/shell/admin-fullscreen-nav";
import {
  ADMIN_BUSINESSES_PATH,
  ADMIN_ROOT_PATH,
  ADMIN_USERS_PATH,
  isAdminNavigationItemActive,
} from "@/features/admin/navigation";
import { cn } from "@/lib/utils";

/**
 * The four destinations that fit a mobile dock. The remaining sections
 * (Product, AI, Operations, System) are reachable through "More", which opens
 * the fullscreen admin navigation — a 4-column bar cannot hold thirteen items.
 */
const dockItems = [
  { href: ADMIN_ROOT_PATH, label: "Overview", icon: RiDashboardLine },
  { href: ADMIN_BUSINESSES_PATH, label: "Businesses", icon: RiBriefcaseLine },
  { href: ADMIN_USERS_PATH, label: "Users", icon: RiUserLine },
] as const;

export function AdminMobileNav({ userSlot }: { userSlot: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isMoreActive =
    !moreOpen &&
    !dockItems.some((item) =>
      isAdminNavigationItemActive(pathname, item.href),
    ) &&
    pathname !== ADMIN_ROOT_PATH;

  return (
    <>
      <nav
        aria-label="Mobile admin navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background pb-[env(safe-area-inset-bottom)] text-foreground lg:hidden"
      >
        <div className="grid h-16 grid-cols-4 items-center px-1">
          {dockItems.map((item) => {
            const Icon = item.icon;
            const isActive = isAdminNavigationItemActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-1 py-1 text-xs transition-colors",
                  isActive
                    ? "font-semibold text-primary-ink"
                    : "font-medium text-muted-foreground hover:text-foreground active:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "flex size-7 items-center justify-center rounded-full transition-transform",
                    isActive && "bg-primary/10",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                </span>
                <span className="truncate leading-none">{item.label}</span>
              </Link>
            );
          })}

          <button
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            onClick={() => setMoreOpen(true)}
            className={cn(
              "flex h-full cursor-pointer flex-col items-center justify-center gap-1 py-1 text-xs transition-colors",
              isMoreActive
                ? "font-semibold text-primary-ink"
                : "font-medium text-muted-foreground hover:text-foreground active:text-foreground",
            )}
          >
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full transition-transform",
                isMoreActive && "bg-primary/10",
              )}
            >
              <RiMenuLine className="size-4" aria-hidden />
            </span>
            <span className="truncate leading-none">More</span>
          </button>
        </div>
      </nav>

      <AdminFullscreenNav
        open={moreOpen}
        onOpenChange={setMoreOpen}
        userSlot={userSlot}
      />
    </>
  );
}
