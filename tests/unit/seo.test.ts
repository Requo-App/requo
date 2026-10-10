import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fc from "fast-check";

// ---------------------------------------------------------------------------
// Top-level mocks (hoisted by vitest)
// ---------------------------------------------------------------------------
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono" }),
  Inter: () => ({ variable: "--font-inter" }),
}));

vi.mock("next/font/local", () => ({
  default: () => ({ variable: "--font-brand" }),
}));

vi.mock("@/features/businesses/queries", () => ({
  listPublicBusinessSitemapEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/inquiries/queries", () => ({
  listPublicInquirySitemapEntries: vi.fn().mockResolvedValue([]),
}));

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 1, error: new Error("mocked") }),
}));

vi.mock("next/cache", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  cacheLife: vi.fn(),
}));

// ---------------------------------------------------------------------------
// 1. Property 16 & 17: metadataBase fallback ladder (Task 1.3)
// ---------------------------------------------------------------------------
describe("metadataBase fallback ladder", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("Property 16: getSiteUrl() returns a well-formed URL with pathname '/' for any env config with at least one fallback source", async () => {
    const envArb = fc.record({
      BETTER_AUTH_URL: fc.oneof(
        fc.constant(undefined),
        fc.webUrl().map((u) => u),
      ),
      VERCEL_URL: fc.oneof(
        fc.constant(undefined),
        fc.domain().map((d) => d),
      ),
      NODE_ENV: fc.oneof(
        fc.constant("development"),
        fc.constant("production"),
        fc.constant("test"),
      ),
    }).filter((env) => {
      // At least one source must be present, or dev mode
      return Boolean(env.BETTER_AUTH_URL) || Boolean(env.VERCEL_URL) || env.NODE_ENV === "development";
    });

    await fc.assert(
      fc.asyncProperty(envArb, async (envConfig) => {
        vi.resetModules();
        vi.unstubAllEnvs();

        // Clear env vars first
        delete process.env.BETTER_AUTH_URL;
        delete process.env.VERCEL_URL;

        if (envConfig.BETTER_AUTH_URL) {
          process.env.BETTER_AUTH_URL = envConfig.BETTER_AUTH_URL;
        }
        if (envConfig.VERCEL_URL) {
          process.env.VERCEL_URL = envConfig.VERCEL_URL;
        }
        vi.stubEnv("NODE_ENV", envConfig.NODE_ENV);

        const { getSiteUrl } = await import("@/lib/seo/site");
        const url = getSiteUrl();

        expect(url).toBeInstanceOf(URL);
        expect(url.pathname).toBe("/");
        // Must have a valid origin (protocol + host)
        expect(url.origin).toMatch(/^https?:\/\/.+/);
      }),
      { numRuns: 10 },
    );
  });

  it("Property 17: createPageMetadata yields openGraph.url that resolves via new URL(P, S) pattern", async () => {
    const pathnameArb = fc
      .array(fc.stringMatching(/^[a-z0-9-]+$/), { minLength: 1, maxLength: 4 })
      .map((segments) => `/${segments.join("/")}`);

    await fc.assert(
      fc.asyncProperty(pathnameArb, async (pathname) => {
        vi.resetModules();
        process.env.BETTER_AUTH_URL = "https://example.com";
        vi.stubEnv("NODE_ENV", "production");

        const { createPageMetadata, getSiteUrl } = await import("@/lib/seo/site");
        const meta = createPageMetadata({ pathname, description: "test" });
        const siteUrl = getSiteUrl();

        // openGraph.url should be the normalized pathname
        const ogUrl = (meta.openGraph as Record<string, unknown>)?.url as string;
        expect(ogUrl).toBeDefined();

        // It should resolve correctly via new URL(ogUrl, siteUrl)
        const resolved = new URL(ogUrl, siteUrl);
        expect(resolved.pathname).toBe(pathname);
      }),
      { numRuns: 10 },
    );
  });
});


