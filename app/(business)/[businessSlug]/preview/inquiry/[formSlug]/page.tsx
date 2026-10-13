import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { BusinessInquiryPreviewShell } from "@/features/inquiries/components/business-inquiry-preview-shell";
import { submitPublicInquiryAction } from "@/features/inquiries/actions";
import { getInquiryBusinessPreviewByFormSlug } from "@/features/inquiries/queries";
import { getBusinessOperationalPageContext } from "../../../settings/_lib/page-context";
import { timed } from "@/lib/dev/server-timing";
import { getBusinessServicePath } from "@/features/businesses/routes";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Service preview",
  description: "Internal preview of a business service before publishing.",
});


export default async function BusinessInquiryFormPreviewPage({
  params,
}: {
  params: Promise<{ businessSlug: string; formSlug: string }>;
}) {
  const { businessSlug, formSlug } = await params;
  const [, business] = await timed(
    "previewInquiryForm.parallelContextAndBusiness",
    Promise.all([
      getBusinessOperationalPageContext(businessSlug),
      getInquiryBusinessPreviewByFormSlug({
        businessSlug: businessSlug,
        formSlug,
      }),
    ]),
  );

  if (!business) {
    notFound();
  }

  const settingsHref = getBusinessServicePath(businessSlug, formSlug);
  const submitPublicInquiry = submitPublicInquiryAction.bind(
    null,
    business.slug,
    business.form.slug,
  );

  return (
    <BusinessInquiryPreviewShell
      action={submitPublicInquiry}
      business={business}
      settingsHref={settingsHref}
    />
  );
}
