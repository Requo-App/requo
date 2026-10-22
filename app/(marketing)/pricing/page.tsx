import type { Metadata } from "next";
import { Suspense } from "react";

import { PricingPage } from "@/components/marketing/pricing-page";
import { StructuredData } from "@/components/seo/structured-data";
import { planPricing } from "@/lib/billing/plans";
import { detectDisplayCurrency } from "@/lib/billing/region";
import type { BillingCurrency, BillingInterval, PaidPlan } from "@/lib/billing/types";
import { planTiers, planMeta, type PlanTier } from "@/lib/plans/plans";
import { absoluteUrl, createPageMetadata } from "@/lib/seo/site";
import {
  buildBreadcrumbsForPathname,
  getBreadcrumbListStructuredData,
  getFaqPageStructuredData,
  getProductPricingStructuredData,
} from "@/lib/seo/structured-data";
import { pricingFaqs } from "@/lib/plans/catalog";

export const metadata: Metadata = createPageMetadata({
  description:
    "Requo pricing: Free $0, Pro $9/mo, Business $24/mo for quote software. Annual billing includes two months free. Start free, upgrade per business when you need more.",
  pathname: "/pricing",
  title: "Requo Pricing: Free, Pro, and Business Plans",
});

const INTERVAL_TO_INCREMENT: Record<BillingInterval, "month" | "year"> = {
  monthly: "month",
  yearly: "year",
};

const INTERVAL_SUFFIX: Record<BillingInterval, string> = {
  monthly: "monthly",
  yearly: "yearly",
};

/**
 * Builds schema.org Offer entries for every plan × interval pair from the
 * canonical plan catalog. Free plans get `price: 0`; paid plans convert the
 * cents amount in `planPricing` to a decimal currency value.
 */
function buildPricingOffers() {
  const intervals: ReadonlyArray<BillingInterval> = ["monthly", "yearly"];
  // Structured data always uses USD for consistency with schema.org.
  const sdCurrency = "USD";

  return planTiers.flatMap((plan) =>
    intervals.map((interval) => {
      const price =
        plan === "free"
          ? 0
          : planPricing[interval][plan as PaidPlan][sdCurrency] / 100;

      return {
        billingIncrement: INTERVAL_TO_INCREMENT[interval],
        name: `${planMeta[plan as PlanTier].label} (${INTERVAL_SUFFIX[interval]})`,
        price,
        priceCurrency: sdCurrency,
      };
    }),
  );
}

async function PricingPageDynamic() {
  let currency: BillingCurrency = "USD";
  try {
    currency = await detectDisplayCurrency();
  } catch {
    // Fall back to USD if geo detection fails (e.g. headers unavailable
    // during static pre-render or edge runtime mismatch).
  }
  return <PricingPage currency={currency} />;
}

/**
 * Uses USD as the default display currency at build time.
 * Polar always bills in USD regardless of display currency.
 * Client-side detection can be added for regional pricing display after hydration.
 * Stays a sync Server Component without "use cache": PricingPageDynamic reads
 * geo headers via detectDisplayCurrency, which opts the subtree into dynamic
 * rendering inside the Suspense boundary below.
 */
export default function PricingRoute() {
  const defaultCurrency: BillingCurrency = "USD";

  const productStructuredData = getProductPricingStructuredData({
    description: "Quote software for service businesses.",
    name: "Requo",
    offers: buildPricingOffers(),
    url: absoluteUrl("/pricing"),
  });

  const breadcrumbItems = buildBreadcrumbsForPathname("/pricing", {
    "/pricing": "Pricing",
  });
  const breadcrumbStructuredData = breadcrumbItems.length
    ? getBreadcrumbListStructuredData({
        items: [
          { name: "Home", url: absoluteUrl("/") },
          ...breadcrumbItems.map((item) => ({
            ...item,
            url: absoluteUrl(item.url),
          })),
        ],
      })
    : null;
  const faqStructuredData = getFaqPageStructuredData({
    items: [...pricingFaqs],
  });

  return (
    <>
      <StructuredData
        data={productStructuredData}
        id="requo-product-pricing-structured-data"
      />
      {breadcrumbStructuredData ? (
        <StructuredData
          data={breadcrumbStructuredData}
          id="breadcrumb-structured-data"
        />
      ) : null}
      <StructuredData
        data={faqStructuredData}
        id="pricing-faq-structured-data"
      />
      <Suspense fallback={<PricingPage currency={defaultCurrency} />}>
        <PricingPageDynamic />
      </Suspense>
    </>
  );
}
