import { NextResponse } from "next/server";

import { requireSession } from "@/lib/auth/session";
import { getRecentlyOpenedBusinessesForUser } from "@/features/businesses/recently-opened";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";
import { getBusinessHomePath } from "@/features/businesses/routes";
import { onboardingPath } from "@/features/onboarding/routes";

/**
 * GET /home
 *
 * Server-side resolver that redirects the authenticated user to their
 * most-recently-opened business dashboard. Falls back to the first
 * membership (owner-first, then alphabetical) when no recent activity
 * exists, or redirects to /onboarding when the user has no businesses.
 *
 * Uses 302 (temporary) because the target changes based on user state.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await requireSession();
  const userId = session.user.id;

  // Try most-recently-opened first
  const recentBusinesses = await getRecentlyOpenedBusinessesForUser(userId, 1);

  if (recentBusinesses.length > 0) {
    const slug = recentBusinesses[0].slug;
    const url = new URL(getBusinessHomePath(slug), request.url);
    return NextResponse.redirect(url, 302);
  }

  // Fall back to first membership (owner-first, then alphabetical)
  const memberships = await getBusinessMembershipsForUser(userId, "active");

  if (memberships.length > 0) {
    const slug = memberships[0].business.slug;
    const url = new URL(getBusinessHomePath(slug), request.url);
    return NextResponse.redirect(url, 302);
  }

  // No businesses — send to onboarding
  const url = new URL(onboardingPath, request.url);
  return NextResponse.redirect(url, 302);
}
