import { ErrorState } from "@/components/shared/error-state";

/**
 * Root `forbidden` boundary, rendered when `forbidden()` is thrown.
 *
 * Placement is load-bearing. `forbidden()` is thrown by `requireAdminUser()`,
 * which `app/admin/layout.tsx` calls from its Suspense-wrapped slots — and a
 * throw from a *layout* is resolved by the nearest boundary **above** that
 * layout. `app/admin/error.tsx` only wraps `children`, which is exactly why the
 * original crash skipped it and landed in `app/global-error.tsx`. The same rule
 * applies here, so this file has to sit at the root.
 *
 * This is the secondary path, not the primary one: `proxy.ts` answers a
 * non-admin with a real `403` before anything renders. Reaching this file means
 * the request got past the proxy's optimistic cookie check and was then refused
 * by the database re-check in `requireAdminUser()`. It renders with a `200`
 * status — the shell has already streamed by this point — which is the trade-off
 * Next documents for `forbidden()` under Cache Components.
 */
export default function Forbidden() {
  return <ErrorState layout="page" variant="forbidden" />;
}
