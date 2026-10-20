import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicQuotePageRenderer } from "@/features/quotes/components/public-quote-page-renderer";
import { PublicQuoteViewTracker } from "@/features/analytics/components/public-page-analytics-tracker";
import { PublicQuoteInteractiveColumn } from "@/features/quotes/components/public-quote-interactive-column";
import { respondToPublicQuoteAction, requestQuoteRevisionAction } from "@/features/quotes/actions";
import {
  getMissingPublicQuoteMetadata,
  getPublicQuotePageMetadata,
} from "@/features/quotes/metadata";
import { getPublicQuoteByToken } from "@/features/quotes/queries";
import { quotePublicRouteParamsSchema } from "@/features/quotes/schemas";

// CDN cache headers in next.config.ts (s-maxage=60, stale-while-revalidate=300).
// `runtime = "edge"` is incompatible with `cacheComponents: true`.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  let rawToken: string | undefined;

  try {
    const { token } = await params;
    rawToken = token;

    const parsedParams = quotePublicRouteParamsSchema.safeParse({ token });

    if (!parsedParams.success) {
      return getMissingPublicQuoteMetadata(token);
    }

    const quote = await getPublicQuoteByToken(parsedParams.data.token);

    if (!quote) {
      return getMissingPublicQuoteMetadata(parsedParams.data.token);
    }

    return getPublicQuotePageMetadata({
      businessName: quote.businessName,
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      token: parsedParams.data.token,
    });
  } catch {
    return getMissingPublicQuoteMetadata(rawToken);
  }
}

export default async function PublicQuotePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const parsedParams = quotePublicRouteParamsSchema.safeParse(await params);

  if (!parsedParams.success) {
    notFound();
  }

  const quote = await getPublicQuoteByToken(parsedParams.data.token);

  if (!quote) {
    notFound();
  }

  const respondAction = respondToPublicQuoteAction.bind(null, quote.token);
  const revisionAction = requestQuoteRevisionAction.bind(null, quote.token);

  // Only what the interactive column renders crosses the server/client
  // boundary — the full quote carries internal ids and the business plan.
  const interactiveQuote = {
    quoteNumber: quote.quoteNumber,
    businessName: quote.businessName,
    businessContactEmail: quote.businessContactEmail,
    status: quote.status,
    version: quote.version,
    validUntil: quote.validUntil,
    customerRespondedAt: quote.customerRespondedAt,
    customerResponseMessage: quote.customerResponseMessage,
    acceptance: quote.acceptance
      ? {
          signerName: quote.acceptance.signerName,
          quoteVersion: quote.acceptance.quoteVersion,
          acceptedAt: quote.acceptance.acceptedAt,
        }
      : null,
  };

  return (
    <PublicQuotePageRenderer
      quote={quote}
      businessPlan={quote.businessPlan}
      hideHeader
      interactiveColumn={
        <PublicQuoteInteractiveColumn
          quote={interactiveQuote}
          respondAction={respondAction}
          revisionAction={revisionAction}
        />
      }
      afterContent={
        <PublicQuoteViewTracker
          businessId={quote.businessId}
          quoteId={quote.id}
        />
      }
    />
  );
}