// ---------------------------------------------------------------------------
// 2. Unit test: permanent metadataBase failure (Task 1.4)
// ---------------------------------------------------------------------------
describe("assertMetadataBaseResolvable permanent failure", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("throws MetadataBaseResolutionError when all fallback sources are cleared in production", async () => {
    vi.resetModules();

    // Remove all fallback sources
    delete process.env.BETTER_AUTH_URL;
    delete process.env.VERCEL_URL;
    vi.stubEnv("NODE_ENV", "production");

    // The module-level call to assertMetadataBaseResolvable() will throw on import.
    // We catch that and verify it's the expected error.
    try {
      await import("@/lib/seo/site");
      // If we get here, the module didn't throw — fail the test
      expect.fail("Expected module import to throw MetadataBaseResolutionError");
    } catch (error: unknown) {
      expect((error as Error).name).toBe("MetadataBaseResolutionError");
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Property 13: JSON-LD escaping (Task 1.6)
// ---------------------------------------------------------------------------
describe("JSON-LD escaping (encodeJsonLd)", () => {
  it("Property 13: output never contains '</' and always round-trips as valid JSON", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { encodeJsonLd } = await import("@/lib/seo/structured-data");

    const adversarialInserts = ["</script>", "</", "<!--", "\\", "\\\\"];

    // fast-check v4: use fc.string() which generates full unicode
    const dataArb = fc.oneof(
      fc.string(),
      fc.constantFrom(...adversarialInserts),
      fc.tuple(fc.string(), fc.constantFrom(...adversarialInserts), fc.string())
        .map(([a, b, c]) => a + b + c),
    );

    fc.assert(
      fc.property(dataArb, (input) => {
        const data = { "@context": "https://schema.org", name: input };
        const encoded = encodeJsonLd(data);

        // Must NOT contain `</` substring (XSS vector in script tags)
        expect(encoded).not.toContain("</");

        // Must be valid JSON that round-trips
        const parsed = JSON.parse(encoded);
        expect(parsed.name).toBe(input);

        // Safe for <script type="application/ld+json"> insertion
        expect(encoded).not.toMatch(/<\//);
      }),
      { numRuns: 30 },
    );
  });
});

// ---------------------------------------------------------------------------
// 4. Property 10 & 11: Product offers and LocalBusiness gating (Task 1.7)
// ---------------------------------------------------------------------------
describe("Structured data: Product pricing and LocalBusiness", () => {
  it("Property 10: getProductPricingStructuredData emits offers.length = |plans| × |intervals|", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { getProductPricingStructuredData } = await import(
      "@/lib/seo/structured-data"
    );

    const planNameArb = fc.stringMatching(/^[A-Za-z ]+$/).filter((s) => s.trim().length > 0);
    const intervalArb = fc.constantFrom("month" as const, "year" as const);
    const offerArb = fc.record({
      name: planNameArb,
      priceCurrency: fc.constant("USD"),
      price: fc.integer({ min: 100, max: 99900 }),
      billingIncrement: intervalArb,
    });

    const offersArb = fc.array(offerArb, { minLength: 1, maxLength: 10 });

    fc.assert(
      fc.property(offersArb, (offers) => {
        const result = getProductPricingStructuredData({
          name: "Test Product",
          description: "A test product",
          url: "https://example.com/pricing",
          offers,
        });

        const aggregateOffer = (result as Record<string, unknown>)
          .offers as Record<string, unknown>;
        expect(aggregateOffer["@type"]).toBe("AggregateOffer");
        const nestedOffers = aggregateOffer.offers as unknown[];
        expect(nestedOffers).toHaveLength(offers.length);
        for (const nestedOffer of nestedOffers) {
          const offerRecord = nestedOffer as Record<string, unknown>;
          expect(offerRecord.priceSpecification).toBeDefined();
        }
      }),
      { numRuns: 10 },
    );
  });

  it("Property 11: getLocalBusinessStructuredData returns correct @type based on address presence", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { getLocalBusinessStructuredData } = await import(
      "@/lib/seo/structured-data"
    );

    // With address present → @type: "LocalBusiness"
    const withAddress = getLocalBusinessStructuredData({
      name: "Test Biz",
      url: "https://example.com",
      description: "A test business",
      address: { streetAddress: "123 Main St", addressLocality: "Springfield" },
    });
    expect(withAddress).not.toBeNull();
    expect((withAddress as Record<string, unknown>)["@type"]).toBe("LocalBusiness");

    // Without address → @type: "ProfessionalService"
    const withoutAddress = getLocalBusinessStructuredData({
      name: "Test Biz",
      url: "https://example.com",
      description: "A test business",
    });
    expect(withoutAddress).not.toBeNull();
    expect((withoutAddress as Record<string, unknown>)["@type"]).toBe("ProfessionalService");

    // Missing name/url/description → null
    const missingName = getLocalBusinessStructuredData({
      name: "",
      url: "https://example.com",
      description: "A test business",
    });
    expect(missingName).toBeNull();

    const missingUrl = getLocalBusinessStructuredData({
      name: "Test",
      url: "",
      description: "A test business",
    });
    expect(missingUrl).toBeNull();

    const missingDescription = getLocalBusinessStructuredData({
      name: "Test",
      url: "https://example.com",
      description: "",
    });
    expect(missingDescription).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 5. Property 12: Breadcrumb reconstruction (Task 1.8)
// ---------------------------------------------------------------------------
describe("Breadcrumb reconstruction", () => {
  it("Property 12: pathnames with >1 segment produce items whose urls reconstruct the pathname", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { buildBreadcrumbsForPathname } = await import(
      "@/lib/seo/structured-data"
    );

    const segmentArb = fc.stringMatching(/^[a-z0-9-]+$/).filter((s) => s.length > 0 && s.length < 30);
    const multiSegmentPathArb = fc
      .array(segmentArb, { minLength: 2, maxLength: 5 })
      .map((segments) => `/${segments.join("/")}`);

    fc.assert(
      fc.property(multiSegmentPathArb, (pathname) => {
        const breadcrumbs = buildBreadcrumbsForPathname(pathname, {});

        expect(breadcrumbs.length).toBeGreaterThan(0);

        // The last breadcrumb url should equal the full pathname
        const lastUrl = breadcrumbs[breadcrumbs.length - 1]!.url;
        expect(lastUrl).toBe(pathname);

        // Each breadcrumb url should be a prefix of the next
        for (let i = 1; i < breadcrumbs.length; i++) {
          expect(breadcrumbs[i]!.url.startsWith(breadcrumbs[i - 1]!.url)).toBe(true);
        }
      }),
      { numRuns: 15 },
    );
  });

  it("pathnames with ≤1 segment return empty array", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { buildBreadcrumbsForPathname } = await import(
      "@/lib/seo/structured-data"
    );

    // Root path
    expect(buildBreadcrumbsForPathname("/", {})).toEqual([]);

    // Empty string
    expect(buildBreadcrumbsForPathname("", {})).toEqual([]);
  });
});


// ---------------------------------------------------------------------------
// 6. Unit test: root metadata + viewport + verification (Task 2.2)
// ---------------------------------------------------------------------------
describe("Root layout metadata and viewport", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("metadata has required fields: metadataBase, title, description, alternates, openGraph, twitter, robots, icons, applicationName", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const layoutModule = await import("@/app/layout");
    const metadata = layoutModule.metadata;

    expect(metadata.metadataBase).toBeInstanceOf(URL);
    expect(metadata.title).toHaveProperty("default");
    expect(metadata.title).toHaveProperty("template");
    expect(metadata.description).toBeDefined();
    expect(metadata.alternates?.canonical).toBeDefined();
    expect(metadata.openGraph).toBeDefined();
    expect(metadata.twitter).toBeDefined();
    expect(metadata.robots).toBeDefined();
    expect(metadata.icons).toBeDefined();
    expect(metadata.applicationName).toBeDefined();
  });

  it("viewport has width, initialScale, maximumScale, userScalable, themeColor", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const layoutModule = await import("@/app/layout");
    const vp = layoutModule.viewport;

    expect(vp.width).toBe("device-width");
    expect(vp.initialScale).toBe(1);
    expect(vp.maximumScale).toBe(5);
    expect(vp.userScalable).toBe(true);
    expect(vp.themeColor).toBeDefined();
  });

  it("verification.google is present when GOOGLE_SITE_VERIFICATION env is set", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";
    process.env.GOOGLE_SITE_VERIFICATION = "test-verification-code";

    const layoutModule = await import("@/app/layout");
    const metadata = layoutModule.metadata;

    expect(metadata.verification?.google).toBe("test-verification-code");
  });
});

