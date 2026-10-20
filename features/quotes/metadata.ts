import type { Metadata } from "next";

import { quotePublicTokenSchema } from "@/features/quotes/schemas";
import { createPageMetadata } from "@/lib/seo/site";

export type PublicQuoteMetadataInput = {
  token: string;
  title: string;
  quoteNumber: string;
  businessName: string;
};

function resolvePrimaryLabel(input: PublicQuoteMetadataInput) {
  const trimmedTitle = input.title.trim();

  if (trimmedTitle.length > 0) {
    return trimmedTitle;
  }

  return `Quote ${input.quoteNumber}`.trim();
}

export function getPublicQuotePageMetadata(
  input: PublicQuoteMetadataInput,
): Metadata {
  const primaryLabel = resolvePrimaryLabel(input);

  return createPageMetadata({
    absoluteTitle: `${primaryLabel} - ${input.businessName}`,
    description: `Review and respond to this quote from ${input.businessName}.`,
    noIndex: true,
    pathname: `/quote/${input.token}`,
  });
}

export function getMissingPublicQuoteMetadata(token?: string): Metadata {
  // Only a token that matches the public token shape may be reflected into the
  // canonical URL — an arbitrary path segment must never reach the metadata.
  const trimmedToken = token?.trim();
  const parsed = quotePublicTokenSchema.safeParse(trimmedToken);

  return createPageMetadata({
    absoluteTitle: "Customer quote",
    brandTitle: false,
    description: "Review and respond to a customer quote securely.",
    noIndex: true,
    ...(parsed.success ? { pathname: `/quote/${parsed.data}` } : {}),
  });
}
