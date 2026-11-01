import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import {
  getPolarClient,
  resolveAppOrigin,
  resolveClientIp,
  sanitizeReturnTo,
} from "@/lib/billing/polar-client";
import { getPolarProductId } from "@/lib/billing/polar-products";
import { detectVisitorCountry } from "@/lib/billing/region";
import {
  canBuyPlanWithPaymongo,
  getPaymongoIneligibilityMessage,
  isActivePrepaidSubscription,
  resolvePaymongoEligibility,
} from "@/lib/billing/paymongo-eligibility";
import {
  attachPaymongoCheckoutSession,
  createPaymongoCheckoutIntent,
  markPaymongoCheckoutIntentFailed,
} from "@/lib/billing/paymongo-checkout";
import { createPaymongoCheckoutSession } from "@/lib/billing/paymongo-client";
import { getBusinessSubscription } from "@/lib/billing/subscription-service";
import { env, getPaymongoMode, isPaymongoConfigured, isPolarConfigured } from "@/lib/env";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";
import { canManageBusinessAdministration } from "@/lib/business-members";
import { planMeta } from "@/lib/plans";

/**
 * Authed checkout route. Runs eligibility gates, resolves
 * `(plan, interval)` to a Polar product id, then creates the Polar
 * checkout session directly and returns `{ checkoutUrl }`.
 *
 * Philippine visitors may instead ask for `provider: "paymongo"`, which
 * creates a one-time QR Ph hosted checkout session. The QR Ph branch rechecks
 * country, configuration, existing Polar subscription, and prepaid plan locks
 * server-side; the client-provided provider choice is never trusted on its own.
 */

const checkoutBodySchema = z.object({
  businessId: z.string().trim().min(1),
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["monthly", "yearly"]),
  returnTo: z.string().trim().max(512).optional(),
  provider: z.enum(["polar", "paymongo"]).default("polar"),
});

