import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

import { getContentSecurityPolicyHeader } from "./lib/security/csp";

const isProduction = process.env.NODE_ENV === "production";

function envValue(name: string) {
  return process.env[name]?.trim() || undefined;
}

// A browser upload can go directly to S3, so the CSP needs the origin of the
// presigned POST URL. Custom endpoints may use path-style or virtual-host
// addressing; allow both derived forms.
function getS3UploadUrls() {
  const endpoint = envValue("S3_ENDPOINT");
  const bucket = envValue("S3_BUCKET");
  const region = envValue("S3_REGION");
  const urls: string[] = [];

  if (endpoint) {
    urls.push(endpoint);
  }

  if (bucket) {
    if (!endpoint) {
      const regionSuffix = region && region !== "auto" ? `.${region}` : "";
      urls.push(`https://${bucket}.s3${regionSuffix}.amazonaws.com`);

      if (region && region !== "auto") {
        // S3_FORCE_PATH_STYLE puts the bucket in the path instead of the host.
        urls.push(`https://s3.${region}.amazonaws.com`);
      }
    } else {
      try {
        const url = new URL(endpoint);

        if (!url.hostname.startsWith(`${bucket}.`)) {
          urls.push(`${url.protocol}//${bucket}.${url.host}`);
        }
      } catch {
        // The adapter reports an invalid endpoint; CSP ignores malformed URLs.
      }
    }
  }

  return urls;
}

// Only advertise Supabase origins when this deployment actually uses them.
// A local/S3 install with Realtime disabled should not ship a dead origin in
// its Content Security Policy.
const storageDriver =
  envValue("REQUO_STORAGE_DRIVER") ??
  (envValue("NEXT_PUBLIC_SUPABASE_URL") ? "supabase" : "local");
const realtimeDriver =
  envValue("REQUO_REALTIME_DRIVER") ??
  (envValue("SUPABASE_JWT_SECRET") ? "supabase" : "none");
const supabaseCspUrl =
  storageDriver === "supabase" || realtimeDriver === "supabase"
    ? envValue("NEXT_PUBLIC_SUPABASE_URL")
    : undefined;
// The instant-navigation testing API is for dedicated end-to-end test builds
// only. `next dev` exposes it automatically; a production build must opt in
// explicitly. Never set this for a user-facing deployment.
const exposeTestingApi = process.env.EXPOSE_TESTING_API === "1";

// Dev-only experimental levers. Sourced from this repo's own dev trace
// (`.next/dev/trace`), where render time — not bundling — dominates request
// latency: `render-path` accounts for ~2/3 of `handle-request` time, and the
// dashboard home route stays at a ~2.7s median render long after it compiled.
//
// Deliberately NOT set here:
// - `turbopackMemoryEviction: "full"`: the default `"auto"` already evicts using
//   OS memory-pressure feedback; `"full"` re-reads every snapshot from disk.
// - `devValidationWorker: false`: that worker runs validation OFF the main
//   thread, so disabling it moves the cost back into request handling. It is
//   spawned lazily, so it costs nothing while validation is opt-in (below).
// - `cacheComponents: false`: would hide in dev exactly the errors the
//   production build enforces.
const devOnlyExperimental = isProduction
  ? {}
  : ({
      // Don't eagerly compile every route entry at boot. This repo has 83 pages,
      // and warming them competes with the first real navigation for CPU.
      preloadEntriesOnStart: false,
      // With Cache Components on, Next implicitly validates every Page and
      // Default segment on each dev render and each HMR update, re-rendering the
      // tree to do it (see `applyDefaultValidation` in
      // next/dist/server/app-render/instant-validation/instant-config.js).
      // `manual-warning` limits validation to segments that explicitly export
      // `instant`, making it opt-in per route.
      instantInsights: { validationLevel: "manual-warning" },
    } satisfies NextConfig["experimental"]);

// Enforced after the report-only pass. New directives and third-party
// integrations must be observed report-only first; see
// `docs/security/SECURITY.md` before changing the policy.
const contentSecurityPolicy = getContentSecurityPolicyHeader("enforce", {
  crispWebsiteId: process.env.CRISP_WEBSITE_ID,
  isProduction,
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  storageUploadUrls: storageDriver === "s3" ? getS3UploadUrls() : undefined,
  supabaseUrl: supabaseCspUrl,
});

const baselineSecurityHeaders = [
  contentSecurityPolicy,
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  ...(isProduction
    ? [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]
    : []),
] satisfies Array<{ key: string; value: string }>;

const sensitiveNoStoreHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
] satisfies Array<{ key: string; value: string }>;

