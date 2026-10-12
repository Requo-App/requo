import type { Metadata } from "next";

import type { PublicBusinessProfile } from "@/features/businesses/types";
import {
  createNoIndexMetadata,
  formatSiteTitle,
  siteTagline,
} from "@/lib/seo/site";

/**
 * Upper bound for `<meta name="description">` content length. Longer values
 * are truncated with an ellipsis rather than rejected so we always emit a
 * meaningful description even when the owner writes a very long summary.
 */
const META_DESCRIPTION_MAX_LENGTH = 160;

/**
 * Pathname of the public business entry point. Matches the redirect in
 * `next.config.ts` (`/b/:slug` → `/b/:slug/inquire`); keep the two in sync so
 * `alternates.canonical` resolves to a URL that actually renders.
 */
export function getPublicBusinessPagePath(slug: string) {
  return `/b/${slug}/inquire`;
}

/**
 * Clip a meta description to `META_DESCRIPTION_MAX_LENGTH` characters,
 * appending an ellipsis when truncation is needed. Preserves whitespace
 * trimming so callers can pass raw business copy without normalising
 * first.
 */
function truncateMetaDescription(text: string) {
  const normalized = text.trim();

  if (normalized.length <= META_DESCRIPTION_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, META_DESCRIPTION_MAX_LENGTH - 3).trimEnd()}...`;
}

/**
 * Documented fallback ladder for the meta description of a public business
 * profile. Uses the longer `description` field when set, then the short
 * description, then the generic site tagline so an owner never ships a
 * blank description tag.
 */
function resolvePublicBusinessDescription(business: PublicBusinessProfile) {
  const raw =
    business.description?.trim() ||
    business.shortDescription?.trim() ||
    siteTagline;

  return truncateMetaDescription(raw);
}

/**
 * Build `Metadata` for a public business profile page.
 *
 * Profiles stay noindex until rich public profile UX ships — the current
 * placeholder surface is not meant for organic discovery.
 */
export function getPublicBusinessPageMetadata(
  business: PublicBusinessProfile,
): Metadata {
  return createNoIndexMetadata({
    absoluteTitle: formatSiteTitle(business.name),
    description: resolvePublicBusinessDescription(business),
  });
}

/**
 * `Metadata` returned when the requested slug is missing or the business
 * is not publicly visible (archived, locked, or soft-deleted). Noindex so
 * crawlers do not accumulate rank on placeholder pages, and the title is
 * kept generic so we never leak the slug the crawler was probing.
 */
export function getMissingPublicBusinessMetadata(): Metadata {
  return createNoIndexMetadata({
    absoluteTitle: "Business profile",
    description: "This Requo business profile is unavailable.",
  });
}
