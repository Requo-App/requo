import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/**
 * Settings route skeletons render only the main column; `settings/layout.tsx`
 * already provides the shell and spacing.
 */
function DashboardSettingsShellSkeleton({
  children,
}: {
  children: ReactNode;
}) {
  return <>{children}</>;
}

export function DashboardSettingsProfileSkeleton() {
  return (
    <DashboardSettingsShellSkeleton>
      <div className="mx-auto flex w-full max-w-[36rem] min-w-0 flex-col gap-10">
        {/* Picture */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-16 rounded-md" />
          <div className="flex items-start gap-4">
            <Skeleton className="size-16 shrink-0 rounded-2xl" />
            <div className="flex gap-2 pt-1">
              <Skeleton className="h-8 w-24 rounded-md" />
              <Skeleton className="h-8 w-24 rounded-md" />
            </div>
          </div>
          <Skeleton className="h-4 w-64 rounded-md" />
        </div>

        {/* Name */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="h-4 w-48 rounded-md" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Skeleton className="h-9 rounded-md" />
            <Skeleton className="h-9 rounded-md" />
          </div>
        </div>

        {/* Email */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-14 rounded-md" />
          <Skeleton className="h-4 w-56 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
        </div>

        {/* Password */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-28 rounded-md" />
          <Skeleton className="h-4 w-52 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 w-36 rounded-md" />
        </div>

        {/* Devices */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-20 rounded-md" />
          <Skeleton className="h-4 w-60 rounded-md" />
          <Skeleton className="h-16 rounded-xl" />
        </div>

        {/* Danger zone */}
        <div className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-4 w-56 rounded-md" />
          <Skeleton className="h-9 w-32 rounded-md" />
        </div>
      </div>
    </DashboardSettingsShellSkeleton>
  );
}