// Authenticated app shell (dashboard, businesses hub, business-scoped pages).
// These URLs are user-private but do NOT carry tokens in the path. Keep them
// out of shared caches and out of the browser cache: the Next router cache is
// an in-memory Client Cache regulated by `experimental.staleTimes`, not by
// HTTP Cache-Control, so `no-store` costs no navigation speed. It also stops a
// shared device from serving private pages out of history after logout.
const authenticatedAppShellHeaders = [
  {
    key: "Cache-Control",
    value: "private, no-cache, no-store, max-age=0, must-revalidate",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
] satisfies Array<{ key: string; value: string }>;

const apiNoIndexHeaders = [
  { key: "Cache-Control", value: "private, no-store, max-age=0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
] satisfies Array<{ key: string; value: string }>;

const agentDiscoveryHeaders = [
  {
    key: "Link",
    value:
      '</.well-known/api-catalog>; rel="api-catalog", </.well-known/agent-skills/index.json>; rel="agent-skills", </.well-known/mcp/server-card.json>; rel="mcp-server-card"',
  },
] satisfies Array<{ key: string; value: string }>;

const nextConfig: NextConfig = {
  // Do not advertise the framework in every response.
  poweredByHeader: false,
  // Skip type-checking during `next build` — types are validated separately
  // via `npm run check`. Works around a Next.js 16 Turbopack bug where the
  // auto-generated route validator truncates paths containing parenthesized
  // route groups (e.g. `(public)/b/[slug]/page`).
  typescript: {
    ignoreBuildErrors: true,
  },
  // Ensure preview bots get full metadata in the initial HTML (see Next.js streaming metadata).
  htmlLimitedBots:
    /facebookexternalhit|Facebot|LinkedInBot|Twitterbot|Pinterest|Slackbot|Discordbot|vkShare|redditbot|Applebot|WhatsApp|TelegramBot|Googlebot|bingbot|Embedly|ChatGPT-User|GPTBot|OAI-SearchBot|anthropic-ai|ClaudeBot|Claude-Web|PerplexityBot|Bytespider|CCBot/i,
  // Allow both localhost and 127.0.0.1 in development to prevent cross-origin dev resource blocks in E2E tests
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  cacheComponents: true,
  // Partial Prefetching: each visible <Link> prefetches its destination's
  // App Shell (static + cached content) instead of a full per-link render.
  // <Link prefetch={true}> additionally resolves per-link runtime data
  // (params/searchParams). Requires cacheComponents.
  partialPrefetching: true,
  // Populate entries here only when `ANALYZE=true npm run build` shows a measurable
  // bundle-size win for a specific package. Keep the block present and documented so
  // future wins (e.g., barrel-heavy icon libraries) have a clear home.
  // NOTE: lucide-react uses dual export names (e.g. ChevronDown + ChevronDownIcon)
  // which breaks modularizeImports transforms. Tree-shaking handles it fine without.
  modularizeImports: {},
  images: {
    // Only add hosts here when a new <Image src="https://..."> is introduced.
    // All current images are local or generated via next/image routes.
    remotePatterns: [],
    // Next 16 serves only quality 75 unless a value is listed here. The
    // solution hero opts into 95 for its full-bleed industry photo.
    qualities: [75, 95],
  },
  experimental: {
    serverActions: {
      // Stay below Vercel's 4.5 MB request cap while allowing existing
      // 2 MB logo uploads plus form overhead. Inquiry attachments use
      // signed direct-storage uploads via /api/public/inquiry-upload.
      bodySizeLimit: "4mb",
    },
    // Lets `forbidden()` render `app/forbidden.tsx` instead of throwing a plain
    // error. Required by `features/admin/access.ts` — see below.
    //
    // Why it is still needed even though `proxy.ts` answers non-admins with a
    // real 403: the proxy's check reads Better Auth's session cookie cache,
    // which can lag the database by up to `session.cookieCache.maxAge` (300s).
    // A signed-in user with an allowlisted email and a stale `banned: false`
    // therefore passes the proxy and is refused later by `requireAdminUser()`'s
    // database re-check. Without this flag that refusal throws an unhandled
    // error which escapes the child-only `app/admin/error.tsx` and lands in
    // `app/global-error.tsx` — the crash this change set exists to fix.
    //
    // Caveats, deliberately recorded because this is an `experimental` flag
    // (Next does not classify it as production-stable):
    // - It is a **build-time define** (`build/define-env.js` inlines
    //   `__NEXT_EXPERIMENTAL_AUTH_INTERRUPTS`), so it is baked into both the
    //   server and client bundles. Changing it needs a rebuild/redeploy, not an
    //   env change.
    // - Blast radius is `forbidden()` alone; nothing else reads the flag.
    // - If it is ever dropped, the residual path degrades to `global-error`.
    //   `proxy.ts` is the primary control and must not be removed on the
    //   assumption that `forbidden()` covers this case.
    authInterrupts: true,
    // Router cache freshness-vs-reuse (ref: bundled staleTimes.md, prefetching.md).
    // dynamic: RSC payloads gated on per-request data (session, business context)
    //   reuse for a short window so back/forward feels instant without serving
    //   meaningfully stale business data. 60s keeps sibling navs and
    //   browser-back snappy — e.g. reading an inquiry then going back shows the
    //   list instantly with no skeleton. Real mutations invalidate explicitly
    //   via cache tags, so they still surface immediately regardless of this
    //   window; it only bounds un-invalidated staleness (at worst a minute),
    //   which read receipts already cover with optimistic client state. The
    //   config schema enforces a 30s minimum for `static` but sets no maximum
    //   on `dynamic`; 60s is a product choice, not a validator limit.
    // static: Segments with no per-request variance (prefetched static shells)
    //   tolerate a longer reuse window since their content changes infrequently
    //   and cache-tag invalidations flush them on mutation anyway. 180s balances
    //   network savings against reasonable freshness for non-mutated reads.
    staleTimes: {
      dynamic: 60,
      static: 180,
    },
    // Inlining critical CSS pays off for production first paint, but in dev it
    // re-serializes the stylesheet into the HTML on every update.
    inlineCss: isProduction,
    // Expose the instant-navigation testing API only in dedicated test builds
    // (`EXPOSE_TESTING_API=1 npm run build`), for Playwright `instant()`
    // assertions against `next start`. Dev exposes it automatically. Must live
    // outside `devOnlyExperimental`, which is empty when NODE_ENV=production.
    exposeTestingApiInProductionBuild: exposeTestingApi,
    ...devOnlyExperimental,
  },
  async redirects() {
    return [
      {
        source: "/account/billing/checkout",
        destination: "/billing/checkout",
        permanent: true,
      },
      {
        source: "/b/:slug",
        destination: "/b/:slug/inquire",
        permanent: true,
      },
      // The legacy `/products` redirect lives in the authenticated business
      // dashboard route, not here. A global `/:businessSlug/products` rule
      // also matches `/b/products` and `/inquire/products` for a business
      // whose slug is `products`, breaking its public inquiry pages.
      {
        source: "/dashboard",
        destination: "/home",
        permanent: true,
      },
      {
        source: "/:businessSlug/dashboard",
        destination: "/:businessSlug/home",
        permanent: true,
      },
      {
        source: "/:businessSlug/forms",
        destination: "/:businessSlug/services",
        permanent: true,
      },
      {
        source: "/:businessSlug/forms/:serviceSlug",
        destination: "/:businessSlug/services/:serviceSlug",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/forms",
        destination: "/:businessSlug/services",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/forms/:serviceSlug",
        destination: "/:businessSlug/services/:serviceSlug",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/inquiry-form",
        destination: "/:businessSlug/services",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/inquiry-forms",
        destination: "/:businessSlug/services",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/inquiry-forms/:serviceSlug/:path*",
        destination: "/:businessSlug/services/:serviceSlug",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/inquiry-page",
        destination: "/:businessSlug/services",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/inquiry-page/:path*",
        destination: "/:businessSlug/services",
        permanent: true,
      },
      {
        source: "/solutions/professional-services",
        destination: "/solutions/professional-it-services",
        permanent: true,
      },
      {
        source: "/solutions/events-production",
        destination: "/solutions/events-rentals",
        permanent: true,
      },
      {
        source: "/solutions/photo-video-events",
        destination: "/solutions/photo-video",
        permanent: true,
      },
      {
        source: "/solutions/print-custom-services",
        destination: "/solutions/custom-fabrication-signage",
        permanent: true,
      },
      {
        source: "/solutions/cleaning-outdoor-services",
        destination: "/solutions",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/inquiry",
        destination: "/:businessSlug/services",
        permanent: true,
      },
      {
        source: "/:businessSlug/settings/inquiry/:serviceSlug",
        destination: "/:businessSlug/services/:serviceSlug",
        permanent: true,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/account/billing/checkout",
        destination: "/api/billing/checkout",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/",
        headers: agentDiscoveryHeaders,
      },
      {
        source: "/:path*",
        headers: baselineSecurityHeaders,
      },
      {
        source: "/api/:path*",
        headers: apiNoIndexHeaders,
      },
      {
        source: "/businesses/:path*",
        headers: authenticatedAppShellHeaders,
      },
      {
        source: "/account/:path*",
        headers: authenticatedAppShellHeaders,
      },
      {
        source: "/billing/checkout",
        headers: authenticatedAppShellHeaders,
      },
      {
        source: "/admin/:path*",
        headers: authenticatedAppShellHeaders,
      },
      {
        source: "/onboarding/:path*",
        headers: authenticatedAppShellHeaders,
      },
      {
        source: "/forgot-password",
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: "/invite/:path*",
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: "/login",
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: "/inquire/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
          { key: "Vary", value: "Accept-Encoding" },
        ],
      },
      {
        source: "/quote/:path*",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=60, stale-while-revalidate=300",
          },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Vary", value: "Accept-Encoding" },
        ],
      },
      {
        source: "/b/:path*",
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: "/reset-password",
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: "/signup",
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: "/verify-email",
        headers: sensitiveNoStoreHeaders,
      },
      {
        source: "/sw.js",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
      {
        source: "/:path*.svg",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(
  nextConfig,
);
