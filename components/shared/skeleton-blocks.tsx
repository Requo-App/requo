import { Skeleton } from "@/components/ui/skeleton";

/**
 * Shared skeleton atoms for list- and dashboard-page loading states.
 *
 * Each atom is byte-identical to the markup it replaces — same DOM
 * hierarchy, classes, responsive variants, and counts. Page-specific
 * markup (actions rows, desktop/mobile row content, section bodies and
 * panel variants) stays local to each consumer:
 *
 * - `StatTilesSkeleton`: dashboard + admin stat-tile grids (identical).
 * - `SectionHeaderSkeleton`: admin section headers and the dashboard wide
 *   section header (same bar, different title/action widths). The four
 *   dashboard grid sections keep a local header because their title sits
 *   inside an extra `flex flex-col gap-2` wrapper.
 * - `ListToolbarStripSkeleton`: quote library/services toolbar strips (same
 *   strip, grid, search, and count; services have one filter plus a second
 *   filter row, services has two filters).
 */
export function StatTilesSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, index) => (
        <div className="info-tile" key={index}>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-3 w-24 rounded-md" />
            <Skeleton className="h-8 w-16 rounded-md" />
            <Skeleton className="h-3 w-28 rounded-md" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionHeaderSkeleton({
  titleClassName = "h-6 w-32 rounded-md",
  actionClassName = "h-9 w-24 rounded-md sm:h-8",
}: {
  titleClassName?: string;
  actionClassName?: string;
} = {}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border/70 px-4 py-3 sm:px-5">
      <Skeleton className={titleClassName} />
      <Skeleton className={actionClassName} />
    </div>
  );
}

export function ListToolbarStripSkeleton({
  filterCount = 1,
  withSecondRow = false,
}: {
  filterCount?: 1 | 2;
  withSecondRow?: boolean;
} = {}) {
  return (
    <div className="data-list-toolbar-strip" aria-hidden="true">
      <div className="data-list-toolbar-grid">
        <Skeleton className="h-9 min-w-0 flex-1 rounded-md sm:h-8" />
        {Array.from({ length: filterCount }).map((_, index) => (
          <Skeleton
            className="h-9 w-full rounded-md sm:h-8 sm:max-w-44"
            key={index}
          />
        ))}
        <Skeleton className="hidden h-8 w-20 shrink-0 rounded-md sm:block" />
      </div>
      {withSecondRow && (
        <Skeleton className="h-9 w-full max-w-xs rounded-md sm:h-8" />
      )}
      <Skeleton className="h-4 w-28 rounded-md" />
    </div>
  );
}
