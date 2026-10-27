import {
  PublicHeroSurface,
  PublicPageShell,
} from "@/components/shared/public-page-shell";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type PublicRouteSkeletonProps = {
  variant?: "inquiry" | "quote";
  previewMode?: boolean;
};

export function PublicRouteSkeleton({
  variant = "inquiry",
  previewMode = false,
}: PublicRouteSkeletonProps) {
  if (variant === "inquiry") {
    return <InquiryRouteSkeleton previewMode={previewMode} />;
  }

  return (
    <PublicPageShell
      headerAction={<Skeleton className="h-10 w-36 rounded-lg" />}
      headerClassName="border-transparent bg-transparent [&::before]:opacity-0"
    >
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Left column — Quote content skeleton */}
        <PublicHeroSurface className="py-6 sm:py-8 lg:py-10">
          <div className="px-4 sm:px-6 lg:px-8">
            <QuotePreviewSkeleton />
          </div>
        </PublicHeroSurface>

        {/* Right column — Actions skeleton */}
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <QuoteInteractiveColumnSkeleton />
        </aside>
      </div>
    </PublicPageShell>
  );
}

function InquiryRouteSkeleton({ previewMode }: { previewMode: boolean }) {
  return (
    <div className="public-page">
      <div className="public-page-stack">
        {previewMode ? (
          <div className="rounded-none border-b border-primary/20 bg-primary/5 px-4 py-3 sm:px-6">
            <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3">
              <Skeleton className="h-5 w-24 rounded-md" />
              <div className="flex gap-2">
                <Skeleton className="h-10 w-32 rounded-xl" />
                <Skeleton className="hidden h-10 w-32 rounded-xl sm:block" />
              </div>
            </div>
          </div>
        ) : null}

        <header className="public-page-header max-sm:rounded-none max-sm:border-0 max-sm:px-1 max-sm:py-2 max-sm:shadow-none max-sm:before:opacity-0">
          <div className="flex min-w-0 items-center gap-3 sm:gap-4">
            <Skeleton className="size-14 rounded-2xl" />
            <div className="min-w-0 space-y-1.5 sm:space-y-2">
              <Skeleton className="h-6 w-40 rounded-md sm:h-7" />
              <Skeleton className="h-4 w-28 rounded-md" />
            </div>
          </div>
        </header>

        <section className="w-full py-4 sm:py-6 lg:py-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(28rem,1fr)] xl:items-start xl:gap-12">
            <div className="order-2 flex min-w-0 flex-col gap-6 xl:order-1 xl:gap-7">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-7 w-48 rounded-md sm:h-9" />
                <Skeleton className="h-4 w-full max-w-2xl rounded-md sm:h-5" />
                <Skeleton className="h-4 w-5/6 max-w-2xl rounded-md sm:h-5" />
              </div>

              <div className="grid w-full items-stretch gap-3 sm:gap-5">
                {Array.from({ length: 3 }).map((_, index) => (
                  <Card key={index} size="sm" className="w-full">
                    <CardHeader className="px-3.5 py-3 sm:px-5 sm:py-4">
                      <div className="flex items-center gap-3 sm:gap-3.5">
                        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/85 sm:size-9 sm:rounded-xl">
                          <Skeleton className="size-4 rounded-sm" />
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5 sm:gap-2">
                          <Skeleton className="h-4 w-32 rounded-md sm:h-5" />
                          <Skeleton className="h-3 w-48 rounded-md sm:h-4" />
                        </div>
                      </div>
                    </CardHeader>
                  </Card>
                ))}
              </div>
            </div>

            <InquiryFormSkeleton
              className={cn("order-1 xl:order-2 xl:sticky xl:top-6", previewMode && "xl:top-24")}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function InquiryFormSkeleton({ className }: { className?: string }) {
  return (
    <Card className={cn("gap-0 border-border/75 bg-card/96", className)}>
      <CardHeader className="gap-3 pb-5">
        <Skeleton className="h-8 w-44 rounded-lg" />
        <Skeleton className="h-4 w-full max-w-sm rounded-md" />
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-0">
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-12 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-xl" />
      </CardContent>
    </Card>
  );
}

function QuotePreviewSkeleton() {
  return (
    <div className="flex flex-col gap-5">
      {/* Header: Business + Quote title */}
      <header className="flex flex-col gap-5 pb-6 sm:pb-8">
        <div className="flex items-center gap-3">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-4 w-28 rounded-md" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-64 rounded-lg sm:h-9" />
          <Skeleton className="h-4 w-56 rounded-md" />
        </div>
      </header>

      {/* Line items */}
      <div className="flex min-h-[12rem] flex-col divide-y divide-border/50 border-t border-border/60 py-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            className="flex items-start justify-between gap-4 py-4"
            key={index}
          >
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40 rounded-md" />
              <Skeleton className="h-3 w-24 rounded-md" />
            </div>
            <Skeleton className="h-4 w-16 shrink-0 rounded-md" />
          </div>
        ))}
      </div>

      {/* Subtotals */}
      <div className="flex min-h-[7rem] flex-col gap-2 border-t border-border/60 pt-4 pb-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div className="flex items-center justify-between text-sm" key={index}>
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-4 w-20 rounded-md" />
          </div>
        ))}
        <div className="flex items-center justify-between border-t border-border/40 pt-2">
          <Skeleton className="h-5 w-12 rounded-md" />
          <Skeleton className="h-5 w-24 rounded-md" />
        </div>
      </div>

      {/* Terms placeholder */}
      <div className="min-h-[5rem] rounded-xl border border-border/50 px-4 py-4 sm:px-5">
        <Skeleton className="h-3 w-32 rounded-md" />
        <Skeleton className="mt-2.5 h-12 w-full rounded-md" />
      </div>
    </div>
  );
}

function QuoteInteractiveColumnSkeleton() {
  return (
    <div className="flex w-full flex-col gap-5">
      {/* Response actions card */}
      <div className="surface-card rounded-xl px-4 py-5 sm:p-6">
        <Skeleton className="mb-4 h-5 w-36 rounded-md" />
        <div className="flex flex-col gap-3">
          <Skeleton className="h-11 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        
        <div className="mt-4 border-t border-border/40 pt-4">
          <Skeleton className="h-9 w-full rounded-md" />
        </div>
      </div>
    </div>
  );
}
