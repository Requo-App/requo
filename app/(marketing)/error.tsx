"use client";

import { ErrorState } from "@/components/shared/error-state";
import { useErrorReport } from "@/components/shared/error-state-client";

/**
 * Error boundary for marketing pages. The marketing layout stays mounted, so
 * this uses the inline layout: no second logomark, no full-viewport takeover.
 */
export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useErrorReport("marketing-error", error);

  return (
    <ErrorState
      focusOnMount
      homeHref="/"
      homeLabel="Go to Requo"
      layout="inline"
      onRetry={reset}
      referenceId={error.digest}
      variant="error"
    />
  );
}
