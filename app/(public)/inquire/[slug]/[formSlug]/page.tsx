import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";

import {
  parseSubmittedParam,
  PublicInquiryPageContent,
} from "@/features/inquiries/components/public-inquiry-page-content";
import {
  getMissingPublicInquiryMetadata,
  getPublicInquiryPageMetadata,
} from "@/features/inquiries/metadata";
import { getPublicInquiryBusinessByFormSlug } from "@/features/inquiries/queries";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { timed } from "@/lib/dev/server-timing";

// CDN cache headers in next.config.ts (s-maxage=60, stale-while-revalidate=300).
// `runtime = "edge"` is incompatible with `cacheComponents: true`.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; formSlug: string }>;
}): Promise<Metadata> {
  const { formSlug, slug } = await params;
  const business = await getPublicInquiryBusinessByFormSlug({
    businessSlug: slug,
    formSlug,
  });

  return business
    ? getPublicInquiryPageMetadata(business)
    : getMissingPublicInquiryMetadata();
}

export default async function PublicInquiryFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; formSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ slug, formSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const submitted = parseSubmittedParam(resolvedSearchParams.submitted);
  const business = await timed(
    "publicInquiryForm.getPublicInquiryBusinessByFormSlug",
    getPublicInquiryBusinessByFormSlug({
      businessSlug: slug,
      formSlug,
    }),
  );

  if (!business) {
    notFound();
  }

  if (business.form.isDefault) {
    permanentRedirect(getBusinessPublicInquiryUrl(business.slug));
  }

  return (
    <PublicInquiryPageContent
      business={business}
      submitted={submitted}
      pathname={`/inquire/${slug}/${formSlug}`}
      breadcrumbLabels={{
        "/inquire": "Inquire",
        [`/inquire/${slug}`]: business.name,
        [`/inquire/${slug}/${formSlug}`]: business.form.name,
      }}
    />
  );
}
