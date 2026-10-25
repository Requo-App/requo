import { env } from "@/lib/env";

/**
 * Shared admin identity predicates.
 *
 * Extracted from `features/admin/access.ts` so a single rule is applied in the
 * two places that must agree:
 *
 * - `features/admin/access.ts` — server components, server actions, queries.
 * - `proxy.ts` — the optimistic pre-render gate that produces the real `403`.
 *
 * Deliberately dependency-light (no Drizzle, no `next/navigation`, no
 * `server-only`): the proxy imports this module, so anything added here lands
 * in the proxy bundle.
 */

/**
 * Whether the email is in the `ADMIN_EMAILS` allowlist.
 *
 * The allowlist is the owner's bootstrap input: `scripts/bootstrap-admin.ts`
 * and `scripts/seed-prod.ts` promote these accounts to `role = "admin"`. It is
 * also a hint for the proxy's optimistic gate so a freshly promoted admin is
 * not bounced while Better Auth's cookie cache catches up.
 *
 * It is never an authorization grant: `requireAdminUser()` requires the
 * database role, so an explicitly demoted allowlisted account stays demoted.
 */
export function isAllowlistedAdminEmail(
  email: string | null | undefined,
): boolean {
  if (!email) {
    return false;
  }

  const allowlist = (env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);

  return allowlist.includes(email.trim().toLowerCase());
}

/** The subset of the Better Auth user the optimistic check needs. */
export type AdminIdentityCandidate = {
  email?: string | null;
  role?: string | null;
  banned?: boolean | null;
};

/**
 * Optimistic admin predicate for the proxy gate.
 *
 * This runs before the route renders, so it can only see what Better Auth's
 * session cookie cache carries — `role` and `banned` can lag the database by up
 * to `session.cookieCache.maxAge` (300s here). It is therefore a fast rejection
 * path, never the only boundary: `requireAdminUser()` always re-reads the same
 * question from the database, so a demoted or banned admin is refused there
 * even while this predicate still sees the cached role.
 *
 * Precedence for the optimistic gate: a ban wins over everything, then an
 * explicit `admin` role, then the email allowlist. The allowlist is only a
 * hint that avoids an early `403` for a freshly promoted admin whose cookie
 * cache is stale; it does not grant access, because `requireAdminUser()`
 * re-checks the database role before anything renders.
 */
export function isOptimisticAdminUser(
  candidate: AdminIdentityCandidate,
): boolean {
  if (candidate.banned === true) {
    return false;
  }

  if (candidate.role === "admin") {
    return true;
  }

  return isAllowlistedAdminEmail(candidate.email);
}
