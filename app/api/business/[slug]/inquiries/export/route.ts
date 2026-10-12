import { z } from "zod";
import { NextResponse } from "next/server";

import {
  getInquiryExportRowsForBusiness,
} from "@/features/inquiries/queries";
import { inquiryListFiltersSchema } from "@/features/inquiries/schemas";
import { normalizeInquirySource } from "@/features/inquiries/types";
import { getInquirySourceLabel } from "@/features/inquiries/utils";
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

  const parsedFilters = inquiryListFiltersSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams.entries()),
  );
  const filters = parsedFilters.success
    ? parsedFilters.data
    : {
        q: undefined,
        view: "active" as const,
        status: "all" as const,
        form: "all",
        source: "all" as const,
        sort: "newest" as const,
        escalated: false,
        unread: false,
        page: 1,
      };

  const dateParams = z
    .object({
      from: exportDateSchema,
      to: exportDateSchema,
    })
    .safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
  const from = dateParams.success ? dateParams.data.from : undefined;
  const to = dateParams.success ? dateParams.data.to : undefined;
  const rows = await getInquiryExportRowsForBusiness({
    businessId: requestContext.businessContext.business.id,
    filters: {
      q: filters.q,
      view: filters.view,
      status: filters.status,
      form: filters.form,
      source: filters.source,
      sort: filters.sort,
      escalated: filters.escalated ?? false,
      unread: filters.unread ?? false,
    },
    from,
    to,
  });

  return buildListCsvResponse(
    [
      { header: "inquiry_id", render: (row) => row.id },
      { header: "submitted_at", render: (row) => row.submittedAt.toISOString() },
      { header: "form_name", render: (row) => row.inquiryFormName },
      { header: "customer_name", render: (row) => row.customerName },
      { header: "customer_email", render: (row) => row.customerEmail },
      { header: "contact_method", render: (row) => row.customerContactMethod },
      { header: "contact_handle", render: (row) => row.customerContactHandle },
      { header: "service", render: (row) => row.inquiryFormName },
      { header: "service_slug", render: (row) => row.inquiryFormSlug },
      { header: "source", render: (row) => normalizeInquirySource(row.source) },
      { header: "source_label", render: (row) => getInquirySourceLabel(row.source) },
      { header: "subject", render: (row) => row.subject },
      { header: "status", render: (row) => row.status },
      { header: "record_state", render: (row) => row.recordState },
      { header: "budget_text", render: (row) => row.budgetText },
      { header: "requested_deadline", render: (row) => row.requestedDeadline },
      { header: "details", render: (row) => row.details },
      { header: "archived_at", render: (row) => row.archivedAt?.toISOString() },
    ],
    rows,
    "inquiries",
  );
}