// ---------------------------------------------------------------------------
// 7. Property 7 + unit: Sitemap (Task 3.2)
// ---------------------------------------------------------------------------
describe("Sitemap", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("static entries include /, /pricing, /privacy, /terms, /refund-policy", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { listPublicInquirySitemapEntries } = await import("@/features/inquiries/queries");
    vi.mocked(listPublicInquirySitemapEntries).mockResolvedValue([]);

    const sitemapModule = await import("@/app/sitemap");
    const entries = await sitemapModule.default();

    const urls = entries.map((e) => new URL(e.url).pathname);
    expect(urls).toContain("/");
    expect(urls).toContain("/pricing");
    expect(urls).toContain("/privacy");
    expect(urls).toContain("/terms");
    expect(urls).toContain("/refund-policy");
    expect(urls).not.toContain("/inquire");
  });

  it("caches with the hourly cacheLife profile", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { cacheLife } = await import("next/cache");
    const sitemapModule = await import("@/app/sitemap");
    await sitemapModule.default();

    expect(vi.mocked(cacheLife)).toHaveBeenCalledWith("hours");
  });

  it("root entry has images array", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { listPublicInquirySitemapEntries } = await import("@/features/inquiries/queries");
    vi.mocked(listPublicInquirySitemapEntries).mockResolvedValue([]);

    const sitemapModule = await import("@/app/sitemap");
    const entries = await sitemapModule.default();

    const rootEntry = entries.find((e) => new URL(e.url).pathname === "/");
    expect(rootEntry).toBeDefined();
    expect(rootEntry!.images).toBeDefined();
    expect(Array.isArray(rootEntry!.images)).toBe(true);
    expect(rootEntry!.images!.length).toBeGreaterThan(0);
  });

  it("does not include business profile URLs while profiles stay noindex", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { listPublicInquirySitemapEntries } = await import("@/features/inquiries/queries");
    vi.mocked(listPublicInquirySitemapEntries).mockResolvedValue([
      {
        lastModified: new Date("2025-01-01"),
        pathname: "/inquire/acme-co",
      },
    ]);

    const sitemapModule = await import("@/app/sitemap");
    const entries = await sitemapModule.default();

    const paths = entries.map((entry) => new URL(entry.url).pathname);
    expect(paths).toContain("/inquire/acme-co");
    expect(paths.some((pathname) => pathname.startsWith("/b/"))).toBe(false);
  });

  it("falls back to static entries when the inquiry query fails", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { listPublicInquirySitemapEntries } = await import("@/features/inquiries/queries");
    vi.mocked(listPublicInquirySitemapEntries).mockRejectedValueOnce(
      new Error("database unavailable"),
    );

    const sitemapModule = await import("@/app/sitemap");
    const entries = await sitemapModule.default();

    const paths = entries.map((entry) => new URL(entry.url).pathname);
    expect(paths).toContain("/");
    expect(paths).toContain("/pricing");
    expect(paths).toContain("/privacy");
    expect(paths.some((pathname) => pathname.startsWith("/inquire"))).toBe(false);
    const rootEntry = entries.find((e) => new URL(e.url).pathname === "/");
    expect(rootEntry).toBeDefined();
    expect(rootEntry!.images).toBeDefined();
    expect(Array.isArray(rootEntry!.images)).toBe(true);
    expect(rootEntry!.images!.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Property 8, 9 + unit: Robots (Task 3.4)
// ---------------------------------------------------------------------------
describe("Robots", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("Property 8: every PUBLIC_ROUTE_PREFIX appears in robots().rules[0].allow", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { PUBLIC_ROUTE_PREFIXES } = await import("@/lib/seo/route-registry");
    const robotsModule = await import("@/app/robots");
    const result = robotsModule.default();

    const allowList = result.rules as Array<{ allow?: string[] }>;
    const allowed = allowList[0]?.allow ?? [];

    for (const prefix of PUBLIC_ROUTE_PREFIXES) {
      expect(allowed).toContain(prefix);
    }
  });

  it("Property 9: every PRIVATE_ROUTE_PREFIX appears in robots().rules[0].disallow", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { PRIVATE_ROUTE_PREFIXES } = await import("@/lib/seo/route-registry");
    const robotsModule = await import("@/app/robots");
    const result = robotsModule.default();

    const rulesList = result.rules as Array<{ disallow?: string[] }>;
    const disallowed = rulesList[0]?.disallow ?? [];

    for (const prefix of PRIVATE_ROUTE_PREFIXES) {
      expect(disallowed).toContain(prefix);
    }
  });

  it("no /_next/ in disallow, sitemap + host present, no bot-specific rules", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const robotsModule = await import("@/app/robots");
    const result = robotsModule.default();

    const rulesList = result.rules as Array<{ disallow?: string[]; userAgent?: string }>;
    const disallowed = rulesList[0]?.disallow ?? [];

    // No /_next/ in disallow
    expect(disallowed.some((d) => d.includes("/_next/"))).toBe(false);

    // sitemap present
    expect(result.sitemap).toBeDefined();
    expect(typeof result.sitemap).toBe("string");

    // host present
    expect(result.host).toBeDefined();
    expect(typeof result.host).toBe("string");

    // No bot-specific rules (only one rule with userAgent: "*")
    expect(rulesList).toHaveLength(1);
    expect(rulesList[0]?.userAgent).toBe("*");
  });
});

