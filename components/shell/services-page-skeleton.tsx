import { Skeleton } from "@/components/ui/skeleton";
import { ListToolbarStripSkeleton } from "@/components/shared/skeleton-blocks";

/**
 * Services page skeleton fallback — matches the structure of the
 * ServicesList shell (actions row + toolbar strip + table rows).
 */
export function ServicesPageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {/* Actions row */}
      <div className="flex items-center justify-between gap-3">
        <Skeleton className="h-4 w-20 rounded" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>

      {/* Results card */}
      <div className="dashboard-table-shell" data-list-card>
        <ListToolbarStripSkeleton filterCount={2} />

        {/* Mobile cards */}
        <div className="flex flex-col gap-2 p-3 sm:hidden">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-background px-4 py-3.5"
            >
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-4 w-36 max-w-full rounded-md" />
                <Skeleton className="h-3 w-28 max-w-full rounded-md" />
              </div>
              <Skeleton className="h-5 w-14 shrink-0 rounded-full" />
            </div>
          ))}
        </div>

        {/* Desktop table */}
        <div className="hidden sm:block">
          <div className="flex items-center gap-3 border-b border-border/60 px-4 py-3">
            <Skeleton className="h-4 w-20 rounded" />
            <Skeleton className="h-4 w-16 rounded" />
            <Skeleton className="ml-auto h-4 w-20 rounded" />
            <Skeleton className="h-8 w-8 rounded-md" />
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 border-b border-border/60 px-4 py-3 last:border-b-0"
            >
              <Skeleton className="size-9 shrink-0 rounded-lg" />
              <Skeleton className="h-4 w-40 max-w-full rounded" />
              <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
              <Skeleton className="ml-auto h-4 w-10 shrink-0 rounded" />
              <Skeleton className="size-8 shrink-0 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
