import { z } from "zod";
import { NextResponse } from "next/server";

import { requireExportContext, csvResponse } from "@/lib/api/exports";
import { slugParamSchema } from "@/lib/api/params";
import { buildCsv } from "@/lib/csv";
import { getFreeAnalytics } from "@/features/analytics/queries";

const exportBodySchema = z.object({
  format: z.enum(["csv"]),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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
    "analyticsConversion",
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

  const { since, until } = parsedBody.data;
  const sinceDate = new Date(`${since}T00:00:00.000Z`);
  const untilDate = new Date(`${until}T23:59:59.999Z`);

  if (sinceDate >= untilDate) {
    return NextResponse.json(
      { error: "Start date must be before end date." },
      { status: 400 },
    );
  }

  const businessId = requestContext.businessContext.business.id;

  const analytics = await getFreeAnalytics(businessId, sinceDate, untilDate);

  const metricRows: Array<{ metric: string; value: string }> = [
    { metric: "Form Views", value: String(analytics.formViews) },
    { metric: "Unique Visitors", value: String(analytics.uniqueVisitors) },
    { metric: "Inquiry Submissions", value: String(analytics.inquirySubmissions) },
    { metric: "Inquiries with Quote", value: String(analytics.inquiriesWithQuote) },
    { metric: "Quotes Sent", value: String(analytics.quotesSent) },
    { metric: "Quotes Viewed", value: String(analytics.quotesViewed) },
    { metric: "Quotes Accepted", value: String(analytics.quotesAccepted) },
    { metric: "Quotes Rejected", value: String(analytics.quotesRejected) },
    {
      metric: "Form Conversion Rate",
      value: `${(analytics.formConversionRate * 100).toFixed(1)}%`,
    },
    {
      metric: "Inquiry to Quote Rate",
      value: `${(analytics.inquiryToQuoteRate * 100).toFixed(1)}%`,
    },
    {
      metric: "Quote Acceptance Rate",
      value: `${(analytics.quoteAcceptanceRate * 100).toFixed(1)}%`,
    },
  ];

  const csv = buildCsv(
    [
      { header: "Metric", render: (row) => row.metric },
      { header: "Value", render: (row) => row.value },
    ],
    metricRows,
  );

  const filename = `analytics-${parsedParams.data.slug}-${since}-to-${until}.csv`;

  return csvResponse(csv, filename);
}
