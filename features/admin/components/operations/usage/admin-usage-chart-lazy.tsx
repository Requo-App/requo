"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import { ChartSkeleton } from "@/components/shared/chart-skeleton";
import { LazyErrorBoundary } from "@/components/shared/lazy-error-boundary";

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement,
// ResizeObserver) for chart rendering.
const InternalAdminUsageChart = dynamic(
  () =>
    import("@/features/admin/components/operations/usage/admin-usage-chart").then(
      (mod) => mod.AdminUsageChart,
    ),
  { ssr: false, loading: () => <ChartSkeleton /> },
);

/**
 * Lazy-loaded admin usage chart — only downloads Recharts when rendered.
 * Wrapped in an error boundary that catches chunk download failures and
 * offers a retry button to re-attempt the import.
 */
export function LazyAdminUsageChart(
  props: ComponentProps<typeof InternalAdminUsageChart>,
) {
  return (
    <LazyErrorBoundary>
      <InternalAdminUsageChart {...props} />
    </LazyErrorBoundary>
  );
}
