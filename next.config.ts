import withBundleAnalyzer from "@next/bundle-analyzer";
import type { NextConfig } from "next";

const isProduction = process.env.NODE_ENV === "production";

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

const baselineSecurityHeaders = [
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
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
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
] satisfies Array<{ key: string; value: string }>;

// Authenticated app shell (dashboard, businesses hub, business-scoped pages).
// These URLs are user-private but do NOT carry tokens in the path, so we allow
// the Next.js router cache to prefetch RSC payloads. `private, max-age=0`
// keeps shared caches (CDNs, proxies) out while letting the browser / router
// cache serve instant navigations. Without this relaxation the router cannot
// honor `experimental.staleTimes` and every navigation re-fetches from origin.
const authenticatedAppShellHeaders = [
  { key: "Cache-Control", value: "private, max-age=0, must-revalidate" },
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
    //   meaningfully stale business data. 60s (validator max) keeps sibling
    //   navs and browser-back snappy — e.g. reading an inquiry then going back
    //   shows the list instantly with no skeleton. Real mutations invalidate
    //   explicitly via cache tags, so they still surface immediately regardless
    //   of this window; it only bounds un-invalidated staleness (at worst a
    //   minute), which read receipts already cover with optimistic client state.
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
    // Expose the instant-navigation testing API in production builds so
    // Playwright `instant()` assertions can run against `next start`.
    // (Dev exposes it automatically.) Must live outside
    // `devOnlyExperimental`, which is empty when NODE_ENV=production.
    exposeTestingApiInProductionBuild: true,
    ...devOnlyExperimental,
  },
  async redirects() {
    return [
      {
        source: "/b/:slug",
        destination: "/b/:slug/inquire",
        permanent: true,
      },
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
