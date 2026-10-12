import { z } from "zod";
import { NextResponse } from "next/server";

import { getInquiryDocumentData } from "@/features/inquiries/documents";
import {
  getInquiryPdfFileName,
  getInquiryPngFileName,
} from "@/features/inquiries/pdf";
import { getInquiryDetailForBusiness } from "@/features/inquiries/queries";
import { getBusinessInquiryPrintPath } from "@/features/businesses/routes";
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

  const inquiry = await getInquiryDetailForBusiness({
    businessId: requestContext.businessContext.business.id,
    inquiryId: parsedParams.data.id,
  });

  if (!inquiry) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const documentData = getInquiryDocumentData({
    businessName: requestContext.businessContext.business.name,
    businessCurrency: requestContext.businessContext.business.defaultCurrency,
    inquiry,
  });
  const printUrl = new URL(
    `${getBusinessInquiryPrintPath(parsedParams.data.slug, inquiry.id)}?autoprint=0`,
    request.url,
  ).toString();

  return exportSingleDocument({
    request,
    printUrl,
    pngFileName: getInquiryPngFileName(documentData),
    pdfFileName: getInquiryPdfFileName(documentData),
    pdfTitle: `${documentData.referenceId} request`,
  });
}
