import { revalidateTag } from "next/cache";
import { notFound, redirect } from "next/navigation";

import { homePath } from "@/features/businesses/routes";
import { getSafeAuthRedirectPath } from "@/lib/auth/redirects";
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
import { isBillingProviderEnabled } from "@/lib/deployment";

export async function GET(request: Request) {
  if (!isBillingProviderEnabled("paymongo")) notFound();

  const session = await requireSession();
  const url = new URL(request.url);
  const intentId = url.searchParams.get("intent");
  const returnTo = getSafeAuthRedirectPath(url.searchParams.get("returnTo"), homePath);
  const params = new URLSearchParams({ returnTo, checked: "1" });
  if (intentId) params.set("intent", intentId);

  const intent = intentId
    ? await getPaymongoCheckoutIntentForUser({ intentId, userId: session.user.id })
    : null;
  let businessId: string | null = null;

  if (intent?.status === "pending" && intent.providerSessionId) {
    try {
      const checkout = await retrievePaymongoCheckoutSession(intent.providerSessionId);
      const payment = getPaidCheckoutPayment(checkout);
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
          businessId = result.businessId;
        }
      }
    } catch (error) {
      console.error("[billing] PayMongo return sync failed:", error);
    }
  }

  if (businessId) {
    for (const tag of getBusinessBillingCacheTags(businessId)) {
      revalidateTag(tag, "max");
    }
  }

  redirect(`/billing/paymongo/return?${params}`);
}