export async function POST(request: Request): Promise<Response> {
  let user: Awaited<ReturnType<typeof requireUser>>;

  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let rawBody: unknown;

  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 },
    );
  }

  const parsed = checkoutBodySchema.safeParse(rawBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid plan or interval." },
      { status: 400 },
    );
  }

  const { businessId, plan, interval, provider } = parsed.data;
  const returnTo = sanitizeReturnTo(parsed.data.returnTo);

  // Ensure the actor can manage billing for this business.
  // (Owner-only today; adjust to admin roles later if needed.)
  // `businessId` is an explicit business id, so resolve it through the
  // user's memberships rather than the slug-based context helper.
  const memberships = await getBusinessMembershipsForUser(user.id, "active");
  const businessContext = memberships.find(
    (membership) => membership.business.id === businessId,
  );

  if (!businessContext) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!canManageBusinessAdministration(businessContext.role)) {
    return NextResponse.json(
      { error: "Only the business owner can manage billing." },
      { status: 403 },
    );
  }

  if (provider === "paymongo") {
    return createPaymongoCheckoutResponse({
      request,
      userId: user.id,
      userEmail: user.email,
      businessId,
      plan,
      interval,
      returnTo,
    });
  }

  if (!isPolarConfigured) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 503 },
    );
  }

  const existing = await getBusinessSubscription(businessId);
  const now = new Date();
  const canceledButActive =
    existing?.status === "canceled" &&
    existing.currentPeriodEnd !== null &&
    existing.currentPeriodEnd > now;

  // A prepaid QR Ph term has no Polar subscription to update or cancel.
  // Starting Polar checkout during that term would create a second paid
  // subscription, so plan changes wait until the prepaid term ends.
  if (isActivePrepaidSubscription(existing, now)) {
    return NextResponse.json(
      {
        error:
          "Your prepaid term is active. Renew with QR Ph, or switch plans after it ends.",
      },
      { status: 409 },
    );
  }

  // A QR Ph row keeps `active` and its paid plan until the daily expiry job
  // flips it, so gate this on Polar rows only: the owner of an ended prepaid
  // term is already on Free and must be able to start a card subscription.
  if (
    existing &&
    existing.billingProvider !== "paymongo" &&
    (existing.status === "active" || existing.status === "past_due") &&
    existing.plan === plan
  ) {
    return NextResponse.json(
      { error: "You're already subscribed to this plan." },
      { status: 409 },
    );
  }

  // Paused and canceled-but-in-period subscriptions still exist at Polar.
  // Starting a second checkout would create a duplicate subscription and
  // double-charge the business; send the owner to the portal instead.
  if (
    existing?.providerSubscriptionId &&
    (existing.status === "paused" || canceledButActive)
  ) {
    return NextResponse.json(
      {
        error:
          "You already have a subscription. Manage it from the billing portal.",
      },
      { status: 409 },
    );
  }

  const userEmail = user.email;

  if (!userEmail) {
    return NextResponse.json(
      { error: "Account email is required to start checkout." },
      { status: 400 },
    );
  }

  const productId = getPolarProductId(plan, interval);

  if (!productId) {
    return NextResponse.json(
      {
        error: `No Polar product configured for ${plan} (${interval}).`,
      },
      { status: 503 },
    );
  }

  const origin = resolveAppOrigin(request.url);

  if (!origin) {
    return NextResponse.json(
      { error: "Application URL is not configured." },
      { status: 503 },
    );
  }

  // ── Upgrade path: update the existing subscription's product ──────────
  // When the business already has an active subscription on a different plan,
  // Polar won't allow a new checkout. Instead, we update the existing
  // subscription's product via the Polar API.
  if (
    existing &&
    (existing.status === "active" || existing.status === "past_due") &&
    existing.providerSubscriptionId &&
    existing.plan !== plan
  ) {
    if (!env.POLAR_ACCESS_TOKEN) {
      return NextResponse.json(
        { error: "Billing is not configured." },
        { status: 503 },
      );
    }

    const polar = getPolarClient();

    try {
      await polar.subscriptions.update(existing.providerSubscriptionId, {
        product_id: productId,
        metadata: { plan, businessId },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Subscription update failed.";
      console.error("[billing] Polar subscription upgrade failed:", message);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // Return a success response — the webhook will handle the plan change.
    // Redirect to the return path with upgrade flag.
    const successUrl = new URL(returnTo || "/", origin);
    successUrl.searchParams.set("upgrade", "success");
    successUrl.searchParams.set("plan", plan);

    return NextResponse.json({ checkoutUrl: successUrl.toString() });
  }

  if (!env.POLAR_ACCESS_TOKEN) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 503 },
    );
  }

  const baseSuccessUrl = new URL("/billing/checkout", origin);
  if (returnTo) baseSuccessUrl.searchParams.set("returnTo", returnTo);

  const polar = getPolarClient();
  const clientIp = resolveClientIp(request);

  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      success_url: baseSuccessUrl.toString(),
      external_customer_id: businessId,
      customer_email: userEmail,
      metadata: { plan, businessId },
      ...(clientIp ? { customer_ip_address: clientIp } : {}),
    });
    return NextResponse.json({ checkoutUrl: checkout.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout creation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

async function createPaymongoCheckoutResponse({
  request,
  userId,
  userEmail,
  businessId,
  plan,
  interval,
  returnTo,
}: {
  request: Request;
  userId: string;
  userEmail: string | null | undefined;
  businessId: string;
  plan: "pro" | "business";
  interval: "monthly" | "yearly";
  returnTo: string | null;
}): Promise<Response> {
  if (!isPaymongoConfigured) {
    return NextResponse.json(
      { error: "QR Ph is not available right now." },
      { status: 503 },
    );
  }

  // Never trust the client's provider flag alone: the visitor must still be
  // in the Philippines according to the server-side geo header.
  const country = await detectVisitorCountry();
  const existing = await getBusinessSubscription(businessId);
  const eligibility = resolvePaymongoEligibility({
    countryCode: country,
    configured: true,
    subscription: existing,
  });
  const planEligibility = canBuyPlanWithPaymongo(eligibility, plan);

  if (!planEligibility.allowed) {
    return NextResponse.json(
      { error: getPaymongoIneligibilityMessage(planEligibility.reason) },
      { status: 409 },
    );
  }

  if (!userEmail) {
    return NextResponse.json(
      { error: "Account email is required to start checkout." },
      { status: 400 },
    );
  }

  const origin = resolveAppOrigin(request.url);

  if (!origin) {
    return NextResponse.json(
      { error: "Application URL is not configured." },
      { status: 503 },
    );
  }

  const intent = await createPaymongoCheckoutIntent({
    businessId,
    userId,
    plan,
    interval,
  });

  const successUrl = new URL("/billing/paymongo/return", origin);
  successUrl.searchParams.set("intent", intent.id);
  if (returnTo) {
    successUrl.searchParams.set("returnTo", returnTo);
  }

  const cancelUrl = new URL(returnTo || "/", origin);
  cancelUrl.searchParams.set("checkout", "cancelled");

  try {
    const session = await createPaymongoCheckoutSession({
      intentId: intent.id,
      description: `Requo ${planMeta[plan].label} (${interval})`,
      amount: intent.amount,
      customerEmail: userEmail,
      successUrl: successUrl.toString(),
      cancelUrl: cancelUrl.toString(),
      metadata: {
        businessId,
        userId,
        intentId: intent.id,
        plan,
        interval,
      },
    });

    const expectedLiveMode = getPaymongoMode() === "live";

    if (session.livemode !== null && session.livemode !== expectedLiveMode) {
      await markPaymongoCheckoutIntentFailed(intent.id);
      console.error(
        "[billing] PayMongo checkout mode mismatch.",
        { intentId: intent.id, livemode: session.livemode },
      );

      return NextResponse.json(
        { error: "QR Ph is not available right now." },
        { status: 503 },
      );
    }

    await attachPaymongoCheckoutSession(intent.id, session.id);

    return NextResponse.json({ checkoutUrl: session.checkoutUrl });
  } catch (error) {
    await markPaymongoCheckoutIntentFailed(intent.id).catch(() => undefined);

    const message =
      error instanceof Error ? error.message : "Checkout creation failed.";
    console.error("[billing] PayMongo checkout creation failed:", message);

    return NextResponse.json(
      { error: "We couldn't start QR Ph checkout. Please try again." },
      { status: 502 },
    );
  }
}
