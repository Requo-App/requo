import { redirect } from "next/navigation";

import { dashboardPath } from "@/features/businesses/routes";
import { requireSession } from "@/lib/auth/session";
import { buildCheckoutSuccessPath } from "@/lib/auth/redirects";
import { syncSubscriptionFromPolar } from "@/lib/billing/subscription-service";
import { requireBusinessContextForUser } from "@/lib/db/business-access";
import { getBusinessBillingCacheTags } from "@/lib/cache/shell-tags";
import { updateTag } from "next/cache";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type CheckoutPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

/**
 * Same-origin allowlist for the post-checkout return URL.
 */
function resolveReturnTo(value: string | null): string {
  if (!value) return dashboardPath;

  const trimmed = value.trim();

  if (!trimmed.startsWith("/")) return dashboardPath;
  if (trimmed.startsWith("//")) return dashboardPath;
  if (trimmed.startsWith("/api/")) return dashboardPath;

  return trimmed;
}

/**
 * Extracts the business slug from a returnTo path like `/business-slug/settings/billing`.
 */
function extractBusinessSlug(returnTo: string): string | null {
  const match = returnTo.match(/^\/([^/]+)/);
  return match?.[1] ?? null;
}

/**
 * Polar hosted-checkout return page.
 *
 * Polar redirects the user here after completing checkout. To avoid
 * the race between the redirect and webhook delivery, we actively
 * sync the subscription from Polar before redirecting the user.
 */
export default async function AccountBillingCheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const session = await requireSession();

  const resolvedSearchParams = await searchParams;
  const returnTo = resolveReturnTo(readParam(resolvedSearchParams.returnTo));

  // Attempt to sync the subscription from Polar eagerly so the plan
  // is already up-to-date when the user lands on the dashboard.
  const businessSlug = extractBusinessSlug(returnTo);
  let activePlan: string | null = null;
  try {
    const businessContext = await requireBusinessContextForUser(
      session.user.id,
      businessSlug,
    );
    const synced = await syncSubscriptionFromPolar(
      businessContext.business.id,
    );
    if (synced) {
      // synced is the plan name (e.g. "pro", "business") on success
      activePlan = synced;
      for (const tag of getBusinessBillingCacheTags(businessContext.business.id)) {
        updateTag(tag);
      }
    }
  } catch {
    // Best-effort — the webhook will handle it if this fails.
  }

  redirect(buildCheckoutSuccessPath(returnTo, activePlan));
}
