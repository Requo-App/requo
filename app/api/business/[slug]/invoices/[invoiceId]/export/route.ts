import { z } from "zod";
import { NextResponse } from "next/server";

import { getBusinessInvoicePrintPath } from "@/features/businesses/routes";
import { getInvoiceDocumentData } from "@/features/invoices/documents";
import { getInvoicePdfFileName, getInvoicePngFileName } from "@/features/invoices/pdf";
import { getInvoiceForBusiness } from "@/features/invoices/queries";
import { exportSingleDocument, requireExportContext } from "@/lib/api/exports";
import { slugParamSchema } from "@/lib/api/params";

const routeParamsSchema = slugParamSchema.extend({
  invoiceId: z.string().trim().min(1).max(128),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ slug: string; invoiceId: string }> },
) {
  const parsedParams = routeParamsSchema.safeParse(await context.params);

  if (!parsedParams.success) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const gate = await requireExportContext(parsedParams.data.slug);
  if (!gate.ok) return gate.response;
  const { requestContext } = gate;

  const invoice = await getInvoiceForBusiness({
    businessId: requestContext.businessContext.business.id,
    invoiceId: parsedParams.data.invoiceId,
  });

  if (!invoice) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const documentData = getInvoiceDocumentData({
    businessName: requestContext.businessContext.business.name,
    invoice,
  });
  const printUrl = new URL(
    `${getBusinessInvoicePrintPath(parsedParams.data.slug, invoice.id)}?autoprint=0`,
    request.url,
  ).toString();

  return exportSingleDocument({
    request,
    printUrl,
    pngFileName: getInvoicePngFileName(documentData),
    pdfFileName: getInvoicePdfFileName(documentData),
    pdfTitle: `${documentData.invoiceNumber} ${documentData.title}`,
  });
}
