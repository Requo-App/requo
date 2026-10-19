import { NextResponse } from "next/server";

/**
 * Same-origin redirect for Route Handlers.
 *
 * Why not `NextResponse.redirect(new URL(path, request.url))` (the pattern
 * shown in the bundled Next docs): `request.url` is built from the server's
 * configured hostname, not from the browser's address bar (see `initURL` in
 * `next/dist/server/route-modules/route-module.js`). Under
 * `next dev --hostname 0.0.0.0` — the Docker setup in `docker-compose.yml` —
 * every such redirect sends the browser to `http://0.0.0.0:3000`, dropping
 * `localhost` along with its host-only session cookie.
 *
 * Next already normalizes middleware redirects to a relative `Location`
 * (`getRelativeURL` in `next/dist/server/lib/router-utils/resolve-routes.js`).
 * Route Handlers get the same behavior by returning a relative path, which
 * the browser resolves against whichever origin it is already on.
 *
 * `path` must be a same-origin path: protocol-relative (`//host`) and
 * absolute URLs are rejected so a caller bug cannot become an open redirect.
 */
export function redirectToPath(path: string, status: number = 307) {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error(
      `redirectToPath requires a same-origin path (received: ${JSON.stringify(path)}).`,
    );
  }

  return new NextResponse(null, {
    status,
    headers: { location: path },
  });
}
