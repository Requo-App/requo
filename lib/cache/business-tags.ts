import { revalidateTag, updateTag } from "next/cache";

export const hotBusinessCacheLife = {
  stale: 20,
  revalidate: 20,
  expire: 300,
} as const;

export const settingsBusinessCacheLife = {
  stale: 60,
  revalidate: 60,
  expire: 600,
} as const;

function getBusinessScopeTag(businessId: string) {
  return `business:${businessId}`;
}

export function getBusinessScopeCacheTag(businessId: string) {
  return getBusinessScopeTag(businessId);
}

export function uniqueCacheTags(
  tags: Array<string | null | undefined>,
): string[] {
  return Array.from(
    new Set(tags.filter((tag): tag is string => Boolean(tag))),
  );
}

/**
 * Purges "use cache" reads for the given tags, deduplicated.
 * Route/fetch-cache convergence (`revalidateTag`) is a separate decision
 * callers make explicitly — see invoices `invalidate()`.
 */
export function updateCacheTags(tags: string[]): void {
  for (const tag of uniqueCacheTags(tags)) {
    updateTag(tag);
  }
}

/**
 * Invalidates a set of tags completely.
 *
 * Both primitives are needed and neither is sufficient alone:
 *
 * - `updateTag` purges "use cache" reads (list, detail, activity) so the next
 *   request reads fresh data.
 * - `revalidateTag(tag, "max")` converges the route/fetch cache. It serves the
 *   stale value while it refreshes in the background, so on its own a reader
 *   can still see pre-write data.
 *
 * Using only one leaves stale reads behind — for example a quote that still
 * shows "sent" after the customer accepted it.
 */
export function invalidateCacheTags(tags: string[]): void {
  const uniqueTags = uniqueCacheTags(tags);

  for (const tag of uniqueTags) {
    updateTag(tag);
  }

  for (const tag of uniqueTags) {
    revalidateTag(tag, "max");
  }
}

export function getBusinessSettingsCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:settings`]);
}

export function getBusinessMembersCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:settings`,
    `${scopeTag}:members`,
  ]);
}

export function getServicesCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:settings`,
    `${scopeTag}:inquiry-forms`,
  ]);
}

export function getServiceCacheTags(
  businessId: string,
  serviceSlug: string,
) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:settings`,
    `${scopeTag}:inquiry-forms`,
    `${scopeTag}:inquiry-form:${serviceSlug}`,
  ]);
}

export function getBusinessInquiryListCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:inquiries`,
  ]);
}

export function getBusinessInquiryDetailCacheTags(
  businessId: string,
  inquiryId: string,
) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:inquiries`,
    `${scopeTag}:inquiry:${inquiryId}`,
    `${scopeTag}:quotes`,
  ]);
}

export function getBusinessQuoteListCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:quotes`,
  ]);
}

export function getBusinessQuoteDetailCacheTags(
  businessId: string,
  quoteId: string,
) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:quotes`,
    `${scopeTag}:quote:${quoteId}`,
    `${scopeTag}:inquiries`,
  ]);
}

export function getBusinessFollowUpListCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:follow-ups`,
  ]);
}

export function getBusinessInvoiceListCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:invoices`,
  ]);
}

export function getBusinessInvoiceDetailCacheTags(businessId: string, invoiceId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:invoices`,
    `${scopeTag}:invoice:${invoiceId}`,
  ]);
}

export function getBusinessQuoteLibraryCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:settings`,
    `${scopeTag}:products`,
  ]);
}

export function getKnowledgeCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:settings`,
    `${scopeTag}:knowledge`,
  ]);
}

export function getBusinessAnalyticsCacheTags(
  businessId: string,
  rangeSuffix?: string,
) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    rangeSuffix
      ? `${scopeTag}:analytics:${rangeSuffix}`
      : `${scopeTag}:analytics`,
    `${scopeTag}:inquiries`,
    `${scopeTag}:quotes`,
  ]);
}

export function getBusinessOverviewCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:overview`,
    `${scopeTag}:inquiries`,
    `${scopeTag}:quotes`,
    `${scopeTag}:follow-ups`,
  ]);
}

/**
 * Tags for the cached public business profile query consumed by
 * `/businesses/[slug]` and its `generateMetadata`. Keyed by slug because
 * public metadata resolution only has the slug in hand; `revalidateTag`
 * callers that already hold the business id should additionally pass the
 * `business:<id>` scope tag via their existing settings helpers so both
 * paths invalidate together.
 */
export function getPublicBusinessProfileCacheTags(slug: string) {
  return uniqueCacheTags([
    `business-slug:${slug}`,
    `business-public-profile:${slug}`,
  ]);
}

export function getBusinessChecklistCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([
    scopeTag,
    `${scopeTag}:dashboard`,
    `${scopeTag}:checklist`,
    `${scopeTag}:inquiries`,
  ]);
}

/**
 * Tags for the behavior-pack assignment reader (verticalization F-01).
 * Pack assignment is business configuration: the scope tag keeps dashboard
 * reads coherent and the `:pack` tag lets future cached readers invalidate
 * independently of settings.
 */
export function getBusinessPackCacheTags(businessId: string) {
  const scopeTag = getBusinessScopeTag(businessId);

  return uniqueCacheTags([scopeTag, `${scopeTag}:pack`]);
}
