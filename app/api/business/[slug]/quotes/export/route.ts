import { z } from "zod";
import { NextResponse } from "next/server";

import {
  getQuoteExportRowsForBusiness,
  quoteExportRowLimit,
} from "@/features/quotes/queries";
import { quoteListFiltersSchema } from "@/features/quotes/schemas";
import { formatCentsForExport } from "@/lib/csv";
import { buildListCsvResponse, requireExportContext } from "@/lib/api/exports";
import { exportDateSchema, slugParamSchema } from "@/lib/api/params";

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const parsedParams = slugParamSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const gate = await requireExportContext(parsedParams.data.slug);
  if (!gate.ok) return gate.response;
  const { requestContext } = gate;

  const parsedFilters = quoteListFiltersSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        view: "active" as const,
        status: "all" as const,
        sort: "newest" as const,
        page: 1,
      };

  const dateParams = z
    .object({
      from: exportDateSchema,
      to: exportDateSchema,
    })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));

  if (!dateParams.success) {
    return NextResponse.json(
      { error: "Enter a valid date range." },
      { status: 400 },
    );
  }

  const from = dateParams.data.from;
  const to = dateParams.data.to;
  const rows = await getQuoteExportRowsForBusiness({
    businessId: requestContext.businessContext.business.id,
    filters: {
      q: filters.q,
      view: filters.view,
      status: filters.status,
      sort: filters.sort,
    },
    from,
    to,
  });

  if (rows.length > quoteExportRowLimit) {
    // The export materializes the whole CSV in memory, so the result set is
    // capped. Say so instead of silently truncating the file.
    return NextResponse.json(
      {
        error:
          "This export is too large. Narrow the date range or filters and try again.",
      },
      { status: 400 },
    );
  }

  return buildListCsvResponse(
    [
      { header: "quote_number", render: (row) => row.quoteNumber },
      { header: "title", render: (row) => row.title },
      { header: "customer_name", render: (row) => row.customerName },
      { header: "customer_email", render: (row) => row.customerEmail },
      { header: "status", render: (row) => row.status },
      { header: "archived_at", render: (row) => row.archivedAt?.toISOString() },
      { header: "voided_at", render: (row) => row.voidedAt?.toISOString() },
      { header: "linked_inquiry_id", render: (row) => row.inquiryId },
      { header: "valid_until", render: (row) => row.validUntil },
      { header: "total_amount", render: (row) => formatCentsForExport(row.totalInCents) },
      { header: "currency", render: (row) => row.currency },
      { header: "created_at", render: (row) => row.createdAt.toISOString() },
      { header: "sent_at", render: (row) => row.sentAt?.toISOString() },
      { header: "customer_responded_at", render: (row) => row.customerRespondedAt?.toISOString() },
    ],
    rows,
    "quotes",
  );
}
