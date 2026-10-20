import type { Metadata } from "next";



import type { PublicInquiryBusiness } from "@/features/inquiries/types";

import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";

import { createNoIndexMetadata, createPageMetadata } from "@/lib/seo/site";



export function getPublicInquiryPagePath(business: PublicInquiryBusiness) {

  return business.form.isDefault

    ? getBusinessPublicInquiryUrl(business.slug)

    : getBusinessPublicInquiryUrl(business.slug, business.form.slug);

}



function truncateMetaDescription(text: string, maxLen: number) {

  const normalized = text.trim();

  if (normalized.length <= maxLen) {

    return normalized;

  }



  return `${normalized.slice(0, maxLen - 3).trimEnd()}...`;

}



/** Primary page title — form name first, business name for disambiguation. */

export function getPublicInquiryPageTitle(business: PublicInquiryBusiness) {

  return `${business.form.name} - ${business.name}`;

}



export function getPublicInquiryBreadcrumbLabel(business: PublicInquiryBusiness) {

  return business.form.name;

}



export function getPublicInquiryPageDescription(

  business: PublicInquiryBusiness,

) {

  const rawDescription =

    business.inquiryPageConfig.description?.trim() ||

    business.shortDescription?.trim() ||

    `Submit ${business.form.name} to ${business.name}.`;



  return truncateMetaDescription(rawDescription, 160);

}



export function getPublicInquiryPageMetadata(

  business: PublicInquiryBusiness,

  options?: { submitted?: boolean },

): Metadata {

  const metadata = createPageMetadata({

    absoluteTitle: getPublicInquiryPageTitle(business),

    brandTitle: false,

    description: getPublicInquiryPageDescription(business),

    pathname: getPublicInquiryPagePath(business),

  });



  if (!options?.submitted) {

    return metadata;

  }



  // The thank-you state is reached through `?submitted=1`. It is not a

  // distinct page worth indexing, and it must not compete with the form

  // URL in search results.

  return {

    ...metadata,

    robots: {

      index: false,

      follow: false,

    },

  };

}



export function getMissingPublicInquiryMetadata() {

  return createNoIndexMetadata({

    absoluteTitle: "Inquiry form",

    description: "Public inquiry page for a Requo business.",

  });

}