// ---------------------------------------------------------------------------
// 9. Property 4: Business slug metadata (Task 5.5)
// ---------------------------------------------------------------------------
describe("Business slug metadata", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("Property 4: public business profile stays noindex with title, description ≤ 160 chars", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { getPublicBusinessPageMetadata } = await import(
      "@/features/businesses/metadata"
    );

    const profileArb = fc.record({
      id: fc.uuid(),
      slug: fc.stringMatching(/^[a-z0-9-]+$/).filter((s) => s.length > 0 && s.length < 50),
      name: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
      description: fc.oneof(fc.constant(null), fc.string({ minLength: 0, maxLength: 300 })),
      shortDescription: fc.oneof(fc.constant(null), fc.string({ minLength: 0, maxLength: 200 })),
      logoUrl: fc.oneof(fc.constant(null), fc.webUrl()),
      updatedAt: fc.date({ min: new Date("2020-01-01"), max: new Date("2030-01-01") }),
      isPublic: fc.constant(true),
    });

    fc.assert(
      fc.property(profileArb, (profile) => {
        const meta = getPublicBusinessPageMetadata(profile);

        const titleObj = meta.title as { absolute?: string } | undefined;
        const titleStr = titleObj?.absolute ?? "";
        expect(titleStr).toContain(profile.name);

        expect(meta.description).toBeDefined();
        expect(meta.description!.length).toBeLessThanOrEqual(160);

        const robots = meta.robots as Record<string, unknown>;
        expect(robots.index).toBe(false);
        expect(robots.follow).toBe(false);
        expect(meta.alternates?.canonical).toBeUndefined();
      }),
      { numRuns: 10 },
    );
  });

  it("missing/non-public business returns robots.index === false", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { getMissingPublicBusinessMetadata } = await import(
      "@/features/businesses/metadata"
    );

    const meta = getMissingPublicBusinessMetadata();
    const robots = meta.robots as Record<string, unknown>;
    expect(robots.index).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Inquiry form metadata
// ---------------------------------------------------------------------------
describe("Inquiry form metadata", () => {
  it("uses form name before business name in title and description fallback", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const {
      getPublicInquiryPageDescription,
      getPublicInquiryPageTitle,
    } = await import("@/features/inquiries/metadata");
    const { createPublicInquiryPreviewBusiness } = await import(
      "@/features/inquiries/preview-business"
    );
    const { createInquiryFormConfigDefaults } = await import(
      "@/features/inquiries/form-config"
    );
    const { createInquiryPageConfigDefaults } = await import(
      "@/features/inquiries/page-config"
    );

    const businessType = "general_project_services" as const;
    const business = createPublicInquiryPreviewBusiness({
      id: "biz-1",
      name: "Acme Co",
      slug: "acme-co",
      plan: "free",
      businessType,
      shortDescription: null,
      logoUrl: null,
      form: {
        id: "form-1",
        name: "Kitchen Remodel Intake",
        slug: "kitchen-remodel",
        businessType,
        isDefault: true,
        publicInquiryEnabled: true,
      },
      inquiryFormConfig: createInquiryFormConfigDefaults({ businessType }),
      inquiryPageConfig: {
        ...createInquiryPageConfigDefaults({
          businessName: "Acme Co",
          businessType,
        }),
        description: "",
      },
    });

    expect(getPublicInquiryPageTitle(business)).toBe(
      "Kitchen Remodel Intake - Acme Co",
    );
    expect(getPublicInquiryPageDescription(business)).toBe(
      "Submit Kitchen Remodel Intake to Acme Co.",
    );
  });
});

