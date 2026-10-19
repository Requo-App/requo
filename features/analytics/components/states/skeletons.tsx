import { DashboardToolbar } from "@/components/shared/dashboard-layout";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Analytics loading atoms. Each mirrors the markup it replaces (same grid
 * counts, card chrome, and row pitch) so route `loading.tsx`, section
 * Suspense fallbacks, and lazy-chart boundaries share one vocabulary and the
 * resolved page does not shift.
 */

export function AnalyticsKpiRowSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 analytics:grid-cols-6">
      {Array.from({ length: count }).map((_, index) => (
        <div
          className="analytics-card flex min-w-0 flex-col gap-2 p-4"
          key={index}
        >
          <Skeleton className="h-3.5 w-20 rounded-md" />
          <Skeleton className="h-6 w-24 rounded-md" />
          <Skeleton className="h-3 w-16 rounded-md" />
          <Skeleton className="mt-auto h-[var(--analytics-sparkline-height)] w-full rounded-md" />
        </div>
      ))}
    </div>
  );
}

/** Chart body only — used by lazy-chart boundaries and card fallbacks. */
export function AnalyticsChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("flex h-52 w-full flex-col gap-3 sm:h-[260px]", className)}>
      <div className="flex flex-1 gap-3">
        <div className="flex flex-col justify-between py-1">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-3 w-6 rounded-sm" />
          ))}
        </div>
        <Skeleton className="flex-1 rounded-md" />
      </div>
      <div className="flex justify-between px-10">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-8 rounded-sm" />
        ))}
      </div>
    </div>
  );
}

/** Full chart card: header bars + chart body. */
export function AnalyticsChartCardSkeleton({
  className,
  bodyHeight,
}: {
  className?: string;
  bodyHeight?: string;
}) {
  return (
    <div
      className={cn(
        "analytics-card flex min-w-0 flex-col gap-4 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40 rounded-md" />
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
        "analytics-card flex min-w-0 flex-col gap-4 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-44 rounded-md" />
        <Skeleton className="h-3.5 w-72 rounded-md" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            className="flex h-11 items-center gap-3 border-b border-border/50 last:border-0"
            key={index}
          >
            <Skeleton className="h-3.5 w-40 rounded-md" />
            <Skeleton className="ml-auto h-3.5 w-12 rounded-md" />
            <Skeleton className="h-3.5 w-14 rounded-md" />
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
        "analytics-card flex min-w-0 flex-col gap-4 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-48 rounded-md" />
        <Skeleton className="h-3.5 w-64 rounded-md" />
      </div>
      <div className="flex flex-col">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            className="flex h-12 items-center gap-3 border-b border-border/40 last:border-0"
            key={index}
          >
            <Skeleton className="size-4 shrink-0 rounded-full" />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-36 rounded-md" />
              <Skeleton className="h-3 w-48 rounded-md" />
            </div>
            <Skeleton className="h-3.5 w-8 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** A row of bar placeholders, matching the `BarList` shape. */
export function AnalyticsBarsSkeleton({
  rows = 4,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "analytics-card flex min-w-0 flex-col gap-4 p-4 sm:p-5",
        className,
      )}
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-3.5 w-64 rounded-md" />
      </div>
      <div className="flex flex-col gap-3.5">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="flex flex-col gap-1.5" key={index}>
            <div className="flex items-baseline justify-between gap-3">
              <Skeleton className="h-3.5 w-32 rounded-md" />
              <Skeleton className="h-3.5 w-10 rounded-md" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
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
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-24 rounded-md" />
        <AnalyticsKpiRowSkeleton />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <AnalyticsChartCardSkeleton className="md:col-span-6" />
          <AnalyticsChartCardSkeleton className="md:col-span-6" />
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <AnalyticsChartCardSkeleton className="md:col-span-6" />
          <AnalyticsChartCardSkeleton className="md:col-span-6" />
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton className="h-3 w-16 rounded-md" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
          <AnalyticsListSkeleton rows={4} className="md:col-span-6" />
          <AnalyticsListSkeleton rows={2} className="md:col-span-6" />
        </div>
        <AnalyticsListSkeleton rows={1} />
      </div>
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
