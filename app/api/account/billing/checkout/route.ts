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
import { getBusinessSubscription } from "@/lib/billing/subscription-service";
import { env, isPolarConfigured } from "@/lib/env";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";

/**
 * Authed checkout route. Runs eligibility gates, resolves
 * `(plan, interval)` to a Polar product id, then creates the Polar
 * checkout session directly and returns `{ checkoutUrl }`.
 */

const checkoutBodySchema = z.object({
  businessId: z.string().trim().min(1),
  plan: z.enum(["pro", "business"]),
  interval: z.enum(["monthly", "yearly"]),
  returnTo: z.string().trim().max(512).optional(),
});

export async function POST(request: Request): Promise<Response> {
  if (!isPolarConfigured) {
    return NextResponse.json(
      { error: "Billing is not configured." },
      { status: 503 },
    );
  }

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

  const { businessId, plan, interval } = parsed.data;
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

  const existing = await getBusinessSubscription(businessId);

  if (
    existing &&
    (existing.status === "active" || existing.status === "past_due") &&
    existing.plan === plan
  ) {
    return NextResponse.json(
      { error: "You're already subscribed to this plan." },
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
      await polar.subscriptions.update({
        id: existing.providerSubscriptionId,
        subscriptionUpdate: {
          productId,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Subscription update failed.";
      console.error("[billing] Polar subscription upgrade failed:", message);
      return NextResponse.json({ error: message }, { status: 502 });
    }

    // Return a success response — the webhook will handle the plan change.
    // Redirect to the return path with upgrade flag.
    const origin = resolveAppOrigin(request.url);
    const successUrl = new URL(returnTo || "/", origin ?? request.url);
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

  const origin = resolveAppOrigin(request.url);

  if (!origin) {
    return NextResponse.json(
      { error: "Application URL is not configured." },
      { status: 503 },
    );
  }

  const baseSuccessUrl = new URL("/account/billing/checkout", origin);
  if (returnTo) baseSuccessUrl.searchParams.set("returnTo", returnTo);

  const polar = getPolarClient();
  const clientIp = resolveClientIp(request);

  try {
    const checkout = await polar.checkouts.create({
      products: [productId],
      successUrl: baseSuccessUrl.toString(),
      externalCustomerId: businessId,
      customerEmail: userEmail,
      ...(clientIp ? { customerIpAddress: clientIp } : {}),
    });
    return NextResponse.json({ checkoutUrl: checkout.url });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Checkout creation failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
