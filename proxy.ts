import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  activeBusinessSlugCookieName,
  getActiveBusinessCookieAttributes,
  getBusinessSlugFromPathname,
  isValidActiveBusinessSlug,
} from "@/features/businesses/routes";
import { renderAdminForbiddenPageHtml } from "@/features/admin/forbidden-page";
import {
  isPrivateRoutePrefix,
  isPublicRoutePrefix,
} from "@/lib/seo/route-registry";

const AUTHENTICATED_APP_NOINDEX = "noindex, nofollow, noarchive";
// Mirrors `authenticatedAppShellHeaders` in `next.config.ts`: user-private
// app routes must not hit shared caches, but the Next.js router cache needs
// `private, max-age=0, must-revalidate` to honor `experimental.staleTimes`.
// Without it every sibling/back navigation re-fetches from origin and the
// destination flashes its Suspense skeleton instead of painting instantly.
// Static header rules cannot express `/:businessSlug/*`, so business-scoped
// routes are covered here (precisely: paths that are neither public nor
// private per the route registry).
const AUTHENTICATED_APP_CACHE_CONTROL = "private, max-age=0, must-revalidate";

const ADMIN_CONSOLE_PREFIX = "/admin";

/**
 * Paths under `/admin` that must stay reachable for a non-admin session.
 *
 * `/admin/stop-impersonating` is the only one: an impersonated session is
 * deliberately *not* an admin session, so gating it here would trap the admin
 * inside the impersonation with no way to end it. That route authorizes on the
 * session's `impersonatedBy` tag instead of on role.
 */
const ADMIN_GATE_EXEMPT_PATHS = new Set<string>([
  `${ADMIN_CONSOLE_PREFIX}/stop-impersonating`,
]);

function isAdminConsolePath(pathname: string): boolean {
  return (
    pathname === ADMIN_CONSOLE_PREFIX ||
    pathname.startsWith(`${ADMIN_CONSOLE_PREFIX}/`)
  );
}

/**
 * The real `403` for a signed-in non-admin.
 *
 * Returned as a hand-written document rather than a rewrite to a Next page,
 * for two reasons:
 *
 * - `NextResponse.rewrite(url, { status: 403 })` silently drops the status —
 *   Next re-parses the destination and re-renders it, never applying the
 *   middleware status — so the page would be served `200`.
 * - Nothing under `/admin` may render for this user. The admin layout streams
 *   its shell before its gate resolves (`cacheComponents`), which is the flash
 *   this gate exists to prevent.
 *
 * For a client-side `<Link>` navigation the router issues an RSC request; this
 * is not a Flight response, so Next falls back to a full document navigation to
 * the same URL, which lands here again and returns the same `403`. One extra
 * round trip, and the admin chrome is never painted.
 */
function adminForbiddenResponse(): NextResponse {
  return new NextResponse(renderAdminForbiddenPageHtml(), {
    status: 403,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "private, no-store, max-age=0",
      "x-robots-tag": "noindex, nofollow, noarchive",
      "referrer-policy": "no-referrer",
    },
  });
}

/**
 * Optimistic `/admin` gate.
 *
 * Runs before the route renders so the response can carry a real status. The
 * check is deliberately cookie-derived (Better Auth's session cookie cache) and
 * is **not** the only boundary: `requireAdminUser()` re-checks against the
 * database, and every admin query/mutation goes through it.
 *
 * The auth stack is imported lazily. `@/lib/auth/config` pulls the Drizzle
 * adapter and `postgres`, and Next compiles the proxy into its own webpack
 * layer, so a static import would construct a second connection pool in
 * production (`lib/db/client.ts` only caches its pool on `globalThis` outside
 * production) for every request the app serves. Deferring it means the graph is
 * evaluated only when a `/admin` request actually needs it — and a warm cookie
 * cache resolves without a database query at all.
 *
 * @returns a response to send, or `null` to let the request continue.
 */
async function guardAdminConsoleRequest(
  request: NextRequest,
): Promise<NextResponse | null> {
  const [{ getAdminGateUser }, { isOptimisticAdminUser }] = await Promise.all([
    import("@/lib/auth/proxy-session"),
    import("@/lib/auth/admin-identity"),
  ]);

  const user = await getAdminGateUser(request.headers);

  if (!user) {
    // Unauthenticated is not forbidden — send them to sign in, matching
    // `requireAdminUser()`'s behaviour for the same case.
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";

    return finalizeProxyResponse(request, NextResponse.redirect(loginUrl));
  }

  if (!isOptimisticAdminUser(user)) {
    return adminForbiddenResponse();
  }

  return null;
}

