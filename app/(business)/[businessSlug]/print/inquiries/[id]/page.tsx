import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintPageShell } from "@/components/shared/print-page-shell";
import { InquiryPrintDocument } from "@/features/inquiries/components/inquiry-print-document";
import { getInquiryDetailForBusiness } from "@/features/inquiries/queries";
import { inquiryRouteParamsSchema } from "@/features/inquiries/schemas";
import { getBusinessInquiryPath } from "@/features/businesses/routes";
import { requireExportRequestContext } from "@/lib/exports";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Inquiry print",
  description: "Print-friendly view of a single inquiry for business owners.",
});

type InquiryPrintPageProps = {
  params: Promise<{
    businessSlug: string;
    id: string;
  }>;
};

export default async function InquiryPrintPage({
  params,
}: InquiryPrintPageProps) {
  const resolvedParams = await params;
  const requestContext =
    await requireExportRequestContext(resolvedParams.businessSlug);

  const parsedParams = inquiryRouteParamsSchema.safeParse({
    id: resolvedParams.id,
  });

  if (!parsedParams.success) {
    notFound();
  }

  const inquiry = await getInquiryDetailForBusiness({
    businessId: requestContext.businessContext.business.id,
    inquiryId: parsedParams.data.id,
  });

  if (!inquiry) {
    notFound();
  }

  return (
    <PrintPageShell
      backHref={getBusinessInquiryPath(resolvedParams.businessSlug, inquiry.id)}
      backLabel="Back to inquiry"
      description="Submitted inquiry content only. Internal notes, activity, AI, and status controls are intentionally omitted."
      title={`Inquiry ${inquiry.id}`}
    >
      <InquiryPrintDocument
        businessCurrency={requestContext.businessContext.business.defaultCurrency}
        businessName={requestContext.businessContext.business.name}
        inquiry={inquiry}
      />
    </PrintPageShell>
  );
}
