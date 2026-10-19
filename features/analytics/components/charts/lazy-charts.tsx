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
const InternalTrendAreaChart = dynamic(
  () => import("./trend-area-chart").then((mod) => mod.TrendAreaChart),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalQuoteOutcomesDonut = dynamic(
  () => import("./quote-outcomes-donut").then((mod) => mod.QuoteOutcomesDonut),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalAgingBarChart = dynamic(
  () => import("./aging-bar-chart").then((mod) => mod.AgingBarChart),
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
const InternalRevenueTrendChart = dynamic(
  () => import("./revenue-trend-chart").then((mod) => mod.RevenueTrendChart),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

// ssr: false — Recharts relies on browser DOM APIs (SVG measurement, ResizeObserver) for chart rendering
const InternalTeamActivityChart = dynamic(
  () => import("./team-activity-chart").then((mod) => mod.TeamActivityChart),
  { ssr: false, loading: () => <AnalyticsChartSkeleton /> },
);

export function LazyTrendAreaChart(props: ComponentProps<typeof InternalTrendAreaChart>) {
  return (
    <LazyErrorBoundary>
      <InternalTrendAreaChart {...props} />
    </LazyErrorBoundary>
  );
}

export function LazyQuoteOutcomesDonut(
  props: ComponentProps<typeof InternalQuoteOutcomesDonut>,
) {
  return (
    <LazyErrorBoundary>
      <InternalQuoteOutcomesDonut {...props} />
    </LazyErrorBoundary>
  );
}

export function LazyAgingBarChart(props: ComponentProps<typeof InternalAgingBarChart>) {
  return (
    <LazyErrorBoundary>
      <InternalAgingBarChart {...props} />
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

export function LazyRevenueTrendChart(
  props: ComponentProps<typeof InternalRevenueTrendChart>,
) {
  return (
    <LazyErrorBoundary>
      <InternalRevenueTrendChart {...props} />
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
