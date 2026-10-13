import { notFound } from "next/navigation";

import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { hasFeatureAccess } from "@/lib/plans";

export type ExportRequestContext = NonNullable<
  Awaited<ReturnType<typeof getBusinessRequestContextForSlug>>
>;

/**
 * Shared guard for owner print/export routes: membership check + `exports`
 * plan gate. Single home for the preamble previously copied into the quote,
 * invoice, and inquiry print pages. Never returns null — 404s instead.
 */
export async function requireExportRequestContext(
  businessSlug: string,
): Promise<ExportRequestContext> {
  const requestContext = await getBusinessRequestContextForSlug(businessSlug);

  if (
    !requestContext ||
    !hasFeatureAccess(
      requestContext.businessContext.business.plan,
      "exports",
    )
  ) {
    notFound();
  }

  return requestContext;
}
