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
    <div className="overflow-x-clip">
      {/* Hero section */}
      <section className="relative overflow-hidden px-4 pb-16 pt-10 sm:px-6 sm:pb-28 sm:pt-16 lg:px-8 lg:pb-36 lg:pt-24 xl:px-0">
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-start gap-8 sm:gap-10 lg:gap-12">
          <div className="flex w-full max-w-4xl flex-col items-start gap-4 sm:gap-5">
            <div className="flex flex-col gap-3">
              <Skeleton className="h-12 w-full max-w-xl rounded-lg sm:h-16 lg:h-20" />
              <Skeleton className="h-12 w-72 max-w-full rounded-lg sm:h-16 lg:h-20" />
            </div>
            <Skeleton className="h-5 w-full max-w-lg rounded-md sm:h-6" />
            <div className="flex flex-row items-center gap-3 pt-2">
              <Skeleton className="h-11 w-36 rounded-lg" />
              <Skeleton className="h-11 w-32 rounded-lg" />
            </div>
          </div>

          {/* Device frame */}
          <div className="w-full">
            <Skeleton className="h-72 w-full rounded-xl sm:h-96 lg:h-[30rem]" />
          </div>
        </div>
      </section>

      <div className="border-b border-border/70" />

      {/* Why Requo section */}
      <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-12 xl:gap-16">
          <div className="flex flex-col gap-4">
            <Skeleton className="h-4 w-24 rounded-md" />
            <Skeleton className="h-10 w-full max-w-lg rounded-lg sm:h-14" />
          </div>
          <div className="flex items-center">
            <Skeleton className="h-4 w-full max-w-md rounded-md" />
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:mt-16 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3 lg:gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              className="flex h-full flex-col overflow-hidden rounded-2xl border border-border/70 bg-card"
              key={`why-card-${i}`}
            >
              <Skeleton className="aspect-[16/9] w-full rounded-none" />
              <div className="flex flex-col gap-5 p-6 sm:p-7">
                <div className="flex items-center justify-between">
                  <Skeleton className="size-11 rounded-xl" />
                  <Skeleton className="h-3 w-6 rounded-md" />
                </div>
                <Skeleton className="h-5 w-4/5 rounded-md" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-4 w-full rounded-md" />
                  <Skeleton className="h-4 w-3/4 rounded-md" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works section */}
      <section className="mx-auto mt-24 w-full max-w-6xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0">
        <div className="mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-10 w-full max-w-lg rounded-lg sm:h-14" />
          <Skeleton className="h-4 w-full max-w-md rounded-md" />
        </div>
        <div className="mt-14 sm:mt-16 lg:mt-20">
          <div className="flex flex-col gap-8 sm:gap-10">
            <div className="flex items-center justify-center rounded-xl bg-muted px-4 py-8 sm:px-10 sm:py-12">
              <Skeleton className="h-[20.5rem] w-full max-w-xl rounded-xl sm:h-[22rem]" />
            </div>

            <div className="grid gap-y-10 sm:grid-cols-2 sm:gap-x-8 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  className={cn(
                    "flex flex-col gap-4",
                    i > 0 && "lg:border-l lg:border-border/50 lg:pl-8",
                  )}
                  key={`workflow-step-${i}`}
                >
                  <div className="h-0.5 w-full bg-border" />
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-3 w-16 rounded-md" />
                    <Skeleton
                      className={cn(
                        "h-7 rounded-md",
                        ["w-40", "w-44", "w-52", "w-52"][i],
                      )}
                    />
                    <div className="flex flex-col gap-2">
                      <Skeleton className="h-4 w-full rounded-md" />
                      <Skeleton className="h-4 w-5/6 rounded-md" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* The Requo business section */}
      <section className="relative left-1/2 mt-24 w-screen -translate-x-1/2 overflow-x-clip py-16 sm:mt-32 sm:py-20 lg:mt-40 lg:py-24">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-4 sm:gap-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-end lg:px-8 xl:px-0">
          <div className="flex flex-col gap-3 sm:gap-4">
            <Skeleton className="h-4 w-48 rounded-md" />
            <Skeleton className="h-10 w-full max-w-3xl rounded-lg sm:h-14" />
          </div>
          <Skeleton className="h-4 w-full max-w-md rounded-md" />
        </div>

        <div className="mt-10 flex flex-col sm:mt-12">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              className="mx-auto grid w-full max-w-6xl gap-6 border-b border-border/60 px-4 py-10 sm:gap-8 sm:px-6 lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-8 xl:px-0"
              key={`feature-row-${i}`}
            >
              <div className="flex flex-col gap-3">
                <Skeleton className="h-6 w-40 rounded-md" />
                <Skeleton className="h-4 w-full max-w-md rounded-md" />
                <Skeleton className="h-4 w-4/5 max-w-md rounded-md" />
              </div>
              <Skeleton className="h-56 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto mt-24 w-full max-w-4xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0">
        <div className="flex flex-col items-start gap-3 sm:gap-4">
          <Skeleton className="h-4 w-16 rounded-md" />
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
      <section className="mx-auto mt-24 w-full max-w-4xl px-4 sm:mt-32 sm:px-6 lg:mt-40 lg:px-8 xl:px-0">
        <div className="flex flex-col items-center gap-6 py-10 text-center sm:gap-8 sm:py-14">
          <Skeleton className="h-12 w-full max-w-xl rounded-lg sm:h-16" />
          <Skeleton className="h-11 w-40 rounded-full" />
          <Skeleton className="h-4 w-80 max-w-full rounded-md" />
        </div>
      </section>

      {/* Footer */}
      <footer className="w-full text-muted-foreground">
        <div className="mx-auto flex max-w-6xl flex-col justify-between gap-12 px-4 py-16 sm:px-6 lg:flex-row lg:items-start lg:gap-16 lg:px-8 xl:px-0">
          <div className="flex flex-col justify-between self-stretch">
            <Skeleton className="h-7 w-24 rounded-md" />
            <Skeleton className="mt-14 hidden h-3 w-48 rounded-md lg:block" />
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-4 sm:gap-10 lg:gap-12 xl:gap-16">
            {Array.from({ length: 4 }).map((_, columnIndex) => (
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