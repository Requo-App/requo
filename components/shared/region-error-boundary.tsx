"use client";

import { RotateCcw } from "lucide-react";
import { catchError, type ErrorInfo } from "next/error";
import { createContext, useContext, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

type RegionErrorBoundaryProps = {
  /** Fallback UI shown when the child region throws. */
  fallback: ReactNode;
  children: ReactNode;
};

type RegionErrorFallbackProps = {
  fallback: ReactNode;
};

const RegionErrorRetryContext = createContext<(() => void) | null>(null);

function RegionErrorFallback(
  { fallback }: RegionErrorFallbackProps,
  { retry }: ErrorInfo,
) {
  return (
    <RegionErrorRetryContext.Provider value={retry}>
      {fallback}
    </RegionErrorRetryContext.Provider>
  );
}

const CatchRegionError = catchError(RegionErrorFallback);

/**
 * Error boundary for independently-failing page regions.
 *
 * Wraps a `<Suspense>`-based data region so that if the child server
 * component throws (network error, auth failure, etc.) only that region
 * shows the fallback while the structural shell and sibling regions stay
 * rendered.
 *
 * Built on Next's `catchError` rather than a hand-written React boundary:
 * `notFound()` and `redirect()` are thrown as framework control flow and
 * must reach Next's router instead of being swallowed by this boundary.
 * `catchError` also clears the error state on client navigation, so the
 * same boundary instance can recover when moving between dynamic records.
 * Fallbacks can render `RegionErrorRetryButton` to call `retry()`.
 */
export function RegionErrorBoundary({
  fallback,
  children,
}: RegionErrorBoundaryProps) {
  return (
    <CatchRegionError fallback={fallback}>{children}</CatchRegionError>
  );
}

export function RegionErrorRetryButton({
  label = "Try again",
}: {
  label?: string;
}) {
  const retry = useContext(RegionErrorRetryContext);

  if (!retry) {
    return null;
  }

  return (
    <Button
      onClick={() => retry()}
      size="sm"
      type="button"
      variant="outline"
    >
      <RotateCcw data-icon="inline-start" />
      {label}
    </Button>
  );
}
