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
 * The allowlist is what the owner actually configures, so it doubles as a
 * runtime fallback: an account signed in with an allowlisted email is
 * admitted even when its `role` column has not been promoted yet (e.g. the
 * bootstrap script has not re-run).
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
 * Precedence mirrors `isAdminSessionUser` for the cases both can decide: a ban
 * wins over everything, then an explicit `admin` role, then the email
 * allowlist.
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
