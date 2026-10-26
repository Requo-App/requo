import { DashboardPageSkeleton } from "@/components/shell/dashboard-page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Progressive shell skeleton for entering a business.
 *
 * Renders the inset shell frame immediately — seamless sidebar rail, content
 * card, and topbar — so users see the destination structure before the
 * business context resolves. Only dynamic parts (business name, avatar, nav
 * labels, page content) are skeletonized.
 */
export default function BusinessSlugLoading() {
  const navLabelWidths = ["w-16", "w-20", "w-14", "w-24", "w-16", "w-20", "w-14", "w-20"];

  return (
    <div
      className="flex h-svh min-w-0 flex-1 overflow-hidden bg-shell-frame"
      data-shell-root
    >
      {/* Seamless desktop rail — same geometry as the real sidebar. */}
      <aside
        aria-hidden="true"
        className="hidden h-full w-[14.5rem] shrink-0 flex-col bg-shell-frame p-2 lg:flex"
      >
        {/* Business switcher */}
        <div className="flex w-full items-center gap-2 px-2 py-1.5">
          <Skeleton className="size-8 shrink-0 rounded-lg" />
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="size-4 shrink-0 rounded-sm" />
        </div>

        {/* Quick search */}
        <div className="mt-3 flex w-full items-center gap-2 rounded-full bg-sidebar-accent px-2 py-1.5">
          <Skeleton className="size-5 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-14 rounded-md" />
        </div>

        {/* Navigation rows */}
        <div className="mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-hidden py-2">
          {navLabelWidths.map((width, index) => (
            <div className="flex w-full items-center gap-2 px-2 py-1.5" key={index}>
              <Skeleton className="size-[18px] shrink-0 rounded-sm" />
              <Skeleton className={`h-4 rounded-md ${width}`} />
            </div>
          ))}
        </div>

        {/* Theme + user menu */}
        <div className="flex w-full flex-col gap-3">
          <Skeleton className="h-9 w-20 rounded-full" />
          <div className="flex items-center gap-2 rounded-xl bg-sidebar-accent px-2 py-2">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-24 rounded-md" />
              <Skeleton className="h-3 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </aside>

      {/* Inset content card — edge-to-edge below lg. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col p-0 lg:p-2 lg:pl-0">
        <div
          className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-shell-card lg:rounded-xl lg:border lg:border-border lg:shadow-sm"
          data-slot="sidebar-inset"
        >
          {/* Mobile top app bar */}
          <div className="flex h-13 shrink-0 items-center gap-2 border-b border-border/70 bg-background px-3 lg:hidden">
            <Skeleton className="size-8 shrink-0 rounded-lg" />
            <Skeleton className="h-4 w-32 rounded-md" />
            <div className="flex-1" />
            <Skeleton className="size-9 shrink-0 rounded-full" />
          </div>

          {/* Desktop topbar */}
          <header className="hidden h-12 shrink-0 items-center px-4 lg:flex">
            <div className="flex w-full min-w-0 items-center justify-between gap-3">
              <Skeleton className="h-4 w-44 rounded-md" />
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          </header>

          {/* Page content skeleton — same inner scroll container as the shell. */}
          <div
            className="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain pb-28 lg:pb-0"
            data-shell-scroll
            data-slot="dashboard-scroll-area"
          >
            <main className="dashboard-main">
              <div className="dashboard-content">
                <DashboardPageSkeleton />
              </div>
            </main>
          </div>
        </div>
      </div>
    </div>
  );
}
