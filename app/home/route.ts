import { requireSession } from "@/lib/auth/session";
import { getRecentlyOpenedBusinessesForUser } from "@/features/businesses/recently-opened";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";
import { getBusinessHomePath } from "@/features/businesses/routes";
import { onboardingPath } from "@/features/onboarding/routes";
import { redirectToPath } from "@/lib/routing/redirects";

/**
 * GET /home
 *
 * Server-side resolver that redirects the authenticated user to their
 * most-recently-opened business dashboard. Falls back to the first
 * membership (owner-first, then alphabetical) when no recent activity
 * exists, or redirects to /onboarding when the user has no businesses.
 *
 * Uses 302 (temporary) because the target changes based on user state.
 *
 * No `dynamic` segment config: with `cacheComponents` all routes are dynamic
 * by default, and `force-dynamic` is rejected (see the version-matched
 * migrating-to-cache-components guide in `node_modules/next/dist/docs/`).
 */

export async function GET() {
  const session = await requireSession();
  const userId = session.user.id;

  // Try most-recently-opened first
  const recentBusinesses = await getRecentlyOpenedBusinessesForUser(userId, 1);

  if (recentBusinesses.length > 0) {
    const slug = recentBusinesses[0].slug;
    return redirectToPath(getBusinessHomePath(slug), 302);
  }

  // Fall back to first membership (owner-first, then alphabetical)
  const memberships = await getBusinessMembershipsForUser(userId, "active");

  if (memberships.length > 0) {
    const slug = memberships[0].business.slug;
    return redirectToPath(getBusinessHomePath(slug), 302);
  }

  // No businesses — send to onboarding
  return redirectToPath(onboardingPath, 302);
}
