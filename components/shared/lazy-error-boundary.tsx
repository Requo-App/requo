"use client";

import { RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

import { ErrorStateNotice } from "@/components/shared/error-state";
import { Button } from "@/components/ui/button";
import { reportClientError } from "@/lib/observability/client";

type LazyErrorBoundaryState = {
  hasError: boolean;
};

type LazyErrorBoundaryProps = {
  children: ReactNode;
};

/**
 * Lightweight error boundary for lazy-loaded components.
 *
 * Catches chunk download failures (network errors, 404s from deploys)
 * and displays a calm inline retry UI. On retry, it resets the error
 * state so React re-renders the children — which triggers the dynamic
 * import again, re-attempting the chunk download.
 *
 * Designed to wrap `next/dynamic` components with `ssr: false`. Adds
 * minimal JS overhead (class component + small fallback UI).
 */
export class LazyErrorBoundary extends Component<
  LazyErrorBoundaryProps,
  LazyErrorBoundaryState
> {
  state: LazyErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): LazyErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, _errorInfo: ErrorInfo) {
    void reportClientError(error, { scope: "lazy-chunk" });
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return <LazyLoadError onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

/**
 * Inline error fallback shown when a lazy-loaded chunk fails to download.
 * Uses the same notice as a failed data region.
 */
function LazyLoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <ErrorStateNotice
      actions={
        <Button onClick={onRetry} size="sm" type="button" variant="outline">
          <RotateCcw data-icon="inline-start" />
          Retry
        </Button>
      }
      className="min-h-[120px] justify-center"
      description="Check your connection and try again."
      title="This content didn't load"
    />
  );
}
