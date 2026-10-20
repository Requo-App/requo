/**
 * Sitemap slug quality gate for public inquiry URLs.
 *
 * Dependency-free so `app/sitemap.ts`, `features/inquiries/queries.ts`, and
 * unit tests can share it without pulling in the DB.
 */

// ponytail: prefix denylist, tighten to an opt-in public flag if UGC volume grows
//
// `requo` is matched as a whole segment, not as a bare prefix: a business
// slug like `requo-plumbing` is a real business and must stay in the
// sitemap.
const EXCLUDED_SLUG_PATTERN =
  /^(test|demo|sample|example|staging|dev|requo)$|-test$/;

export function isInquirySitemapSlugExcluded(slug: string): boolean {
  return EXCLUDED_SLUG_PATTERN.test(slug.toLowerCase());
}