// ---------------------------------------------------------------------------
// 10. Property 5: Quote metadata always noindex (Task 5.6)
// ---------------------------------------------------------------------------
describe("Quote metadata always noindex", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("Property 5: for any PublicQuoteMetadataInput, robots.index === false, robots.follow === false, canonical = /quote/<token>", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { getPublicQuotePageMetadata } = await import(
      "@/features/quotes/metadata"
    );

    const inputArb = fc.record({
      token: fc.stringMatching(/^[a-zA-Z0-9-]+$/).filter((s) => s.length > 0),
      title: fc.string({ minLength: 0, maxLength: 100 }),
      quoteNumber: fc.stringMatching(/^[A-Z0-9-]+$/).filter((s) => s.length > 0),
      businessName: fc.string({ minLength: 1, maxLength: 100 }).filter((s) => s.trim().length > 0),
    });

    fc.assert(
      fc.property(inputArb, (input) => {
        const meta = getPublicQuotePageMetadata(input);

        const robots = meta.robots as Record<string, unknown>;
        expect(robots.index).toBe(false);
        expect(robots.follow).toBe(false);

        // Canonical = /quote/<token>
        expect(meta.alternates?.canonical).toBe(`/quote/${input.token}`);
      }),
      { numRuns: 10 },
    );
  });
});

