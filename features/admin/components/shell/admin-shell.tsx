"use client";

import type { ReactNode } from "react";

import { SidebarProvider } from "@/components/ui/sidebar";
import { AdminHeader } from "@/features/admin/components/shell/admin-header";
import { AdminMobileNav } from "@/features/admin/components/shell/admin-mobile-nav";
import { AdminSidebar } from "@/features/admin/components/shell/admin-sidebar";

export type AdminShellProps = {
  children: ReactNode;
  /** Streamed slot below the topbar (impersonation banner). */
  banner?: ReactNode;
  /** Streamed sidebar-footer user menu (Suspense-wrapped by the layout). */
  sidebarUserSlot: ReactNode;
  /** Streamed compact user menu for the mobile topbar. */
  headerUserSlot: ReactNode;
  /** Streamed user menu for the fullscreen mobile nav. */
  mobileNavUserSlot: ReactNode;
};

/**
 * Structural admin console shell.
 *
 * Deliberately mirrors `DashboardShellFrame`'s layout — the same sticky rail
 * column, `dashboard-topbar-inner` topbar, and `dashboard-main` /
 * `dashboard-content` content box — so the admin console reads as the same
 * product as the business dashboard. It is a separate component only because
 * `DashboardShellFrame` is business-slug coupled (business switcher,
 * notifications, onboarding checklist, assistant-route detection, unified
 * settings navigation), none of which apply here.
 *
 * `SidebarProvider` is kept for the shadcn sidebar context the shared
 * `SidebarMenu*` primitives inside the admin rail consume.
 */
export function AdminShell({
  children,
  banner,
  sidebarUserSlot,
  headerUserSlot,
  mobileNavUserSlot,
}: AdminShellProps) {
  // `data-admin-shell` on the outermost element is the "the admin chrome was
  // painted" hook for `tests/e2e/admin-authorization.spec.ts`. The no-flash
  // assertion watches for this attribute appearing in the DOM, so it must stay
  // here — moving it inward would let a partial paint read as no paint.
  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-svh flex-1 bg-background" data-admin-shell="">
        {/* Desktop rail — hidden below lg; mobile uses the topbar + bottom dock. */}
        <div className="sticky top-0 hidden h-svh shrink-0 self-start lg:block">
          <AdminSidebar userSlot={sidebarUserSlot} />
        </div>

        <div className="flex min-w-0 flex-1 flex-col" data-slot="sidebar-inset">
          <AdminHeader userSlot={headerUserSlot} />
          {banner}

          <div
            className="min-w-0 flex-1 pb-28 lg:pb-0"
            data-slot="dashboard-scroll-area"
          >
            <main className="dashboard-main">
              <div className="dashboard-content">{children}</div>
            </main>
          </div>

          <AdminMobileNav userSlot={mobileNavUserSlot} />
        </div>
      </div>
    </SidebarProvider>
  );
}
