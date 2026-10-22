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
import { getPublicInquiryBusinessByServiceSlug } from "@/features/inquiries/queries";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { timed } from "@/lib/dev/server-timing";

// CDN cache headers in next.config.ts (s-maxage=60, stale-while-revalidate=300).
// `runtime = "edge"` is incompatible with `cacheComponents: true`.

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; serviceSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const [{ serviceSlug, slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const business = await getPublicInquiryBusinessByServiceSlug({
    businessSlug: slug,
    serviceSlug,
  });

  return business
    ? getPublicInquiryPageMetadata(business, {
        submitted: parseSubmittedParam(resolvedSearchParams.submitted),
      })
    : getMissingPublicInquiryMetadata();
}

export default async function PublicInquiryFormPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; serviceSlug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ slug, serviceSlug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const submitted = parseSubmittedParam(resolvedSearchParams.submitted);
  const business = await timed(
    "publicInquiryForm.getPublicInquiryBusinessByServiceSlug",
    getPublicInquiryBusinessByServiceSlug({
      businessSlug: slug,
      serviceSlug,
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
      pathname={`/inquire/${slug}/${serviceSlug}`}
      breadcrumbLabels={{
        "/inquire": "Inquire",
        [`/inquire/${slug}`]: business.name,
        [`/inquire/${slug}/${serviceSlug}`]: business.form.name,
      }}
    />
  );
}
