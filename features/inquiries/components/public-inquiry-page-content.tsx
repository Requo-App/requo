import { StructuredData } from "@/components/seo/structured-data";
import { PublicInquiryFormViewTracker } from "@/features/analytics/components/public-page-analytics-tracker";
import { submitPublicInquiryAction } from "@/features/inquiries/actions";
import { PublicInquiryPageRenderer } from "@/features/inquiries/components/public-inquiry-page-renderer";
import {
  getPublicInquiryPageDescription,
  getPublicInquiryPagePath,
  getPublicInquiryPageTitle,
} from "@/features/inquiries/metadata";
import type { PublicInquiryBusiness } from "@/features/inquiries/types";
import {
  buildBreadcrumbsForPathname,
  getBreadcrumbListStructuredData,
  getPublicInquiryWebPageStructuredData,
} from "@/lib/seo/structured-data";
import { absoluteUrl, getSiteOrigin, siteName } from "@/lib/seo/site";

/** `?submitted=1` flag shared by all public inquiry routes. */
export function parseSubmittedParam(
  value: string | string[] | undefined,
): boolean {
  return Array.isArray(value) ? value.includes("1") : value === "1";
}

/**
 * Shared body for `/inquire/[slug]` and `/inquire/[slug]/[formSlug]`.
 * Pages only differ by query + breadcrumb labels, so those stay in the route.
 */
export function PublicInquiryPageContent({
  business,
  submitted,
  pathname,
  breadcrumbLabels,
}: {
  business: PublicInquiryBusiness;
  submitted: boolean;
  pathname: string;
  breadcrumbLabels: Record<string, string>;
}) {
  const submitPublicInquiry = submitPublicInquiryAction.bind(
    null,
    business.slug,
    business.form.slug,
  );

  const pagePath = getPublicInquiryPagePath(business);
  const inquiryWebPageStructuredData = getPublicInquiryWebPageStructuredData({
    description: getPublicInquiryPageDescription(business),
    organizationLogoAbsoluteUrl: business.logoUrl
      ? absoluteUrl(business.logoUrl)
      : null,
    organizationName: business.name,
    pageName: getPublicInquiryPageTitle(business),
    pageUrl: absoluteUrl(pagePath),
    siteName,
    siteOrigin: getSiteOrigin(),
  });

  const breadcrumbItems = buildBreadcrumbsForPathname(
    pathname,
    breadcrumbLabels,
  );
  const breadcrumbStructuredData = breadcrumbItems.length
    ? getBreadcrumbListStructuredData({
        items: breadcrumbItems.map((item) => ({
          ...item,
          url: absoluteUrl(item.url),
        })),
      })
    : null;

  return (
    <>
      <StructuredData
        data={inquiryWebPageStructuredData}
        id="requo-public-inquiry-webpage-structured-data"
      />
      {breadcrumbStructuredData ? (
        <StructuredData
          data={breadcrumbStructuredData}
          id="breadcrumb-structured-data"
        />
      ) : null}
      <PublicInquiryPageRenderer
        business={business}
        action={submitPublicInquiry}
        submitted={submitted}
      />
      {!submitted ? (
        <PublicInquiryFormViewTracker
          businessId={business.id}
          businessInquiryFormId={business.form.id}
        />
      ) : null}
    </>
  );
}
