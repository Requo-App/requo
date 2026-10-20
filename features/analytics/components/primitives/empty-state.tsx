import { cn } from "@/lib/utils";

/**
 * The empty state for a chart with no data: one muted line in place of the
 * plot. The card keeps its header and footer so the page rhythm holds, and
 * the line sits in the middle of the space the plot would have taken.
 */
export function EmptyState({
  label = "No data in this period.",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-h-32 w-full flex-1 items-center justify-center px-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <p className="text-center">{label}</p>
    </div>
  );
}
