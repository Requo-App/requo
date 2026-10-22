import { permanentRedirect } from "next/navigation";

import { getBusinessQuoteLibraryPath } from "@/features/businesses/routes";

type LegacyProductsPageProps = {
  params: Promise<{ businessSlug: string }>;
};

/**
 * Legacy quote-library route.
 *
 * This stays scoped to the authenticated business dashboard. A global
 * `/:businessSlug/products` redirect in `next.config.ts` would also match
 * `/b/products` and `/inquire/products` for a business whose slug is
 * `products`.
 */
export default async function LegacyProductsPage({
  params,
}: LegacyProductsPageProps) {
  const { businessSlug } = await params;

  permanentRedirect(getBusinessQuoteLibraryPath(businessSlug));
}
