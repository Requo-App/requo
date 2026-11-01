"use client";

import { ErrorState } from "@/components/shared/error-state";
import { useErrorReport } from "@/components/shared/error-state-client";
import { ADMIN_ROOT_PATH } from "@/features/admin/navigation";

type AdminConsoleErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

/**
 * Error boundary for the admin console.
 *
 * The boundary sits inside `app/admin/layout.tsx`, so the admin rail and header
 * stay mounted and only the failing view is replaced.
 */
export default function AdminConsoleError({
  error,
  reset,
}: AdminConsoleErrorProps) {
  useErrorReport("admin-console-error", error);

  return (
    <ErrorState
      focusOnMount
      homeHref={ADMIN_ROOT_PATH}
      homeLabel="Back to overview"
      layout="inline"
      onRetry={reset}
      referenceId={error.digest}
      variant="error"
    >
      {process.env.NODE_ENV === "development" ? (
        <p className="rounded-lg border border-border/80 bg-muted/35 px-4 py-3 text-left font-mono text-xs leading-6 break-words text-muted-foreground">
          {error.message}
        </p>
      ) : null}
    </ErrorState>
  );
}
