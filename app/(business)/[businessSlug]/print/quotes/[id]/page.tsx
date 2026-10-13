import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PrintPageShell } from "@/components/shared/print-page-shell";
import { QuotePrintDocument } from "@/features/quotes/components/quote-print-document";
import { getAcceptanceForBusiness, getQuoteDetailForBusiness } from "@/features/quotes/queries";
import { quoteRouteParamsSchema } from "@/features/quotes/schemas";
import { getBusinessQuotePath } from "@/features/businesses/routes";
import { requireExportRequestContext } from "@/lib/exports";
import { createNoIndexMetadata } from "@/lib/seo/site";

export const metadata: Metadata = createNoIndexMetadata({
  title: "Quote print",
  description: "Print-friendly view of a single quote for business owners.",
});

type QuotePrintPageProps = {
  params: Promise<{
    businessSlug: string;
    id: string;
  }>;
};

export default async function QuotePrintPage({
  params,
}: QuotePrintPageProps) {
  const resolvedParams = await params;
  const requestContext =
    await requireExportRequestContext(resolvedParams.businessSlug);

  const parsedParams = quoteRouteParamsSchema.safeParse({
    id: resolvedParams.id,
  });

  if (!parsedParams.success) {
    notFound();
  }

  const [quote, acceptance] = await Promise.all([
    getQuoteDetailForBusiness({
      businessId: requestContext.businessContext.business.id,
      quoteId: parsedParams.data.id,
    }),
    getAcceptanceForBusiness({
      businessId: requestContext.businessContext.business.id,
      quoteId: parsedParams.data.id,
    }).catch(() => null),
  ]);

  if (!quote) {
    notFound();
  }

  return (
    <PrintPageShell
      backHref={getBusinessQuotePath(resolvedParams.businessSlug, quote.id)}
      backLabel="Back to quote"
      description="Customer-facing quote content only. This page is cleanly printable and opens the browser print dialog automatically."
      title={`Quote ${quote.quoteNumber}`}
    >
      <QuotePrintDocument
        businessName={requestContext.businessContext.business.name}
        businessLogoStoragePath={requestContext.businessContext.business.logoStoragePath}
        businessSlug={resolvedParams.businessSlug}
        quote={quote}
        acceptance={acceptance}
      />
    </PrintPageShell>
  );
}
