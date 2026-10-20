import type { Metadata } from "next";
import { notFound } from "next/navigation";

import {
  parseSubmittedParam,
  PublicInquiryPageContent,
} from "@/features/inquiries/components/public-inquiry-page-content";
import {
  getMissingPublicInquiryMetadata,
  getPublicInquiryBreadcrumbLabel,
  getPublicInquiryPageMetadata,
} from "@/features/inquiries/metadata";
import { getPublicInquiryBusinessBySlug } from "@/features/inquiries/queries";
import { timed } from "@/lib/dev/server-timing";

// CDN cache headers in next.config.ts (s-maxage=60, stale-while-revalidate=300).
// `runtime = "edge"` is incompatible with `cacheComponents: true`.

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}): Promise<Metadata> {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const business = await getPublicInquiryBusinessBySlug(slug);

  return business
    ? getPublicInquiryPageMetadata(business, {
        submitted: parseSubmittedParam(resolvedSearchParams.submitted),
      })
    : getMissingPublicInquiryMetadata();
}

export default async function PublicInquiryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ slug }, resolvedSearchParams] = await Promise.all([
    params,
    searchParams,
  ]);
  const submitted = parseSubmittedParam(resolvedSearchParams.submitted);
  const business = await timed(
    "publicInquiry.getPublicInquiryBusinessBySlug",
    getPublicInquiryBusinessBySlug(slug),
  );

  if (!business) {
    notFound();
  }

  return (
    <PublicInquiryPageContent
      business={business}
      submitted={submitted}
      pathname={`/inquire/${slug}`}
      breadcrumbLabels={{
        "/inquire": "Inquire",
        [`/inquire/${slug}`]: getPublicInquiryBreadcrumbLabel(business),
      }}
    />
  );
}
