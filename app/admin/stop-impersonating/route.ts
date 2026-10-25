import { stopImpersonationAction } from "@/features/admin/mutations";
import { redirectToPath } from "@/lib/routing/redirects";

/**
 * POST /admin/stop-impersonating
 *
 * Ends the current impersonation session and restores the originating
 * admin's session cookie. Intentionally does NOT call
 * `requireAdminUser()` — during impersonation the active user IS the
 * impersonated target, which fails the admin-role check. The session
 * cookie's `impersonatedBy` tag is the authorization signal, and
 * `stopImpersonationAction` handles the no-op case when the caller
 * isn't currently impersonating (Req 8.3).
 *
 * Success → 303 See Other to `/admin` so the admin lands back on the
 * operations dashboard after the session cookie swap.
 *
 * Failure → 303 to `/` with the safe error in a query param. We can't
 * reliably redirect back to `/admin` on failure because the caller
 * may no longer be an admin if the underlying session was already
 * destroyed; `/` is the shared-safe fallback.
 */
export async function POST() {
  const result = await stopImpersonationAction();

  if (result.ok) {
    return redirectToPath("/admin", 303);
  }

  return redirectToPath(`/?error=${encodeURIComponent(result.error)}`, 303);
}
