"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw } from "lucide-react";

import { StatePageCard } from "@/components/shared/state-page-card";
import { Button } from "@/components/ui/button";
import { ADMIN_ROOT_PATH } from "@/features/admin/navigation";

type AdminConsoleErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Error boundary for the admin console.
 *
 * Mirrors `app/(business)/[businessSlug]/(main)/error.tsx` — the boundary sits
 * inside `app/admin/layout.tsx`, so the admin rail and header stay mounted and
 * only the failing view is replaced.
 */
export default function AdminConsoleError({
  error,
  reset,
}: AdminConsoleErrorProps) {
  useEffect(() => {
    console.error("[admin-console-error]", error);
  }, [error]);

  return (
    <StatePageCard
      actions={
        <>
          <Button onClick={reset} type="button" variant="outline">
            <RotateCcw data-icon="inline-start" />
            Try again
          </Button>
          <Button asChild>
            <Link href={ADMIN_ROOT_PATH}>Back to overview</Link>
          </Button>
        </>
      }
      description="An unexpected error stopped this view from rendering. Nothing was changed."
      eyebrow="Console error"
      media={
        <div className="flex size-12 items-center justify-center rounded-full border bg-destructive/10 text-destructive-ink">
          <AlertTriangle />
        </div>
      }
      title="This view did not load."
    >
      {error.digest ? (
        <div className="state-card-note font-mono text-xs">
          Ref: {error.digest}
        </div>
      ) : null}
      {process.env.NODE_ENV === "development" ? (
        <div className="rounded-xl border border-border/80 bg-muted/35 px-4 py-3 font-mono text-xs leading-6 text-muted-foreground">
          {error.message}
        </div>
      ) : null}
    </StatePageCard>
  );
}
