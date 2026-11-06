import type { Metadata } from "next";
import { cacheLife } from "next/cache";

import {
  faqItems,
  landingFeatureItems,
} from "@/components/marketing/marketing-data";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { StructuredData } from "@/components/seo/structured-data";
import { isSelfHostedDeployment } from "@/lib/deployment";
import {
  getFaqPageStructuredData,
  getSoftwareApplicationStructuredData,
} from "@/lib/seo/structured-data";
import {
  absoluteUrl,
  createPageMetadata,
  getSiteOrigin,
  siteName,
} from "@/lib/seo/site";

const marketingDescription =
  "Quote software for service businesses. Capture inquiries, draft professional quotes, track viewed and accepted status, and follow up before opportunities go cold.";

export const metadata: Metadata = {
  ...createPageMetadata({
    absoluteTitle: "Requo | Quote & Inquiry Management for Service Businesses",
    description: marketingDescription,
    pathname: "/",
  }),
  keywords: [
    "quote software",
    "quotation software",
    "estimate software",
    "proposal software",
    "service business software",
    "inquiry management",
    "quote tracking",
    "follow-up software",
    "custom quote software",
    "inquiry to quote",
  ],
};

export default async function MarketingPage() {
  "use cache";
  cacheLife("hours");
  const softwareApplicationStructuredData = getSoftwareApplicationStructuredData(
    {
      description: marketingDescription,
      featureList: landingFeatureItems.map((item) => item.title),
      name: siteName,
      offers: isSelfHostedDeployment()
        ? []
        : [
            { price: 0, priceCurrency: "USD", url: absoluteUrl("/pricing") },
            { price: 9, priceCurrency: "USD", url: absoluteUrl("/pricing") },
            { price: 24, priceCurrency: "USD", url: absoluteUrl("/pricing") },
          ],
      url: getSiteOrigin(),
    },
  );
  const faqPageStructuredData = getFaqPageStructuredData({
    items: faqItems,
  });

  return (
    <>
      <StructuredData
        data={softwareApplicationStructuredData}
        id="requo-software-application-structured-data"
      />
      <StructuredData
        data={faqPageStructuredData}
        id="requo-faq-page-structured-data"
      />
      <MarketingHero />
    </>
  );
}
