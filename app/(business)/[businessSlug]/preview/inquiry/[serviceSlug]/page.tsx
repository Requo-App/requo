import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ServicePreviewShell } from "@/features/inquiries/components/service-preview-shell";
import { submitPublicInquiryAction } from "@/features/inquiries/actions";
import { getInquiryBusinessPreviewByServiceSlug } from "@/features/inquiries/queries";
import { getBusinessOperationalPageContext } from "../../../settings/_lib/page-context";
import { timed } from "@/lib/dev/server-timing";
import { getBusinessServicePath } from "@/features/businesses/routes";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Service preview",
  description: "Internal preview of a business service before publishing.",
});


export default async function ServicePreviewPage({
  params,
}: {
  params: Promise<{ businessSlug: string; serviceSlug: string }>;
}) {
  const { businessSlug, serviceSlug } = await params;
  const [, business] = await timed(
    "previewInquiryForm.parallelContextAndBusiness",
    Promise.all([
      getBusinessOperationalPageContext(businessSlug),
      getInquiryBusinessPreviewByServiceSlug({
        businessSlug: businessSlug,
        serviceSlug,
      }),
    ]),
  );

  if (!business) {
    notFound();
  }

  const settingsHref = getBusinessServicePath(businessSlug, serviceSlug);
  const submitPublicInquiry = submitPublicInquiryAction.bind(
    null,
    business.slug,
    business.form.slug,
  );

  return (
    <ServicePreviewShell
      action={submitPublicInquiry}
      business={business}
      settingsHref={settingsHref}
    />
  );
}
