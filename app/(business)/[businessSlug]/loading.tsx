import { BrandMark } from "@/components/shared/brand-mark";
import { DashboardPageSkeleton } from "@/components/shell/dashboard-page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Progressive shell skeleton for entering a business.
 *
 * Renders the structural sidebar and topbar frame immediately with real
 * chrome (brand mark, nav item shapes, separator lines) so users see the
 * app structure before the business context resolves. Only dynamic parts
 * (business name, avatar, plan badge, nav labels) are skeletonized.
 */
export default function BusinessSlugLoading() {
  return (
    <div className="group/sidebar-wrapper flex min-h-svh w-full bg-background">
      {/* Sidebar frame — structural chrome renders immediately */}
      <div className="group peer hidden text-sidebar-foreground lg:block">
        <div
          className="relative w-(--sidebar-width) bg-transparent transition-[width]"
          data-slot="sidebar-gap"
        />
        <div
          className="fixed inset-y-0 left-0 z-10 hidden h-svh w-(--sidebar-width) border-r border-border/70 lg:flex"
          data-slot="sidebar-container"
        >
          <div className="flex size-full flex-col bg-sidebar">
            {/* Real brand mark renders immediately */}
            <div className="flex h-12 items-center justify-between border-b border-sidebar-border px-3.5">
              <BrandMark collapseLabel className="min-w-0 px-2 py-1.5" subtitle={null} />
            </div>
            {/* Business switcher skeleton */}
            <div className="px-3 py-3">
              <div className="w-full rounded-xl border border-sidebar-border/90 bg-background/92 p-3.5">
                <div className="flex items-start gap-3.5">
                  <Skeleton className="size-14 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3 w-14 rounded-md" />
                    <Skeleton className="h-4 w-28 rounded-md" />
                    <Skeleton className="h-3.5 w-20 rounded-md" />
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
              </div>
            </div>
            {/* Navigation items skeleton */}
            <div className="flex flex-1 flex-col gap-1 px-3 py-3">
              {Array.from({ length: 6 }).map((_, index) => (
                <Skeleton className="h-8 w-full rounded-md" key={index} />
              ))}
            </div>
            {/* User menu skeleton */}
            <div className="border-t border-sidebar-border px-3 py-3">
              <div className="flex items-center gap-3 rounded-lg px-2 py-2">
                <Skeleton className="size-9 rounded-lg" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24 rounded-md" />
                  <Skeleton className="h-3 w-36 rounded-md" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <main className="relative flex min-w-0 flex-1 flex-col bg-transparent">
        {/* Topbar — structural frame with minimal skeletons */}
        <header className="dashboard-topbar flex h-12 items-center">
          <div className="dashboard-topbar-inner">
            <div className="flex min-h-8 min-w-0 flex-wrap items-center gap-3 md:flex-nowrap">
              <Skeleton className="size-8 shrink-0 rounded-lg" />
              <span
                aria-hidden="true"
                className="hidden h-4 w-px shrink-0 self-center bg-border md:block"
              />
              <div className="min-w-0 flex-1">
                <Skeleton className="h-4 w-44 rounded-md" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="hidden h-8 w-64 rounded-lg md:block lg:w-80" />
                <Skeleton className="size-8 rounded-lg" />
              </div>
            </div>
          </div>
        </header>

        {/* Page content skeleton */}
        <div className="flex flex-1 flex-col">
          <div className="dashboard-main">
            <div className="dashboard-content">
              <DashboardPageSkeleton />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
