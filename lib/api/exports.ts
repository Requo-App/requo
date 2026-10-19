import "server-only";

import { NextResponse } from "next/server";

import { buildCsv, formatDateForExportFileName, type CsvColumn } from "@/lib/csv";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { buildContentDisposition } from "@/lib/files";
import { hasFeatureAccess } from "@/lib/plans";
import { renderHtmlPageElementToPng } from "@/lib/pdf/html-to-image";
import { createPdfFromPng } from "@/lib/pdf/png-to-pdf";
import { exportFormatSchema } from "@/lib/api/params";

export type ExportRequestContext = Awaited<
  ReturnType<typeof getBusinessRequestContextForSlug>
>;

/**
 * Shared auth + paywall gate for business CSV/PDF exports (was copy-pasted
 * across 7 routes: slug parse → slug context → exports paywall).
 * Returns the request context or an error Response.
 */
export async function requireExportContext(
  slug: string,
  feature: "exports" | "analyticsPerformance" = "exports",
): Promise<
  | { ok: true; requestContext: NonNullable<ExportRequestContext> }
  | { ok: false; response: Response }
> {
  const requestContext = await getBusinessRequestContextForSlug(slug);
  if (!requestContext) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not found." }, { status: 404 }),
    };
  }
  if (!hasFeatureAccess(requestContext.businessContext.business.plan, feature)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Upgrade to Pro to export data." },
        { status: 403 },
      ),
    };
  }
  return { ok: true, requestContext };
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      "cache-control": "private, no-store",
      "content-disposition": buildContentDisposition(filename),
      "content-type": "text/csv; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

export function buildListCsvResponse<TRecord>(
  columns: readonly CsvColumn<TRecord>[],
  rows: readonly TRecord[],
  filenameBase: string,
): Response {
  return csvResponse(
    buildCsv(columns, rows),
    `${filenameBase}-${formatDateForExportFileName()}.csv`,
  );
}

/**
 * Shared single-document png→pdf pipeline (was copy-pasted across 3
 * [id]/export routes: format parse → printUrl → render → png|pdf).
 */
export async function exportSingleDocument(input: {
  request: Request;
  printUrl: string;
  pngFileName: string;
  pdfFileName: string;
  pdfTitle: string;
}): Promise<Response> {
  const formatResult = exportFormatSchema.safeParse(
    new URL(input.request.url).searchParams.get("format") ?? "pdf",
  );
  const format = formatResult.success ? formatResult.data : "pdf";
  const png = await renderHtmlPageElementToPng({
    url: input.printUrl,
    selector: "[data-export-document]",
    cookieHeader: input.request.headers.get("cookie"),
  });

  if (format === "png") {
    return new Response(new Blob([Uint8Array.from(png)], { type: "image/png" }), {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": buildContentDisposition(input.pngFileName),
        "content-type": "image/png",
        "x-content-type-options": "nosniff",
      },
    });
  }

  const pdf = await createPdfFromPng({ png, title: input.pdfTitle });
  return new Response(
    new Blob([Uint8Array.from(pdf)], { type: "application/pdf" }),
    {
      headers: {
        "cache-control": "private, no-store",
        "content-disposition": buildContentDisposition(input.pdfFileName),
        "content-type": "application/pdf",
        "x-content-type-options": "nosniff",
      },
    },
  );
}
