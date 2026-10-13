import "server-only";

import { eq } from "drizzle-orm";
import { forbidden, redirect } from "next/navigation";
import { cache } from "react";

import {
  getOptionalSession,
  type AuthSession,
  type AuthUser,
} from "@/lib/auth/session";
import { isAllowlistedAdminEmail } from "@/lib/auth/admin-identity";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

/**
 * Context returned to admin pages, route handlers, and server actions
 * after the admin access gate succeeds.
 *
 * The user always has a real Better Auth session. The role is *not* always
 * re-read from the database — see `isAdminSessionUser` for the exact rule.
 */
export type AdminContext = {
  readonly session: AuthSession;
  readonly user: AuthUser;
};

type SessionAdminCandidate = Pick<AuthUser, "id" | "email"> & {
  role?: string | null;
  banned?: boolean | null;
};

/**
 * Resolve admin access for a session user.
 *
 * Fast path first (`role === "admin"` straight from the session, no extra
 * query), then a single primary-key lookup that bypasses Better Auth's
 * session `cookieCache` — the cached cookie keeps serving the pre-promotion
 * role until `updateAge` elapses, so without this a freshly promoted admin
 * is bounced until they sign in again. Banned users are always refused,
 * even when allowlisted.
 *
 * Two properties to keep in mind before describing this as authoritative:
 *
 * - A ban is refused from the session itself, before the `role === "admin"`
 *   fast path: precedence mirrors `isOptimisticAdminUser` (ban wins, then
 *   role, then the database, then the allowlist) so the two layers cannot
 *   disagree. A ban that lands after the session was cached is still not
 *   observed until the cache lapses (bounded by
 *   `session.cookieCache.maxAge`, 300s in this app) — same residual as the
 *   proxy gate, and the reason the cache policy itself is out of scope.
 * - The database read only happens on the non-`admin` branch.
 *
 * Memoized per request: the console shell streams the gate from several
 * independent Suspense slots (sidebar menu, mobile menu, theme sync) while
 * page regions and queries re-check it, so without this the DB fallback
 * would run once per slot.
 */
const isAdminSessionUser = cache(
  async (candidate: SessionAdminCandidate): Promise<boolean> => {
  if (candidate.banned === true) {
    return false;
  }

  if (candidate.role === "admin") {
    return true;
  }

  const [row] = await db
    .select({ role: user.role, banned: user.banned })
    .from(user)
    .where(eq(user.id, candidate.id))
    .limit(1);

  if (!row || row.banned) {
    return false;
  }

  if (row.role === "admin") {
    return true;
  }

  return isAllowlistedAdminEmail(candidate.email);
  },
);

/**
 * Admin access gate for page bodies, queries, mutations, and actions.
 *
 * - **No session** → `/login`. They are not forbidden, just unauthenticated.
 * - **Signed in without admin access** → `forbidden()` (403). Deliberately
 *   not a 404: the console lives at the guessable `/admin` path, so hiding
 *   its existence is already impossible — a 403 says "no" honestly.
 *
 * Defence in depth, not the first line. `proxy.ts` answers a non-admin with a
 * real `403` before the route renders anything; this function is the
 * authoritative-looking re-check for the cases the proxy's cookie-derived view
 * cannot decide, plus every server action and query that is not reached through
 * a `/admin` page request.
 */
export async function requireAdminUser(): Promise<AdminContext> {
  const session = await getOptionalSession();

  if (!session?.user) {
    redirect("/login");
  }

  if (!(await isAdminSessionUser(session.user))) {
    forbidden();
  }

  return {
    session,
    user: session.user,
  };
}

/**
 * Console-shell gate for `app/admin/layout.tsx`.
 *
 * Same check and same rejections as `requireAdminUser` — path-only serving
 * means there is no second host whose response must differ, so this just
 * delegates. This runs before the layout renders any chrome (see the layout
 * for why that ordering is load-bearing).
 */
export async function requireAdminConsoleUser(): Promise<AdminContext> {
  return requireAdminUser();
}
