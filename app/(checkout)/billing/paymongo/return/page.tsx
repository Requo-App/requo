import "server-only";

import { notFound, redirect } from "next/navigation";

import { homePath } from "@/features/businesses/routes";
import {
  buildCheckoutSuccessPath,
  getSafeAuthRedirectPath,
} from "@/lib/auth/redirects";
import { requireSession } from "@/lib/auth/session";
import { getPaymongoCheckoutIntentForUser } from "@/lib/billing/paymongo-checkout";
import { isSelfHostedDeployment } from "@/lib/deployment";

type SearchParamsRecord = Record<string, string | string[] | undefined>;

type PaymongoReturnPageProps = {
  searchParams: Promise<SearchParamsRecord>;
};

function readParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

function withCheckoutState(
  returnTo: string,
  state: "processing" | "failed",
  plan: string | null,
): string {
  const url = new URL(returnTo, "http://placeholder.local");
  url.searchParams.set("upgrade", state);
  if (plan) {
    url.searchParams.set("plan", plan);
  }

  return `${url.pathname}${url.search}`;
}

/**
 * PayMongo QR Ph return page.
 *
 * PayMongo redirects here after the hosted checkout. The webhook is the
 * authoritative activation path. A Route Handler checks the session and
 * activates a paid intent before this page redirects back to the dashboard.
 */
export default async function PaymongoReturnPage({
  searchParams,
}: PaymongoReturnPageProps) {
  if (isSelfHostedDeployment()) notFound();

  const session = await requireSession();
  const resolvedSearchParams = await searchParams;
  const returnTo = getSafeAuthRedirectPath(
    readParam(resolvedSearchParams.returnTo),
    homePath,
  );
  const intentId = readParam(resolvedSearchParams.intent);

  if (!intentId) {
    redirect(withCheckoutState(returnTo, "failed", null));
  }

  const intent = await getPaymongoCheckoutIntentForUser({
    intentId,
    userId: session.user.id,
  });

  if (!intent) {
    redirect(withCheckoutState(returnTo, "failed", null));
  }

  if (intent.status === "succeeded") {
    redirect(buildCheckoutSuccessPath(returnTo, intent.plan));
  }

  if (
    intent.status === "pending" &&
    intent.providerSessionId &&
    readParam(resolvedSearchParams.checked) !== "1"
  ) {
    const params = new URLSearchParams({ intent: intent.id, returnTo });
    redirect(`/billing/paymongo/return/sync?${params}`);
  }

  redirect(withCheckoutState(returnTo, "processing", intent.plan));
}
