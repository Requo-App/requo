import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Structural loading state for the marketing home page.
 * Mirrors the section order and anatomy of MarketingHero: hero (left-aligned
 * headline, CTAs, device frame), Why Requo, How it works, Business features,
 * FAQ, final CTA, and footer.
 */
export default function MarketingHomeLoading() {
  return (
    <div className="marketing-landing overflow-x-clip">
      {/* Hero section */}
      <section className="relative overflow-hidden pb-16 pt-8 sm:pb-24 sm:pt-10 lg:pb-32 lg:pt-12">
        <div className="marketing-shell-container relative z-10 flex flex-col">
          <div className="flex w-full max-w-4xl flex-col items-start gap-3">
            <Skeleton className="h-5 w-60 max-w-full rounded-md" />
            <div className="flex w-full flex-col gap-3">
              <Skeleton className="h-12 w-full max-w-xl rounded-lg sm:h-16 lg:h-20" />
              <Skeleton className="h-12 w-72 max-w-full rounded-lg sm:h-16 lg:h-20" />
            </div>
          </div>
          <div className="mt-4 flex w-full flex-col gap-2">
            <Skeleton className="h-5 w-full max-w-[36ch] rounded-md" />
            <Skeleton className="h-5 w-4/5 max-w-[30ch] rounded-md" />
          </div>
          <div className="mt-6 flex w-full flex-col gap-4 sm:w-auto sm:flex-row sm:items-center">
            <Skeleton className="h-11 w-full rounded-lg sm:h-12 sm:w-36" />
            <Skeleton className="h-11 w-full rounded-lg sm:h-12 sm:w-36" />
          </div>

          {/* Product window */}
          <div className="marketing-hero-visual mt-6 w-full sm:mt-8 lg:mt-12">
            <div className="dashboard-stage-container w-full">
              <div className="dashboard-stage-aspect marketing-hero-frame animate-pulse bg-muted/30" />
            </div>
          </div>
        </div>
      </section>

      {/* Why Requo section */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:px-0 xl:py-24">
        <div className="grid gap-6 lg:grid-cols-3 lg:items-baseline-last lg:gap-x-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Skeleton className="h-4 w-24 rounded-md" />
            <div className="flex w-full max-w-[50rem] flex-col gap-2">
              <Skeleton className="h-9 w-full rounded-lg sm:h-10 lg:h-14" />
              <Skeleton className="h-9 w-full rounded-lg sm:h-10 lg:h-14" />
              <Skeleton className="h-9 w-4/5 rounded-lg sm:h-10 lg:h-14" />
            </div>
          </div>
          <Skeleton className="h-20 w-full max-w-[36ch] rounded-md lg:mb-1" />
        </div>

        <div className="mt-9 grid gap-5 lg:mt-[3.25rem] lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              className="mx-auto flex h-full w-full max-w-[35rem] flex-col lg:max-w-none"
              key={`why-card-${i}`}
            >
              <Skeleton className="h-60 w-full rounded-lg" />
              <div className="flex flex-1 flex-col pb-6">
                <div className="mt-7 flex items-center gap-3">
                  <Skeleton className="h-3 w-6 rounded-md" />
                  <span className="h-px flex-1 bg-border" />
                </div>
                <div className="mt-4 flex flex-col gap-2">
                  <Skeleton className="h-5 w-4/5 rounded-md" />
                  <Skeleton className="h-5 w-3/5 rounded-md" />
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-2/3 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works section */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:px-0 xl:py-24">
        <div className="grid gap-6 lg:grid-cols-3 lg:items-baseline-last lg:gap-x-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Skeleton className="h-4 w-28 rounded-md" />
            <div className="flex w-full max-w-[50rem] flex-col gap-2">
              <Skeleton className="h-9 w-full rounded-lg sm:h-10 lg:h-14" />
              <Skeleton className="h-9 w-2/3 rounded-lg sm:h-10 lg:h-14" />
            </div>
          </div>
          <Skeleton className="h-20 w-full max-w-[36ch] rounded-md" />
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 sm:mt-10 lg:mt-14 lg:grid-cols-3 lg:items-start lg:gap-x-5">
          <div className="order-1 flex h-[22rem] items-center justify-center p-5 sm:h-[24rem] sm:p-8 lg:order-2 lg:col-span-2 lg:h-[26rem] lg:p-10">
            <Skeleton className="h-full w-full rounded-xl lg:w-[94%]" />
          </div>

          <div className="order-2 flex flex-col gap-5 lg:order-1 lg:col-span-1 lg:gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div className="flex gap-5" key={`workflow-step-${i}`}>
                <div
                  className={cn(
                    "w-0.5 shrink-0 rounded-full",
                    i === 0 ? "bg-primary/50" : "bg-border",
                  )}
                />
                <div className="flex flex-1 flex-col">
                  <Skeleton className="h-3 w-16 rounded-md" />
                  <Skeleton
                    className={cn(
                      "mt-1 h-5 rounded-md",
                      ["w-40", "w-44", "w-52", "w-52"][i],
                    )}
                  />
                  {i === 0 ? (
                    <div className="mt-2 flex flex-col gap-1.5">
                      <Skeleton className="h-3.5 w-full rounded-md" />
                      <Skeleton className="h-3.5 w-5/6 rounded-md" />
                      <Skeleton className="h-3.5 w-2/3 rounded-md" />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Requo business section */}
      <section className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8 lg:py-20 xl:px-0 xl:py-24">
        <div className="grid gap-6 lg:grid-cols-3 lg:items-baseline-last lg:gap-x-5">
          <div className="flex flex-col gap-4 lg:col-span-2">
            <Skeleton className="h-4 w-40 rounded-md" />
            <div className="flex w-full max-w-[50rem] flex-col gap-2">
              <Skeleton className="h-9 w-full rounded-lg sm:h-10 lg:h-14" />
              <Skeleton className="h-9 w-3/4 rounded-lg sm:h-10 lg:h-14" />
            </div>
          </div>
          <Skeleton className="h-20 w-full max-w-[36ch] rounded-md" />
        </div>

        <div className="mt-14 flex flex-col gap-12 lg:mt-16 lg:gap-16">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              className={cn(
                "grid gap-y-8 lg:items-center lg:gap-x-14",
                i % 2 === 1
                  ? "lg:grid-cols-[7fr_5fr]"
                  : "lg:grid-cols-[5fr_7fr]",
              )}
              key={`feature-row-${i}`}
            >
              <div
                className={cn(
                  "flex flex-col gap-3",
                  i % 2 === 1 && "lg:order-2",
                )}
              >
                <Skeleton className="h-3 w-20 rounded-md" />
                <Skeleton className="h-7 w-4/5 rounded-md" />
                <div className="flex flex-col gap-2 pt-1">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-2/3 rounded-md" />
                </div>
              </div>
              <Skeleton
                className={cn(
                  "h-[18.75rem] w-full rounded-lg",
                  i % 2 === 1 && "lg:order-1",
                )}
              />
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 w-full max-w-4xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0">
        <div className="flex flex-col items-start gap-3 sm:gap-4">
          <Skeleton className="h-10 w-full max-w-lg rounded-lg sm:h-14" />
          <Skeleton className="h-4 w-full max-w-xl rounded-md" />
        </div>

        <div className="mt-8 flex flex-col gap-8 sm:mt-10 sm:gap-10">
          {Array.from({ length: 3 }).map((_, groupIndex) => (
            <div className="flex flex-col gap-3" key={`faq-group-${groupIndex}`}>
              <Skeleton className="h-4 w-28 rounded-md" />
              <div className="border-t border-border/70">
                {Array.from({ length: 4 }).map((_, qIndex) => (
                  <div
                    className="flex items-center justify-between gap-4 border-b border-border/70 py-3.5"
                    key={qIndex}
                  >
                    <Skeleton className="h-4 w-3/4 rounded-md" />
                    <Skeleton className="size-4 shrink-0 rounded-sm" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA section */}
      <section className="marketing-cta-shell mt-24 sm:mt-32 lg:mt-40">
        <div className="marketing-cta-panel flex flex-col items-center">
          <Skeleton className="h-9 w-full max-w-xl rounded-lg sm:h-12" />
          <Skeleton className="mt-4 h-5 w-80 max-w-full rounded-md" />
          <div className="marketing-cta-actions">
            <Skeleton className="h-11 w-full rounded-lg sm:w-32" />
            <Skeleton className="h-11 w-full rounded-lg sm:w-32" />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="marketing-footer w-full text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-12 px-4 py-16 sm:px-6 lg:flex-row lg:items-start lg:gap-16 lg:px-8 xl:px-0">
          <div className="flex flex-col justify-between self-stretch">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="mt-14 hidden h-3 w-48 rounded-md lg:block" />
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 sm:gap-10 lg:grid-cols-5 lg:gap-12 xl:gap-16">
            {Array.from({ length: 5 }).map((_, columnIndex) => (
              <div className="flex flex-col gap-3.5" key={columnIndex}>
                <Skeleton className="h-3 w-16 rounded-md" />
                {Array.from({ length: 3 }).map((_, linkIndex) => (
                  <Skeleton className="h-3.5 w-24 rounded-md" key={linkIndex} />
                ))}
              </div>
            ))}
          </div>
          <Skeleton className="h-3 w-48 rounded-md lg:hidden" />
        </div>
      </footer>
    </div>
  );
}
