import "server-only";

import { NextResponse } from "next/server";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { getPolarClient } from "@/lib/billing/polar-client";
import { getBusinessSubscription } from "@/lib/billing/subscription-service";
import { env, isPolarConfigured } from "@/lib/env";
import { getBusinessRequestContextForSlug } from "@/lib/db/business-access";
import { db } from "@/lib/db/client";
import { businessMembers, businesses } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

const portalQuerySchema = z.object({
  businessId: z.string().trim().min(1).max(128).optional(),
  businessSlug: z.string().trim().min(1).max(120).optional(),
});

/**
 * Polar Customer Portal route.
 *
 * Resolves the authenticated user's `providerCustomerId` from
 * `account_subscriptions`, then creates a customer-portal session via
 * the Polar SDK and redirects the browser to the portal URL.
 *
 * UI callers are gated separately on `subscription.providerCustomerId`
 * being non-null, so this route is only reachable for users with an
 * active billing relationship.
 *
 * Usage: GET /api/billing/polar/customer-portal
 */
export async function GET(request: Request): Promise<Response> {
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

  const url = new URL(request.url);
  const parsedQuery = portalQuerySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Missing businessId." }, { status: 400 });
  }
  const businessIdParam = parsedQuery.data.businessId;
  const businessSlugParam = parsedQuery.data.businessSlug;

  if (!businessIdParam && !businessSlugParam) {
    return NextResponse.json(
      { error: "Missing businessId." },
      { status: 400 },
    );
  }

  // Resolve tenant by slug when available (slug is the authorization key).
  // When only a raw ID is provided, verify membership directly instead of
  // passing the ID through the slug resolver (which would fall back to
  // memberships[0] and succeed for the wrong business).
  let businessId: string;
  let businessSlug: string;

  if (businessSlugParam) {
    const requestContext =
      await getBusinessRequestContextForSlug(businessSlugParam);

    if (!requestContext || requestContext.user.id !== user.id) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    businessId = requestContext.businessContext.business.id;
    businessSlug = requestContext.businessContext.business.slug;

    if (businessIdParam && businessIdParam !== businessId) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
  } else {
    const candidateId = businessIdParam as string;

    const [membership] = await db
      .select({ businessId: businessMembers.businessId })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, candidateId),
          eq(businessMembers.userId, user.id),
        ),
      )
      .limit(1);

    if (!membership) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }

    businessId = candidateId;
    // Slug for returnUrl is resolved from the verified membership below.
    const [slugRow] = await db
      .select({ slug: businesses.slug })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1);

    businessSlug = slugRow?.slug ?? "";
  }

  const subscription = await getBusinessSubscription(businessId);

  if (!subscription?.providerCustomerId) {
    return NextResponse.json(
      { error: "No billing account found. Subscribe to a plan first." },
      { status: 404 },
    );
  }

  const returnUrl = `${env.NEXT_PUBLIC_APP_URL ?? ""}/${encodeURIComponent(
    businessSlug,
  )}/settings/billing`;

  const polar = getPolarClient();

  try {
    const session = await polar.customerSessions.create({
      customerId: subscription.providerCustomerId,
      returnUrl,
    });

    return NextResponse.redirect(session.customerPortalUrl);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not open billing portal.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
