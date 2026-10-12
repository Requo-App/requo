import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { DashboardDetailPageSkeleton } from "@/components/shell/dashboard-detail-page-skeleton";
import { BusinessQuotePreviewShell } from "@/features/quotes/components/business-quote-preview-shell";
import {
  getBusinessContactEmailForPreview,
  getQuoteDetailForBusiness,
} from "@/features/quotes/queries";
import { quoteRouteParamsSchema } from "@/features/quotes/schemas";
import { toPublicQuoteView } from "@/features/quotes/utils";
import { getBusinessQuotePath } from "@/features/businesses/routes";
import { getAppShellContext } from "@/lib/app-shell/context";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Quote preview",
  description: "Internal preview of a quote as the customer would see it.",
});

type QuotePreviewPageProps = {
  params: Promise<{ businessSlug: string; id: string }>;
};

export const instant = true;

/**
 * Quote preview page — returns a route-specific skeleton synchronously.
 *
 * All dynamic reads (params, getAppShellContext, quote queries) resolve
 * inside a Suspense-wrapped child server component so navigation paints the
 * quote-shaped loading UI instantly instead of blocking on data.
 */
export default function QuotePreviewPage({ params }: QuotePreviewPageProps) {
  return (
    <Suspense fallback={<DashboardDetailPageSkeleton variant="quote" />}>
      <QuotePreviewRegion params={params} />
    </Suspense>
  );
}

async function QuotePreviewRegion({ params }: QuotePreviewPageProps) {
  const resolvedParams = await params;
  const { businessContext } = await getAppShellContext(
    resolvedParams.businessSlug,
  );

  const parsedParams = quoteRouteParamsSchema.safeParse(resolvedParams);

  if (!parsedParams.success) {
    notFound();
  }

  const businessSlug = businessContext.business.slug;
  const [quote, businessContactEmail] = await Promise.all([
    getQuoteDetailForBusiness({
      businessId: businessContext.business.id,
      quoteId: parsedParams.data.id,
    }),
    getBusinessContactEmailForPreview(businessContext.business.id),
  ]);

  if (!quote) {
    notFound();
  }

  const backHref = getBusinessQuotePath(businessSlug, quote.id);

  // Map the dashboard row to the PublicQuoteView shape expected by the renderer
  const publicQuoteView = toPublicQuoteView({
    quote,
    business: businessContext.business,
    businessContactEmail,
    token: "",
    publicViewedAt: null,
    items: quote.items,
  });

  return (
    <BusinessQuotePreviewShell
      quote={publicQuoteView}
      businessPlan={businessContext.business.plan}
      businessContactEmail={businessContactEmail}
      businessName={businessContext.business.name}
      backHref={backHref}
    />
  );
}
