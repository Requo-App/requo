import "server-only";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { homePath } from "@/features/businesses/routes";
import {
  buildCheckoutSuccessPath,
  getSafeAuthRedirectPath,
} from "@/lib/auth/redirects";
import { requireSession } from "@/lib/auth/session";
import {
  activatePaymongoCheckoutIntent,
  getPaymongoCheckoutIntentForUser,
} from "@/lib/billing/paymongo-checkout";
import {
  getPaidCheckoutPayment,
  retrievePaymongoCheckoutSession,
} from "@/lib/billing/paymongo-client";
import { getBusinessBillingCacheTags } from "@/lib/cache/shell-tags";

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
 * authoritative activation path, but this page eagerly reads the session so a
 * fast redirect does not leave the owner on Free until the webhook lands.
 * Activation is idempotent per checkout intent, so both paths can run.
 */
export default async function PaymongoReturnPage({
  searchParams,
}: PaymongoReturnPageProps) {
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

  let activePlan: string | null =
    intent.status === "succeeded" ? intent.plan : null;

  if (!activePlan && intent.status === "pending" && intent.providerSessionId) {
    try {
      const paymongoSession = await retrievePaymongoCheckoutSession(
        intent.providerSessionId,
      );
      const payment = getPaidCheckoutPayment(paymongoSession);

      if (payment) {
        const result = await activatePaymongoCheckoutIntent({
          intentId: intent.id,
          payment: {
            providerPaymentId: payment.id,
            amount: payment.amount,
            currency: payment.currency,
            paidAt: payment.paidAt,
          },
          invalidateCache: false,
        });

        if (result.status === "activated" || result.status === "already_active") {
          activePlan = result.plan;

          for (const tag of getBusinessBillingCacheTags(result.businessId)) {
            try {
              updateTag(tag);
            } catch {
              // Cache invalidation is best-effort during render; the webhook
              // and the next cache lifetime converge the view.
            }
          }
        }
      }
    } catch (error) {
      console.error("[billing] PayMongo return sync failed:", error);
    }
  }

  if (activePlan) {
    redirect(buildCheckoutSuccessPath(returnTo, activePlan));
  }

  redirect(withCheckoutState(returnTo, "processing", intent.plan));
}
