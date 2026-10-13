import type { Metadata } from "next";
import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { AppearanceSettingsForm } from "@/features/theme/components/appearance-settings-form";
import { requireSession } from "@/lib/auth/session";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Appearance",
  description: "Choose your preferred color theme and interface scale.",
});

export const instant = true;

/**
 * Appearance settings page — centered narrow column like general settings,
 * with no page header. Returns the structural shell synchronously.
 *
 * The session read moves into a Suspense-wrapped child so the shell paints
 * instantly on sibling navigation; the theme form streams in behind a
 * dimensionally accurate skeleton.
 */
export default function SettingsAppearancePage() {
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col">
      <Suspense fallback={<AppearanceFormSkeleton />}>
        <AppearanceFormRegion />
      </Suspense>
    </div>
  );
}

async function AppearanceFormRegion() {
  const session = await requireSession();

  return <AppearanceSettingsForm userId={session.user.id} />;
}

export function AppearanceFormSkeleton() {
  return (
    <div className="flex w-full flex-col gap-8" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24 rounded-md" />
        <div className="grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-24 rounded-xl" />
              <Skeleton className="h-4 w-20 rounded-md" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20 rounded-md" />
        <Skeleton className="h-4 w-64 rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}
