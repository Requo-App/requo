import type { Metadata } from "next";
import { Suspense } from "react";

import { PricingPage } from "@/components/marketing/pricing-page";
import { StructuredData } from "@/components/seo/structured-data";
import { getPlanPrice } from "@/lib/billing/plans";
import { detectDisplayCurrency } from "@/lib/billing/region";
import type {
  BillingCurrency,
  BillingInterval,
  PaidPlan,
} from "@/lib/billing/types";
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
    "Requo pricing: Free, Pro, and Business plans for quote software. Annual billing includes two months free. Local pricing is shown for supported countries; USD is the default.",
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
 * smallest-unit amount to a decimal value in the visitor's display currency.
 */
function buildPricingOffers(currency: BillingCurrency) {
  const intervals: ReadonlyArray<BillingInterval> = ["monthly", "yearly"];

  return planTiers.flatMap((plan) =>
    intervals.map((interval) => {
      const price =
        plan === "free"
          ? 0
          : getPlanPrice(plan as PaidPlan, currency, interval) / 100;

      return {
        billingIncrement: INTERVAL_TO_INCREMENT[interval],
        name: `${planMeta[plan as PlanTier].label} (${INTERVAL_SUFFIX[interval]})`,
        price,
        priceCurrency: currency,
      };
    }),
  );
}

async function PricingPageDynamic() {
  let currency: BillingCurrency = "USD";
  try {
    currency = await detectDisplayCurrency();
  } catch {
    // Fall back to USD if geo detection fails (for example when headers are
    // unavailable during a static pre-render or edge runtime mismatch).
  }

  const productStructuredData = getProductPricingStructuredData({
    description: "Quote software for service businesses.",
    name: "Requo",
    offers: buildPricingOffers(currency),
    url: absoluteUrl("/pricing"),
  });

  return (
    <>
      <StructuredData
        data={productStructuredData}
        id="requo-product-pricing-structured-data"
      />
      <PricingPage currency={currency} />
    </>
  );
}

/**
 * The fallback and metadata use USD because this sync Server Component runs
 * before request headers are available. `PricingPageDynamic` reads Vercel geo
 * headers inside the Suspense boundary and renders both the cards and product
 * structured data in the visitor's fixed local currency.
 */
export default function PricingRoute() {
  const defaultCurrency: BillingCurrency = "USD";

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
