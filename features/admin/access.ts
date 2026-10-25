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
 * The user always has a real Better Auth session. Admin access is always
 * re-read from the database — see `isAdminSessionUser` for the exact rule.
 */
export type AdminContext = {
  readonly session: AuthSession;
  readonly user: AuthUser;
};

type SessionAdminCandidate = Pick<AuthUser, "id" | "email" | "banned">;

/**
 * Resolve admin access for a session user.
 *
 * The single primary-key lookup bypasses Better Auth's session `cookieCache`.
 * That cache is signed but can serve a stale `admin` role or `banned = false`
 * for up to `session.cookieCache.maxAge` (300s in this app), so a cached
 * `role === "admin"` must never be enough on its own: a demoted or banned
 * admin would keep access until the cache lapsed. This function is the
 * DB-authoritative boundary for every admin page, query, action, and
 * mutation; the proxy gate stays optimistic and cookie-derived.
 *
 * A ban is also refused from the session itself before the query (fail
 * closed), and the allowlist remains a bootstrap fallback only after the
 * database row is present and unbanned. Banned users are always refused,
 * even when allowlisted.
 *
 * Memoized per request: the console shell streams the gate from several
 * independent Suspense slots (sidebar menu, mobile menu, theme sync) while
 * page regions and queries re-check it, so without this the lookup would run
 * once per slot.
 */
const isAdminSessionUser = cache(
  async (candidate: SessionAdminCandidate): Promise<boolean> => {
  if (candidate.banned === true) {
    return false;
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
 * database-authoritative re-check for every admin page, query, action, and
 * mutation, including requests the proxy's cookie-derived view admits.
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