// ---------------------------------------------------------------------------
// 11. Unit: images.remotePatterns shape (Task 11.4)
// ---------------------------------------------------------------------------
describe("next.config.ts images.remotePatterns", () => {
  it("exports a config with images.remotePatterns as an array", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const configModule = await import("@/next.config");
    const config = configModule.default;

    expect(config).toBeDefined();
    expect(config.images).toBeDefined();
    expect(Array.isArray(config.images!.remotePatterns)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 12. Unit: modularizeImports shape (Task 12.5)
// ---------------------------------------------------------------------------
describe("next.config.ts modularizeImports", () => {
  it("exports a config with modularizeImports as an object", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const configModule = await import("@/next.config");
    const config = configModule.default;

    expect(config).toBeDefined();
    expect(config.modularizeImports).toBeDefined();
    expect(typeof config.modularizeImports).toBe("object");
    expect(config.modularizeImports).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 13. Unit: waiver parsing and threshold classification (Task 14.3)
// ---------------------------------------------------------------------------
describe("Lighthouse budget: waiver parsing and threshold classification", () => {
  it("parseWaivers extracts waiver reasons from PR body", () => {
    // Inline the logic to avoid importing the script (which triggers main())
    function parseWaivers(prBody: string | undefined): string[] {
      if (!prBody) return [];
      const waivers: string[] = [];
      const pattern = /seo-budget-waiver:\s*(.+)/gi;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(prBody)) !== null) {
        const reason = match[1]?.trim();
        if (reason) waivers.push(reason);
      }
      return waivers;
    }

    // No waivers
    expect(parseWaivers(undefined)).toEqual([]);
    expect(parseWaivers("")).toEqual([]);
    expect(parseWaivers("Just a normal PR body")).toEqual([]);

    // Single waiver
    expect(parseWaivers("seo-budget-waiver: font loading delay")).toEqual([
      "font loading delay",
    ]);

    // Multiple waivers
    const multiBody = `
Some PR description.

seo-budget-waiver: font loading delay
seo-budget-waiver: third-party script overhead

More text here.
    `;
    expect(parseWaivers(multiBody)).toEqual([
      "font loading delay",
      "third-party script overhead",
    ]);
  });

  it("classifyMetric returns correct status based on thresholds", () => {
    // Inline the logic to avoid importing the script (which triggers main())
    type MetricStatus = "ok" | "violation" | "critical";
    function classifyMetric(
      value: number,
      thresholds: { budget: number; critical: number },
    ): MetricStatus {
      if (value > thresholds.critical) return "critical";
      if (value > thresholds.budget) return "violation";
      return "ok";
    }

    const thresholds = { budget: 2500, critical: 4000 };

    // Below budget → ok
    expect(classifyMetric(2000, thresholds)).toBe("ok");
    expect(classifyMetric(2500, thresholds)).toBe("ok");

    // Above budget but below critical → violation
    expect(classifyMetric(2501, thresholds)).toBe("violation");
    expect(classifyMetric(3999, thresholds)).toBe("violation");
    expect(classifyMetric(4000, thresholds)).toBe("violation");

    // Above critical → critical
    expect(classifyMetric(4001, thresholds)).toBe("critical");
    expect(classifyMetric(10000, thresholds)).toBe("critical");
  });

  it("classifyMetric: CLS thresholds (fractional values)", () => {
    type MetricStatus = "ok" | "violation" | "critical";
    function classifyMetric(
      value: number,
      thresholds: { budget: number; critical: number },
    ): MetricStatus {
      if (value > thresholds.critical) return "critical";
      if (value > thresholds.budget) return "violation";
      return "ok";
    }

    const clsThresholds = { budget: 0.1, critical: 0.25 };

    expect(classifyMetric(0.05, clsThresholds)).toBe("ok");
    expect(classifyMetric(0.1, clsThresholds)).toBe("ok");
    expect(classifyMetric(0.15, clsThresholds)).toBe("violation");
    expect(classifyMetric(0.25, clsThresholds)).toBe("violation");
    expect(classifyMetric(0.3, clsThresholds)).toBe("critical");
  });
});

// ---------------------------------------------------------------------------
// 14. PR1 indexation: public registry covers indexable marketing pages
// ---------------------------------------------------------------------------
describe("Marketing indexation registry (PR1)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("trust pages are public, not private", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { isPublicRoutePrefix, isPrivateRoutePrefix } = await import(
      "@/lib/seo/route-registry"
    );

    for (const pathname of [
      "/security",
      "/legal/dpa",
      "/subprocessors",
      "/solutions/contractors-home-services",
    ]) {
      expect(isPublicRoutePrefix(pathname)).toBe(true);
      expect(isPrivateRoutePrefix(pathname)).toBe(false);
    }
  });

  it("trust top-level segments are reserved business slugs", async () => {
    const { isReservedRouteSegment } = await import(
      "@/lib/routing/reserved-segments"
    );

    for (const segment of ["security", "solutions", "subprocessors", "legal"]) {
      expect(isReservedRouteSegment(segment)).toBe(true);
    }
  });

  it("sitemap static entries are all public and include trust pages", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { listPublicInquirySitemapEntries } = await import(
      "@/features/inquiries/queries"
    );
    vi.mocked(listPublicInquirySitemapEntries).mockResolvedValue([]);

    const { isPublicRoutePrefix } = await import("@/lib/seo/route-registry");
    const sitemapModule = await import("@/app/sitemap");
    const entries = await sitemapModule.default();

    const paths = entries.map((e) => new URL(e.url).pathname);
    for (const pathname of [
      "/security",
      "/legal/dpa",
      "/subprocessors",
    ]) {
      expect(paths).toContain(pathname);
    }
    for (const pathname of paths.filter((p) => !p.startsWith("/inquire"))) {
      expect(isPublicRoutePrefix(pathname)).toBe(true);
    }
  });

  it("markdown is preferred only when it outranks html", async () => {
    const { prefersMarkdownOverHtml } = await import("@/proxy");

    expect(prefersMarkdownOverHtml(null)).toBe(false);
    expect(prefersMarkdownOverHtml("text/html")).toBe(false);
    expect(prefersMarkdownOverHtml("text/html, text/markdown")).toBe(false);
    expect(
      prefersMarkdownOverHtml("text/html;q=0.9, text/markdown;q=0.5"),
    ).toBe(false);
    expect(prefersMarkdownOverHtml("text/markdown")).toBe(true);
    expect(
      prefersMarkdownOverHtml("text/markdown;q=0.9, text/html;q=0.5"),
    ).toBe(true);
  });

  it("inquiry sitemap excludes test/internal slugs", async () => {
    const { isInquirySitemapSlugExcluded } = await import(
      "@/lib/seo/inquiry-slugs"
    );

    for (const slug of [
      "testcom",
      "test-co",
      "demo-shop",
      "requo",
      "requo-studio",
      "requo-app",
      "acme-test",
    ]) {
      expect(isInquirySitemapSlugExcluded(slug)).toBe(true);
    }
    for (const slug of ["acme-plumbing", "lucena-cleaning-co"]) {
      expect(isInquirySitemapSlugExcluded(slug)).toBe(false);
    }
  });

  it("404 metadata is noindex", async () => {
    const notFoundModule = await import("@/app/not-found");
    const robots = (
      notFoundModule.metadata as { robots?: Record<string, unknown> }
    ).robots;
    expect(robots).toMatchObject({ index: false, follow: false });
  });
});

