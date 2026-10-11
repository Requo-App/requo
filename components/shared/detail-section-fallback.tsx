import { Skeleton } from "@/components/ui/skeleton";

/**
 * Section-level fallback for detail-page region boundaries.
 *
 * Each detail feed (line items, payments, notes, activity, …) streams
 * behind its own Suspense boundary; this stands in for one section while
 * its query resolves. The page shell and sibling sections stay rendered,
 * so the fallback only has to match a section's heading + a few rows.
 */
export function DetailSectionFallback({ rows = 3 }: { rows?: number }) {
  return (
    <div className="section-panel space-y-4">
      <Skeleton className="h-5 w-40 rounded-md" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <Skeleton className="h-9 w-full rounded-lg" key={index} />
        ))}
      </div>
    </div>
  );
}

/**
 * `PageHeader`-shaped fallback for detail pages whose header is a
 * `PageHeader` rather than `DashboardDetailHeader` (invoice, service).
 */
export function DetailPageHeaderFallback() {
  return (
    <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="min-w-0 max-w-3xl flex-1">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-3 w-24 rounded-md" />
          <Skeleton className="h-6 w-full max-w-sm rounded-lg sm:h-7" />
          <Skeleton className="h-4 w-full max-w-2xl rounded-md" />
        </div>
      </div>
      <div className="dashboard-actions w-full sm:justify-end xl:w-auto">
        <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-28" />
        <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-24" />
      </div>
    </div>
  );
}

/**
 * Header fallback for detail pages while the core row resolves.
 *
 * The core query is a single indexed lookup, so this is brief — it only
 * covers the page/identity header, never the whole page. Mirrors the
 * proportions of `DashboardDetailPageSkeleton`'s header so the swap is
 * layout-stable.
 *
 * `titleClassName`/`descriptionClassName` exist only so the admin detail
 * fallback can reuse this exact structure with its own title/description
 * widths. Defaults preserve the existing shared output.
 */
export function DetailHeaderFallback({
  titleClassName = "h-5 w-full max-w-xl rounded-md sm:h-6",
  descriptionClassName = "h-4 w-full max-w-2xl rounded-md",
}: {
  titleClassName?: string;
  descriptionClassName?: string;
} = {}) {
  return (
    <header className="dashboard-detail-header">
      <div className="dashboard-detail-header-copy">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className={titleClassName} />
          <Skeleton className={descriptionClassName} />
        </div>
        <div className="dashboard-detail-header-meta">
          <Skeleton className="h-8 w-28 rounded-full" />
          <Skeleton className="h-8 w-32 rounded-full" />
        </div>
      </div>
      <div className="dashboard-detail-header-actions">
        <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-28" />
        <Skeleton className="h-9 w-full rounded-md sm:h-8 sm:w-24" />
      </div>
    </header>
  );
}