/**
 * Adds `X-Robots-Tag` (and router-cache `Cache-Control`) for authenticated
 * business-scoped app routes at `/:businessSlug/*` that are not covered by
 * static header rules in `next.config.ts`.
 */
function finalizeProxyResponse(request: NextRequest, response: NextResponse) {
  const pathname = request.nextUrl.pathname;

  if (!isPublicRoutePrefix(pathname) && !isPrivateRoutePrefix(pathname)) {
    response.headers.set("X-Robots-Tag", AUTHENTICATED_APP_NOINDEX);
    response.headers.set("Cache-Control", AUTHENTICATED_APP_CACHE_CONTROL);
  }

  return response;
}

/**
 * True only when `text/markdown` outranks `text/html` in the Accept header.
 * A bare `includes("text/markdown")` check misfires on generic fetchers that
 * list markdown alongside html — HTML stays the default for `/`, agents use
 * `/llms.txt` and `/api/public/markdown` explicitly.
 */
export function prefersMarkdownOverHtml(acceptHeader: string | null): boolean {
  if (!acceptHeader || !acceptHeader.includes("text/markdown")) {
    return false;
  }

  return (
    parseAcceptQuality(acceptHeader, "text/markdown") >
    parseAcceptQuality(acceptHeader, "text/html")
  );
}

function parseAcceptQuality(acceptHeader: string, mediaType: string): number {
  for (const part of acceptHeader.split(",")) {
    const [range, ...params] = part.trim().split(";");
    const type = range?.trim().toLowerCase();

    if (type === mediaType || type === "text/*" || type === "*/*") {
      for (const param of params) {
        const [key, value] = param.trim().split("=");
        if (key?.trim().toLowerCase() === "q" && value) {
          const q = Number.parseFloat(value.trim());
          return Number.isNaN(q) ? 1 : q;
        }
      }
      return 1;
    }
  }

  return 0;
}

export async function proxy(request: NextRequest) {
  // Markdown agent discovery
  if (
    request.nextUrl.pathname === "/" &&
    prefersMarkdownOverHtml(request.headers.get("accept"))
  ) {
    return NextResponse.rewrite(new URL("/api/public/markdown", request.url));
  }

  // Legacy account URLs redirect into the unified business settings
  // profile page (profile, password, devices, and deletion live there).
  if (
    request.nextUrl.pathname === "/account/profile" ||
    request.nextUrl.pathname === "/account/security"
  ) {
    const activeSlug = request.cookies.get(
      activeBusinessSlugCookieName,
    )?.value;
    const url = request.nextUrl.clone();
    url.pathname = activeSlug ? `/${activeSlug}/settings/profile` : "/home";
    return finalizeProxyResponse(request, NextResponse.redirect(url));
  }

  // Admin console gate. Runs before the route renders so a non-admin gets a
  // real `403` instead of the streamed admin shell (see
  // `guardAdminConsoleRequest` for why that ordering is the whole point).
  if (
    isAdminConsolePath(request.nextUrl.pathname) &&
    !ADMIN_GATE_EXEMPT_PATHS.has(request.nextUrl.pathname)
  ) {
    const denied = await guardAdminConsoleRequest(request);

    if (denied) {
      return denied;
    }
  }

  // Business slug cookie for dashboard routing. Only well-formed slugs are
  // persisted so a crafted path segment cannot poison the active-business
  // cookie used by cookie-dependent server actions.
  const businessSlug = getBusinessSlugFromPathname(
    request.nextUrl.pathname,
  );

  // Single-segment paths (e.g. /home, /login) are top-level routes, not business slugs.
  if (request.nextUrl.pathname.split("/").filter(Boolean).length < 2) {
    return finalizeProxyResponse(request, NextResponse.next());
  }

  if (!businessSlug || !isValidActiveBusinessSlug(businessSlug)) {
    return finalizeProxyResponse(request, NextResponse.next());
  }

  const response = NextResponse.next();

  response.cookies.set({
    name: activeBusinessSlugCookieName,
    value: businessSlug,
    ...getActiveBusinessCookieAttributes(),
  });

  return finalizeProxyResponse(request, response);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2)$).*)",
  ],
};
