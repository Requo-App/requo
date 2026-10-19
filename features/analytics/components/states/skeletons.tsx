import { DashboardToolbar } from "@/components/shared/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Analytics loading atoms. Each mirrors the markup it replaces (same grid
 * counts, card chrome, and row pitch) so route `loading.tsx`, section
 * Suspense fallbacks, and lazy-chart boundaries share one vocabulary.
 */

export function AnalyticsKpiRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="flex min-w-0 flex-col rounded-xl border border-border/60 bg-card p-2"
          key={index}
        >
          <div className="flex w-full items-start justify-between gap-2.5 p-2">
            <Skeleton className="size-9 rounded-xl" />
            <Skeleton className="size-4 rounded-full" />
          </div>
          <div className="flex flex-col gap-1 px-2 pt-2.5 pb-3.5">
            <Skeleton className="h-3.5 w-20 rounded-md" />
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="mt-1.5 h-7 w-full rounded-md" />
          </div>
          <div className="mt-auto flex items-center justify-between gap-2 rounded-xl bg-muted px-2.5 py-1.5">
            <Skeleton className="h-3 w-16 rounded-md" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Chart body only — used by lazy-chart boundaries and card fallbacks. */
export function AnalyticsChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-64 w-full flex-col gap-3 sm:h-72", className)}>
      <div className="flex flex-1 gap-2">
        <div className="flex flex-col justify-between py-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-6 rounded-sm" />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-lg" />
      </div>
      <div className="flex justify-between px-8">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-8 rounded-sm" />
        ))}
      </div>
    </div>
  );
}

/** Full chart card: header bars + chart body. */
export function AnalyticsChartCardSkeleton({
  className,
  bodyHeight = "h-64 sm:h-72",
}: {
  className?: string;
  bodyHeight?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/60 bg-card px-4 py-4 sm:px-5 sm:py-5",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-40 rounded-md" />
        <Skeleton className="h-3.5 w-64 rounded-md" />
      </div>
      <AnalyticsChartSkeleton className={bodyHeight} />
    </div>
  );
}

export function AnalyticsTableSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/60 bg-card px-4 py-4 sm:px-5 sm:py-5",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-44 rounded-md" />
        <Skeleton className="h-3.5 w-72 rounded-md" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            className="flex items-center gap-3 border-b border-border/60 py-3 last:border-0"
            key={index}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
            <Skeleton className="h-4 w-14 rounded-md" />
            <Skeleton className="h-4 w-14 rounded-md" />
            <Skeleton className="hidden h-4 w-16 rounded-md sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function AnalyticsListSkeleton({
  rows = 5,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-xl border border-border/60 bg-card px-4 py-4 sm:px-5 sm:py-5",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-5 w-48 rounded-md" />
        <Skeleton className="h-3.5 w-64 rounded-md" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="flex items-center gap-3" key={index}>
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-4 w-36 rounded-md" />
              <Skeleton className="h-3 w-48 rounded-md" />
            </div>
            <Skeleton className="h-6 w-8 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Toolbar placeholder, mirroring `AnalyticsToolbar`: inline controls on
 * desktop, one summary button on phones. The page's header actions boundary
 * and route `loading.tsx` share it so the controls never double-paint.
 */
export function AnalyticsToolbarSkeleton() {
  return (
    <>
      <DashboardToolbar className="hidden items-center gap-2 sm:flex">
        <Skeleton className="h-8 w-32 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
        <Skeleton className="h-8 w-24 rounded-md" />
      </DashboardToolbar>
      <div className="flex w-full items-center gap-2 sm:hidden">
        <Skeleton className="h-8 w-full rounded-md" />
      </div>
    </>
  );
}

/** Tab bar plus freshness caption placeholder. */
export function AnalyticsTabBarSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-1">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-8 w-24 rounded-md" />
        ))}
      </div>
      <Skeleton className="h-4 w-24 rounded-md" />
    </div>
  );
}

/** Overview tab body, the default tab route loading falls back to. */
export function AnalyticsOverviewTabSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsKpiRowSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsChartCardSkeleton />
        <AnalyticsChartCardSkeleton />
      </div>
      <AnalyticsChartCardSkeleton />
      <div className="grid gap-4 lg:grid-cols-2">
        <AnalyticsListSkeleton rows={2} />
        <AnalyticsListSkeleton />
      </div>
      <AnalyticsListSkeleton rows={3} />
    </div>
  );
}

/** Content region placeholder: tab bar plus the default Overview tab. */
export function AnalyticsContentSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <AnalyticsTabBarSkeleton />
      <AnalyticsOverviewTabSkeleton />
    </div>
  );
}