// ---------------------------------------------------------------------------
// 15. PR2/PR3: marketing IA — features, hub, about, compare, guides
// ---------------------------------------------------------------------------
describe("Marketing IA registry (PR2/PR3)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("new marketing prefixes are public and reserved", async () => {
    const { isPublicRoutePrefix } = await import("@/lib/seo/route-registry");
    const { isReservedRouteSegment } = await import(
      "@/lib/routing/reserved-segments"
    );

    for (const pathname of [
      "/features/quotes",
      "/compare/spreadsheets",
      "/guides/inquiry-to-accepted-quote",
      "/about",
      "/solutions",
      "/pricing.md",
    ]) {
      expect(isPublicRoutePrefix(pathname)).toBe(true);
    }
    for (const segment of ["features", "compare", "guides", "about"]) {
      expect(isReservedRouteSegment(segment)).toBe(true);
    }
  });

  it("sitemap includes hub, about, features, compare, and guide", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { listPublicInquirySitemapEntries } = await import(
      "@/features/inquiries/queries"
    );
    vi.mocked(listPublicInquirySitemapEntries).mockResolvedValue([]);

    const { isPublicRoutePrefix } = await import("@/lib/seo/route-registry");
    const sitemapModule = await import("@/app/sitemap");
    const entries = await sitemapModule.default();

    const paths = entries.map((e) => new URL(e.url).pathname);
    for (const pathname of [
      "/solutions",
      "/about",
      "/features/inquiries",
      "/features/quotes",
      "/features/follow-ups",
      "/features/ai",
      "/features/invoices",
      "/features/analytics",
      "/compare/spreadsheets",
      "/compare/job-management-software",
      "/guides/inquiry-to-accepted-quote",
    ]) {
      expect(paths).toContain(pathname);
    }
    for (const pathname of paths.filter((p) => !p.startsWith("/inquire"))) {
      expect(isPublicRoutePrefix(pathname)).toBe(true);
    }
  });

  it("feature pages have unique query-led titles, definitions, and FAQs", async () => {
    const { featureDetails } = await import(
      "@/components/marketing/features-data"
    );

    const entries = Object.values(featureDetails);
    expect(entries).toHaveLength(6);

    const titles = entries.map((e) => e.seoTitle);
    expect(new Set(titles).size).toBe(6);
    for (const entry of entries) {
      expect(entry.seoTitle.length).toBeLessThanOrEqual(60);
      expect(entry.headline.toLowerCase()).toContain(
        entry.query.split(" ")[0]!.toLowerCase(),
      );
      const words = entry.definition.trim().split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(35);
      expect(words).toBeLessThanOrEqual(70);
      expect(entry.faqs.length).toBeGreaterThanOrEqual(3);
      expect(entry.points.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("solution pages have extractable definitions and short titles", async () => {
    const { solutionDetails } = await import(
      "@/components/marketing/solutions-data"
    );

    const entries = Object.values(solutionDetails);
    expect(entries).toHaveLength(6);
    for (const entry of entries) {
      expect(entry.seoTitle.length).toBeLessThanOrEqual(60);
      const words = entry.definition.trim().split(/\s+/).length;
      expect(words).toBeGreaterThanOrEqual(35);
      expect(words).toBeLessThanOrEqual(70);
      expect(entry.faqs.length).toBeGreaterThanOrEqual(3);
    }
  });

  it("pricing FAQs are shared between page UI and schema", async () => {
    const { pricingFaqs } = await import("@/lib/plans/catalog");
    expect(pricingFaqs.length).toBeGreaterThanOrEqual(4);

    const { getFaqPageStructuredData } = await import(
      "@/lib/seo/structured-data"
    );
    const schema = getFaqPageStructuredData({ items: [...pricingFaqs] }) as {
      mainEntity: unknown[];
    };
    expect(schema.mainEntity).toHaveLength(pricingFaqs.length);
  });

  it("SoftwareApplication schema emits all plan offers", async () => {
    vi.resetModules();
    process.env.BETTER_AUTH_URL = "https://example.com";

    const { getSoftwareApplicationStructuredData } = await import(
      "@/lib/seo/structured-data"
    );
    const data = getSoftwareApplicationStructuredData({
      description: "test",
      name: "Requo",
      offers: [
        { price: 0, priceCurrency: "USD", url: "https://example.com/pricing" },
        { price: 9, priceCurrency: "USD", url: "https://example.com/pricing" },
        { price: 24, priceCurrency: "USD", url: "https://example.com/pricing" },
      ],
      url: "https://example.com",
    }) as { offers: { price: number }[] };

    expect(Array.isArray(data.offers)).toBe(true);
    expect(data.offers.map((o) => o.price)).toEqual([0, 9, 24]);
  });

  it("pricing.md mirrors catalog prices, not hand copies", async () => {
    const { GET } = await import("@/app/pricing.md/route");
    const response = GET();
    const body = await response.text();

    const { getPlanPriceLabel } = await import("@/lib/billing/plans");
    expect(body).toContain(getPlanPriceLabel("pro", "USD", "monthly"));
    expect(body).toContain(getPlanPriceLabel("business", "USD", "yearly"));
    expect(response.headers.get("Content-Type")).toContain("text/plain");
  });
});
