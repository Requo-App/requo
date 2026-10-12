import { Skeleton } from "@/components/ui/skeleton";

export function LegalPageSkeleton({
  title,
  sections = 5,
}: {
  title: string;
  sections?: number;
}) {
  return (
    <div data-padding="none" className="section-panel mx-auto w-full max-w-4xl overflow-hidden">
      {/* Document header */}
      <div className="border-b border-border/70 px-5 py-6 sm:px-8 sm:py-8">
        <p className="meta-label">Effective date</p>
        <Skeleton className="mt-3 h-4 w-32 rounded-md" />
        <h1 className="mt-5 font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          {title}
        </h1>
      </div>

      {/* Document body skeleton */}
      <div className="px-5 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
          {Array.from({ length: sections }).map((_, i) => (
            <div className="flex flex-col gap-4" key={`section-${i}`}>
              <Skeleton className="h-7 w-48 rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-full rounded-md" />
              <Skeleton className="h-4 w-3/4 rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
