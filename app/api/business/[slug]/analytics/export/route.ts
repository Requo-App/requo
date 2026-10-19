import { z } from "zod";
import { NextResponse } from "next/server";

import { resolveAnalyticsWindow } from "@/features/analytics/lib/window";
import {
  getAnalyticsBusinessMeta,
  getOverviewData,
  getPerformanceData,
} from "@/features/analytics/queries";
import { csvResponse, requireExportContext } from "@/lib/api/exports";
import { slugParamSchema } from "@/lib/api/params";
import { buildCsv } from "@/lib/csv";
import { hasFeatureAccess } from "@/lib/plans";

const exportBodySchema = z.object({
  format: z.enum(["csv"]),
  /**
   * `summary` is one metric-per-row for the visible window (Pro);
   * `daily` is the bucketed time series (Business).
   */
  scope: z.enum(["summary", "daily"]).default("summary"),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

type SummaryRow = { metric: string; value: string };

function cents(centsValue: number): string {
  return (centsValue / 100).toFixed(2);
}

function percent(ratio: number): string {
  return `${(ratio * 100).toFixed(1)}%`;
}

function hours(value: number | null): string {
  return value === null ? "" : value.toFixed(1);
}

/**
 * Analytics CSV export.
 *
 * The window is re-resolved server-side from the requested dates so a tampered
 * body can never widen the plan's history cap. Summary exports combine the
 * overview pipeline and the performance detail; the daily series export is a
 * Business-tier extra and never runs for lower plans.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = slugParamSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const gate = await requireExportContext(
    parsedParams.data.slug,
    "analyticsPerformance",
  );
  if (!gate.ok) return gate.response;
  const { requestContext } = gate;

  const body = await request.json().catch(() => null);
  const parsedBody = exportBodySchema.safeParse(body);

  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "Invalid input.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const { scope, since, until } = parsedBody.data;
  const { business } = requestContext.businessContext;

  if (scope === "daily" && !hasFeatureAccess(business.plan, "analyticsTeam")) {
    return NextResponse.json(
      { error: "Upgrade to Business to export the daily series." },
      { status: 403 },
    );
  }

  const meta = await getAnalyticsBusinessMeta(business.id);
  const window = resolveAnalyticsWindow({
    plan: business.plan,
    range: "custom",
    from: since,
    to: until,
    compare: "0",
    earliest: meta.createdAt,
  });

  const overview = await getOverviewData({
    businessId: business.id,
    businessSlug: business.slug,
    window,
  });

  const filename = `analytics-${parsedParams.data.slug}-${scope}-${since}-to-${until}.csv`;

  if (scope === "daily") {
    const dailyCsv = buildCsv(
      [
        { header: "Bucket start", render: (row) => row.key },
        { header: "Period", render: (row) => row.label },
        { header: "Visitors", render: (row) => String(row.visitors) },
        { header: "Form views", render: (row) => String(row.formViews) },
        { header: "Inquiries", render: (row) => String(row.inquiries) },
        { header: "Quotes sent", render: (row) => String(row.quotesSent) },
        { header: "Quotes accepted", render: (row) => String(row.quotesAccepted) },
        { header: "Quotes rejected", render: (row) => String(row.quotesRejected) },
        {
          header: `Revenue won (${overview.currency})`,
          render: (row) => cents(row.revenueInCents),
        },
      ],
      overview.series,
    );

    return csvResponse(dailyCsv, filename);
  }

  const performance = await getPerformanceData({
    businessId: business.id,
    businessSlug: business.slug,
    window,
    plan: business.plan,
  });

  const { current, receivables } = overview;
  const rows: SummaryRow[] = [
    { metric: "Range", value: window.label },
    {
      metric: "From",
      value: window.since.toISOString().slice(0, 10),
    },
    {
      metric: "To",
      value: new Date(window.until.getTime() - 86_400_000).toISOString().slice(0, 10),
    },
    { metric: "Currency", value: overview.currency },
    { metric: "", value: "" },
    { metric: "PIPELINE", value: "" },
    { metric: "Visitors", value: String(current.visitors) },
    { metric: "Form views", value: String(current.formViews) },
    { metric: "Inquiries", value: String(current.inquiries) },
    { metric: "Inquiries with quote", value: String(current.inquiriesWithQuote) },
    { metric: "Quotes sent", value: String(current.quotesSent) },
    { metric: "Quotes viewed", value: String(current.quotesViewed) },
    { metric: "Quotes responded", value: String(current.quotesResponded) },
    { metric: "Quotes accepted", value: String(current.quotesAccepted) },
    { metric: "Quotes rejected", value: String(current.quotesRejected) },
    { metric: "Quotes expired", value: String(current.quotesExpired) },
    { metric: "Win rate (accepted ÷ decided)", value: percent(current.winRate) },
    { metric: "Acceptance rate (accepted ÷ sent)", value: percent(current.acceptanceRate) },
    { metric: "", value: "" },
    { metric: "VALUE", value: "" },
    { metric: `Quoted value (${overview.currency})`, value: cents(current.quotedValueInCents) },
    { metric: `Revenue won (${overview.currency})`, value: cents(current.revenueWonInCents) },
    {
      metric: `Average accepted deal (${overview.currency})`,
      value: cents(performance.values.averageAcceptedInCents),
    },
    { metric: `Invoiced (${overview.currency})`, value: cents(current.invoicedInCents) },
    { metric: `Collected (${overview.currency})`, value: cents(current.collectedInCents) },
    { metric: `Tax (${overview.currency})`, value: cents(performance.values.taxInCents) },
    { metric: "Discounted quotes", value: String(performance.discounts.discountedCount) },
    {
      metric: "Average discount",
      value: percent(performance.discounts.averageDiscountPercent / 100),
    },
    { metric: "", value: "" },
    { metric: "RECEIVABLES", value: "" },
    {
      metric: `Outstanding (${overview.currency})`,
      value: cents(receivables.outstandingInCents),
    },
    { metric: "Outstanding invoices", value: String(receivables.outstandingCount) },
    { metric: `Overdue (${overview.currency})`, value: cents(receivables.overdueInCents) },
    { metric: "Overdue invoices", value: String(receivables.overdueCount) },
    ...performance.arAging.map((bucket) => ({
      metric: `${bucket.label} outstanding (${overview.currency})`,
      value: cents(bucket.valueInCents),
    })),
    { metric: "", value: "" },
    { metric: "SPEED AND COLLECTIONS", value: "" },
    ...performance.timing.map((metric) => ({
      metric: `${metric.label} (hours)`,
      value: hours(metric.hours),
    })),
    {
      metric: "Average days to pay",
      value: performance.collections.averageDaysToPay === null
        ? ""
        : performance.collections.averageDaysToPay.toFixed(1),
    },
    {
      metric: "Average days late",
      value: performance.collections.averageDaysLate === null
        ? ""
        : performance.collections.averageDaysLate.toFixed(1),
    },
    { metric: "", value: "" },
    { metric: "VOICE OF CUSTOMER", value: "" },
    ...performance.sources.slice(0, 10).map((source) => ({
      metric: `Form views · ${source.label}`,
      value: String(source.count),
    })),
    ...performance.services.slice(0, 10).map((service) => ({
      metric: `Inquiries · ${service.name}`,
      value: String(service.inquiries),
    })),
  ];

  const csv = buildCsv(
    [
      { header: "Metric", render: (row: SummaryRow) => row.metric },
      { header: "Value", render: (row: SummaryRow) => row.value },
    ],
    rows,
  );

  return csvResponse(csv, filename);
}
