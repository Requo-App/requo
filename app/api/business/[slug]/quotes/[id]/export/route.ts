import { z } from "zod";
import { NextResponse } from "next/server";

import { getQuoteDocumentData } from "@/features/quotes/documents";
import { getQuotePdfFileName, getQuotePngFileName } from "@/features/quotes/pdf";
import { getQuoteDetailForBusiness } from "@/features/quotes/queries";
import { getBusinessQuotePrintPath } from "@/features/businesses/routes";
import { exportSingleDocument, requireExportContext } from "@/lib/api/exports";
import { slugParamSchema } from "@/lib/api/params";

const routeParamsSchema = slugParamSchema.extend({
  id: z.string().trim().min(1).max(128),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; id: string }> },
) {
  const parsedParams = routeParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const gate = await requireExportContext(parsedParams.data.slug);
  if (!gate.ok) return gate.response;
  const { requestContext } = gate;

  const quote = await getQuoteDetailForBusiness({
    businessId: requestContext.businessContext.business.id,
    quoteId: parsedParams.data.id,
  });

  if (!quote) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const documentData = getQuoteDocumentData({
    businessName: requestContext.businessContext.business.name,
    quote,
  });
  const printUrl = new URL(
    `${getBusinessQuotePrintPath(parsedParams.data.slug, quote.id)}?autoprint=0`,
    request.url,
  ).toString();

  return exportSingleDocument({
    request,
    printUrl,
    pngFileName: getQuotePngFileName(documentData),
    pdfFileName: getQuotePdfFileName(documentData),
    pdfTitle: `${documentData.quoteNumber} ${documentData.title}`,
  });
}
