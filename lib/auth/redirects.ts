import { sanitizeSameOriginPath } from "@/lib/routing/safe-return-path";

export function getSafeAuthRedirectPath(
  value: string | null | undefined,
  fallback = "/home",
) {
  return sanitizeSameOriginPath(value) ?? fallback;
}

/**
 * Appends checkout success parameters to an already-validated same-origin
 * return path (see `getSafeAuthRedirectPath`).
 *
 * URL-based construction (not string concatenation) so existing query
 * parameters merge correctly, fragments can never swallow the appended
 * parameters (`redirect()` receives `pathname + search` only), and an
 * absolute or protocol-relative input degrades to a same-origin path
 * instead of an external destination.
 */
export function buildCheckoutSuccessPath(
  returnTo: string,
  activePlan: string | null,
): string {
  const url = new URL(returnTo, "http://placeholder.local");
  url.searchParams.set("upgrade", "success");
  if (activePlan && activePlan !== "free") {
    url.searchParams.set("plan", activePlan);
  }

  return `${url.pathname}${url.search}`;
}

export function getAuthPathWithNext(pathname: string, nextPath?: string | null) {
  const searchParams = new URLSearchParams();
  const safeNextPath = getSafeAuthRedirectPath(nextPath, "");

  if (safeNextPath) {
    searchParams.set("next", safeNextPath);
  }

  const search = searchParams.toString();

  return search ? `${pathname}?${search}` : pathname;
}
