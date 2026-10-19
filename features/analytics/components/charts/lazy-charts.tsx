"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import { LazyErrorBoundary } from "@/components/shared/lazy-error-boundary";

import { AnalyticsChartSkeleton } from "@/features/analytics/components/states/skeletons";

/**
 * Analytics-owned lazy chart registry.
 *
 * Recharts only loads when a chart actually renders, and every entry wraps the
 * dynamic component in `LazyErrorBoundary` so a failed chunk download degrades
 * to a retry card instead of an empty section. Feature-owned (rather than the
 * legacy shared registry) so deleting old components never strands imports.
 */

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalTrendChart = dynamic(
  () => import("./trend-chart").then((mod) => mod.TrendChart),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalRevenueChart = dynamic(
  () => import("./revenue-chart").then((mod) => mod.RevenueChart),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalDonut = dynamic(
  () => import("../primitives/donut").then((mod) => mod.Donut),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalFollowUpComparisonChart = dynamic(
  () =>
    import("./follow-up-comparison-chart").then(
      (mod) => mod.FollowUpComparisonChart,
    ),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalTeamActivityChart = dynamic(
  () => import("./team-activity-chart").then((mod) => mod.TeamActivityChart),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

export function LazyTrendChart(props: ComponentProps<typeof InternalTrendChart>) {
  return (
    <LazyErrorBoundary>
      <InternalTrendChart {...props} />
    </LazyErrorBoundary>
  );
}

export function LazyRevenueChart(
  props: ComponentProps<typeof InternalRevenueChart>,
) {
  return (
    <LazyErrorBoundary>
      <InternalRevenueChart {...props} />
    </LazyErrorBoundary>
  );
}

export function LazyDonut(props: ComponentProps<typeof InternalDonut>) {
  return (
    <LazyErrorBoundary>
      <InternalDonut {...props} />
    </LazyErrorBoundary>
  );
}

export function LazyFollowUpComparisonChart(
  props: ComponentProps<typeof InternalFollowUpComparisonChart>,
) {
  return (
    <LazyErrorBoundary>
      <InternalFollowUpComparisonChart {...props} />
    </LazyErrorBoundary>
  );
}

export function LazyTeamActivityChart(
  props: ComponentProps<typeof InternalTeamActivityChart>,
) {
  return (
    <LazyErrorBoundary>
      <InternalTeamActivityChart {...props} />
    </LazyErrorBoundary>
  );
}
