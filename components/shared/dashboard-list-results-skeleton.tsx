import { Skeleton } from "@/components/ui/skeleton";

type DashboardListResultsSkeletonProps = {
  variant?: "inquiries" | "quotes";
};

export function DashboardListResultsSkeleton({
  variant = "inquiries",
}: DashboardListResultsSkeletonProps) {
  const isInquiryList = variant === "inquiries";
  const tableColumns = isInquiryList
    ? "grid-cols-[1.8fr_1.3fr_1.3fr_0.9fr_1fr]"
    : "grid-cols-[1.8fr_1.4fr_0.9fr_0.9fr_1fr]";
  const rowSkeletonClasses = isInquiryList
    ? [
        "h-4 w-24 rounded-md",
        "h-4 w-24 rounded-md",
        "h-4 w-24 rounded-md",
        "h-6 w-24 rounded-full",
      ]
    : [
        "h-4 w-24 rounded-md",
        "h-4 w-24 rounded-md",
        "h-4 w-20 rounded-md",
        "h-6 w-24 rounded-full",
      ];

  return (
    <>
      <div className="hidden min-h-[440px] xl:block" aria-hidden="true">
        <div className="overflow-hidden">
          <div className={`grid gap-4 border-b border-border/60 px-4 py-2 ${tableColumns}`}>
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-3 w-full rounded-md" />
            ))}
          </div>

          <div className="divide-y divide-border/60">
            {Array.from({ length: 10 }).map((_, rowIndex) => (
              <div
                key={rowIndex}
                className={`grid gap-4 px-4 py-2 ${tableColumns}`}
              >
                <div className="flex flex-col gap-0.5">
                  <Skeleton className="h-4 w-32 rounded-md" />
                  <Skeleton className="h-4 w-40 rounded-md" />
                </div>
                {rowSkeletonClasses.map((className, index) => (
                  <Skeleton
                    key={index}
                    className={className}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2.5 p-4 min-h-[300px] xl:hidden" aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-3"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-36 rounded-md" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-3.5 w-48 rounded-md" />
              <div className="mt-0.5 flex items-center gap-2">
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-3 w-24 rounded-md" />
              </div>
            </div>
            <Skeleton className="size-4 shrink-0 rounded-full" />
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between" aria-hidden="true">
        <Skeleton className="h-4 w-40 rounded-md" />
        <Skeleton className="h-8 w-full max-w-xs rounded-md" />
      </div>
    </>
  );
}
