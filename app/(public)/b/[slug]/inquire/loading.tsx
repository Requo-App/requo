import { Skeleton } from "@/components/ui/skeleton";

export default function InquireHubLoading() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-16">
      <div className="flex w-full max-w-lg flex-col gap-8">
        <div className="flex flex-col items-center gap-2 text-center">
          <Skeleton className="h-7 w-48 rounded-md" />
          <Skeleton className="h-4 w-64 rounded-md" />
          <Skeleton className="h-4 w-72 rounded-md" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col items-center gap-4 rounded-xl border border-border/70 bg-card p-6 text-center">
            <Skeleton className="size-12 rounded-xl" />
            <div className="flex w-full flex-col items-center gap-2">
              <Skeleton className="h-4 w-28 rounded-md" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </div>
          </div>

          <div className="flex items-center gap-4 rounded-xl border border-border/70 bg-card p-4">
            <Skeleton className="size-10 shrink-0 rounded-lg" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-32 rounded-md" />
              <Skeleton className="h-3 w-44 rounded-md" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
