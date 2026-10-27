"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  XAxis,
  YAxis,
} from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { AdminUsageDay } from "@/features/admin/types";

export type UsageChartPoint = AdminUsageDay & { label: string };

const usageChartConfig = {
  signups: { label: "Sign-ups", color: "var(--chart-1)" },
  businesses: { label: "Businesses", color: "var(--chart-2)" },
  inquiries: { label: "Inquiries", color: "var(--chart-3)" },
  quotesSent: { label: "Quotes sent", color: "var(--chart-4)" },
  emailsSent: { label: "Emails sent", color: "var(--chart-5)" },
  aiCalls: { label: "AI calls", color: "var(--primary)" },
} satisfies ChartConfig;

const usageSeriesKeys = [
  "signups",
  "businesses",
  "inquiries",
  "quotesSent",
  "emailsSent",
  "aiCalls",
] as const;

/**
 * Platform activity chart for `/admin/usage`.
 *
 * Client-only (Recharts needs DOM measurement) and always loaded through
 * the dynamic wrapper below so the chart JS never blocks the page.
 */
export function AdminUsageChart({ points }: { points: UsageChartPoint[] }) {
  const hasActivity = points.some((point) =>
    usageSeriesKeys.some((key) => point[key] > 0),
  );

  if (!hasActivity) {
    return (
      <div className="flex min-h-[280px] w-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-medium text-foreground">No activity yet</p>
        <p className="text-sm text-muted-foreground">
          Platform activity will appear here as accounts, businesses, and
          product events accumulate.
        </p>
      </div>
    );
  }

  return (
    // Explicit height: ResponsiveContainer resolves its "100%" size against
    // the parent's definite height, and `min-h` alone does not establish
    // one — with only `h-full min-h-[280px]` the chart mounted at zero
    // size and rendered blank. 280px matches the ChartSkeleton reserve.
    <ChartContainer
      className="h-[280px] w-full"
      config={usageChartConfig}
    >
      <AreaChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis
          dataKey="label"
          tickLine={false}
          axisLine={false}
          minTickGap={32}
        />
        <YAxis tickLine={false} axisLine={false} width={40} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <ChartLegend content={<ChartLegendContent />} />
        {usageSeriesKeys.map((key) => (
          <Area
            key={key}
            type="monotone"
            dataKey={key}
            stroke={`var(--color-${key})`}
            fill={`var(--color-${key})`}
            fillOpacity={0.12}
            strokeWidth={2}
          />
        ))}
      </AreaChart>
    </ChartContainer>
  );
}
