import type { Metadata } from "next";

export const siteName = "Requo";
export const siteTwitterHandle = "@requoapp";
export const siteTagline =
  "Manage inquiries, send quotes, and follow up in one place.";
export const siteDescription =
  "Quote software for service businesses. Capture inquiries, send professional quotes, track viewed and accepted status, and follow up before opportunities go cold.";

/** Official Requo social profiles for Organization `sameAs` and marketing footer. */
export const siteSameAs = [
  "https://www.linkedin.com/company/requo-app",
  "https://x.com/requoapp",
  "https://www.instagram.com/requoapp",
  "https://www.facebook.com/profile.php?id=61590244777923",
  "https://github.com/marrrkkk/requo",
] as const;

const defaultSocialImagePath = "/opengraph-image";

export type PageMetadataOptions = {
  title?: string;
  absoluteTitle?: string;
  description: string;
  pathname?: string;
  noIndex?: boolean;
  imagePath?: string;
  twitterImagePath?: string;
  imageAlt?: string;
  brandTitle?: boolean;
  openGraphType?: "website" | "article";
  openGraphOverrides?: Partial<NonNullable<Metadata["openGraph"]>>;
  twitterOverrides?: Partial<NonNullable<Metadata["twitter"]>>;
};

/**
 * Thrown when none of the supported fallback sources (`BETTER_AUTH_URL`,
 * `VERCEL_URL`, or the dev-only `http://localhost:3000` default) can produce
 * a usable `metadataBase`. This fails the build rather than letting Next emit
 * relative OG/Twitter URLs that will not resolve.
 */
export class MetadataBaseResolutionError extends Error {
  override readonly name = "MetadataBaseResolutionError";
}

function normalizeConfiguredUrl(url: string) {
  const normalized = new URL(url);

  normalized.pathname = "/";
  normalized.search = "";
  normalized.hash = "";

  return normalized;
}

/**
 * Resolves the site's `metadataBase` using the documented fallback ladder:
 *
 * 1. `BETTER_AUTH_URL` (production, preview, and explicit local override)
 * 2. `VERCEL_URL` (automatic on preview deploys)
 * 3. `http://localhost:3000` (development only)
 *
 * Throws `MetadataBaseResolutionError` when none of the sources resolves, so
 * that a permanent misconfiguration fails the Next.js build instead of
 * silently emitting relative social URLs.
 */
export function assertMetadataBaseResolvable(): URL {
  const betterAuthUrl = process.env.BETTER_AUTH_URL?.trim();

  if (betterAuthUrl) {
    return normalizeConfiguredUrl(betterAuthUrl);
  }

  const vercelUrl = process.env.VERCEL_URL?.trim();

  if (vercelUrl) {
    return normalizeConfiguredUrl(
      vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`,
    );
  }

  if (process.env.NODE_ENV === "development") {
    return new URL("http://localhost:3000");
  }

  throw new MetadataBaseResolutionError(
    "Set `BETTER_AUTH_URL` in production or `VERCEL_URL` on preview deploys.",
  );
}

export function normalizePathname(pathname: string) {
  if (pathname === "/") {
    return pathname;
  }

  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;

  return withLeadingSlash.endsWith("/")
    ? withLeadingSlash.slice(0, -1)
    : withLeadingSlash;
}

export function getSiteUrl() {
  return assertMetadataBaseResolvable();
}

export function getSiteOrigin() {
  return getSiteUrl().origin;
}

export function absoluteUrl(pathname = "/") {
  return new URL(normalizePathname(pathname), getSiteUrl()).toString();
}

export function formatSiteTitle(title: string) {
  return title.includes(siteName) ? title : `${title} | ${siteName}`;
}

export function createNoIndexRobots() {
  return {
    googleBot: {
      follow: false,
      index: false,
      noimageindex: true,
    },
    follow: false,
    index: false,
  } satisfies NonNullable<Metadata["robots"]>;
}

export function createPageMetadata({
  title,
  absoluteTitle,
  description,
  pathname,
  noIndex = false,
  imagePath = defaultSocialImagePath,
  twitterImagePath = "/twitter-image",
  imageAlt = `${siteName} social preview`,
  brandTitle = true,
  openGraphType = "website",
  openGraphOverrides,
  twitterOverrides,
}: PageMetadataOptions): Metadata {
  const socialTitle = absoluteTitle
    ? absoluteTitle
    : title
      ? brandTitle
        ? formatSiteTitle(title)
        : title
      : siteName;

  const openGraph: NonNullable<Metadata["openGraph"]> = {
    description,
    ...(pathname ? { url: normalizePathname(pathname) } : {}),
    images: [
      {
        alt: imageAlt,
        height: 630,
        url: normalizePathname(imagePath),
        width: 1200,
      },
    ],
    locale: "en_US",
    siteName,
    title: socialTitle,
    type: openGraphType,
    ...(openGraphOverrides ?? {}),
  };

  const twitter: NonNullable<Metadata["twitter"]> = {
    card: "summary_large_image",
    creator: siteTwitterHandle,
    description,
    images: [normalizePathname(twitterImagePath)],
    site: siteTwitterHandle,
    title: socialTitle,
    ...(twitterOverrides ?? {}),
  };

  return {
    ...(absoluteTitle
      ? {
          title: {
            absolute: absoluteTitle,
          },
        }
      : title
        ? { title }
        : {}),
    description,
    ...(pathname
      ? {
          alternates: {
            canonical: normalizePathname(pathname),
          },
        }
      : {}),
    ...(noIndex ? { robots: createNoIndexRobots() } : {}),
    openGraph,
    twitter,
  };
}

export function createNoIndexMetadata({
  title,
  absoluteTitle,
  description,
}: {
  title?: string;
  absoluteTitle?: string;
  description: string;
}): Metadata {
  return createPageMetadata({
    absoluteTitle,
    brandTitle: false,
    description,
    noIndex: true,
    title,
  });
}

// Fail the build immediately when `metadataBase` cannot be resolved so that
// permanent misconfiguration surfaces at build time rather than producing
// relative OG/Twitter URLs on the deployed site.
assertMetadataBaseResolvable();
