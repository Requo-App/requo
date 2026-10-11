import { Skeleton } from "@/components/ui/skeleton";
import { ListToolbarStripSkeleton } from "@/components/shared/skeleton-blocks";

/**
 * Products page skeleton fallback — matches the structure of the
 * BusinessProductLibraryManager list shell (actions row + toolbar strip +
 * table rows).
 */
export function ProductsPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Actions row: usage hint + buttons */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-32 rounded" />
        <div className="flex flex-wrap justify-end gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      </div>

      {/* Results card */}
      <div className="dashboard-table-shell" data-list-card>
        <ListToolbarStripSkeleton filterCount={1} withSecondRow />

        {/* Desktop table rows */}
        <div className="hidden sm:block">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-40 max-w-full rounded" />
                <Skeleton className="h-3 w-32 max-w-full rounded" />
              </div>
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-10 shrink-0 rounded" />
              <Skeleton className="h-4 w-20 shrink-0 rounded" />
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>

        {/* Mobile rows */}
        <div className="divide-y divide-border/60 sm:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 px-4 py-3.5">
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <Skeleton className="h-4 w-36 max-w-full rounded" />
                <Skeleton className="h-3 w-24 max-w-full rounded" />
                <Skeleton className="h-4 w-16 rounded" />
              </div>
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
