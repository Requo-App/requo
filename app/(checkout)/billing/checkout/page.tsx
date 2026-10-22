import "server-only";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import {
  homePath,
  getBusinessSlugFromPathname,
} from "@/features/businesses/routes";
import {
  buildCheckoutSuccessPath,
  getSafeAuthRedirectPath,
} from "@/lib/auth/redirects";
import { requireSession } from "@/lib/auth/session";
import { syncSubscriptionFromPolar } from "@/lib/billing/subscription-service";
import { getBusinessBillingCacheTags } from "@/lib/cache/shell-tags";
import { requireBusinessContextForUser } from "@/lib/db/business-access";

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
 * Polar hosted-checkout return page.
 *
 * Polar redirects the user here after completing checkout. To avoid
 * the race between the redirect and webhook delivery, we actively
 * sync the subscription from Polar before redirecting the user.
 */
export default async function BillingCheckoutPage({
  searchParams,
}: CheckoutPageProps) {
  const session = await requireSession();

  const resolvedSearchParams = await searchParams;
  const returnTo = getSafeAuthRedirectPath(
    readParam(resolvedSearchParams.returnTo),
    homePath,
  );

  // Attempt to sync the subscription from Polar eagerly so the plan
  // is already up-to-date when the user lands on the dashboard.
  const businessSlug =
    returnTo === homePath
      ? undefined
      : getBusinessSlugFromPathname(returnTo);
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
