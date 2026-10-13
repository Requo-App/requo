import {
  SectionHeaderSkeleton,
  StatTilesSkeleton,
} from "@/components/shared/skeleton-blocks";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Generic section fallback for admin dashboard pages (overview, AI, usage,
 * system) while their aggregate queries stream in.
 *
 * Covers only the page body — the route `PageHeader` renders synchronously
 * above it, so the title paints instantly on sibling navigations.
 */
export function AdminSectionsFallback() {
  return (
    <div className="flex min-w-0 flex-col gap-6">
      <StatTilesSkeleton />

      <div className="grid gap-6 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <section
            className="section-panel space-y-4"
            data-padding="none"
            key={index}
          >
            <SectionHeaderSkeleton />
            <div className="flex flex-col gap-2 px-4 pb-4 sm:px-5 sm:pb-5">
              {Array.from({ length: 3 }).map((__, rowIndex) => (
                <Skeleton className="h-9 w-full rounded-lg" key={rowIndex} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
