import { NextResponse } from "next/server";

import { getInvoiceExportRowsForBusiness } from "@/features/invoices/queries";
import type { InvoiceStatus } from "@/features/invoices/types";
import { formatCentsForExport } from "@/lib/csv";
import { buildListCsvResponse, requireExportContext } from "@/lib/api/exports";
import { slugParamSchema } from "@/lib/api/params";
import { z } from "zod";

const invoiceExportQuerySchema = z.object({
  q: z.string().optional(),
  status: z.enum(["all", "draft", "sent", "unpaid", "partially_paid", "paid", "overdue", "voided"]).optional(),
  sort: z.enum(["newest", "oldest"]).optional(),
});

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const parsedParams = slugParamSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const gate = await requireExportContext(parsedParams.data.slug);
  if (!gate.ok) return gate.response;
  const { requestContext } = gate;

  const searchParams = new URL(request.url).searchParams;
  const parsedQuery = invoiceExportQuerySchema.safeParse(
    Object.fromEntries(searchParams.entries()),
  );
  const q = parsedQuery.success ? parsedQuery.data.q : undefined;
  const status: "all" | InvoiceStatus =
    parsedQuery.success && parsedQuery.data.status
      ? parsedQuery.data.status
      : "all";
  const sort = parsedQuery.success && parsedQuery.data.sort ? parsedQuery.data.sort : "newest";

  const rows = await getInvoiceExportRowsForBusiness({
    businessId: requestContext.businessContext.business.id,
    filters: { q, status, sort, page: 1 },
  });

  return buildListCsvResponse(
    [
      { header: "invoice_number", render: (row) => row.invoiceNumber },
      { header: "title", render: (row) => row.title },
      { header: "customer_name", render: (row) => row.customerName },
      { header: "customer_email", render: (row) => row.customerEmail },
      { header: "status", render: (row) => row.status },
      { header: "linked_quote_id", render: (row) => row.quoteId },
      { header: "issue_date", render: (row) => row.issueDate },
      { header: "due_date", render: (row) => row.dueDate },
      { header: "total_amount", render: (row) => formatCentsForExport(row.totalInCents) },
      { header: "paid_amount", render: (row) => formatCentsForExport(row.paidInCents) },
      { header: "balance_amount", render: (row) => formatCentsForExport(row.balanceInCents) },
      { header: "currency", render: (row) => row.currency },
      { header: "created_at", render: (row) => row.createdAt.toISOString() },
      { header: "sent_at", render: (row) => row.sentAt?.toISOString() },
    ],
    rows,
    "invoices",
  );
}
