import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton placeholder for chart components.
 * Matches typical chart container dimensions (100% width, min-height 280px).
 * Adds < 2 KB JS and prevents CLS by reserving the full container space.
 */
export function ChartSkeleton() {
  return (
    <div className="flex h-full min-h-[280px] w-full flex-col gap-3 p-4">
      {/* Y-axis + chart area */}
      <div className="flex flex-1 gap-2">
        <div className="flex flex-col justify-between py-2">
          <Skeleton className="h-3 w-6 rounded-sm" />
          <Skeleton className="h-3 w-6 rounded-sm" />
          <Skeleton className="h-3 w-6 rounded-sm" />
          <Skeleton className="h-3 w-6 rounded-sm" />
        </div>
        <Skeleton className="flex-1 rounded-lg" />
      </div>
      {/* X-axis labels */}
      <div className="flex justify-between px-8">
        <Skeleton className="h-3 w-8 rounded-sm" />
        <Skeleton className="h-3 w-8 rounded-sm" />
        <Skeleton className="h-3 w-8 rounded-sm" />
        <Skeleton className="h-3 w-8 rounded-sm" />
        <Skeleton className="h-3 w-8 rounded-sm" />
      </div>
    </div>
  );
}
