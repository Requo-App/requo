import { redirect } from "next/navigation";

import { getAccountProfileForUser } from "@/features/account/queries";
import { getBusinessMembershipsForUser } from "@/lib/db/business-access";
import { getOptionalSession } from "@/lib/auth/session";
import { onboardingPath } from "@/features/onboarding/routes";

/**
 * Server-side redirect for already-authenticated users — avoids a
 * client-side flash of the auth form.
 *
 * Onboarded users continue to `nextPath`; signed-in users who have not
 * finished onboarding always continue to onboarding. Renders nothing for
 * anonymous visitors.
 */
export async function AuthenticatedRedirectGuard({
  nextPath,
}: {
  nextPath: string;
}) {
  const session = await getOptionalSession();
  if (!session) {
    return null;
  }

  const [memberships, profile] = await Promise.all([
    getBusinessMembershipsForUser(session.user.id),
    getAccountProfileForUser(session.user.id),
  ]);
  const hasOnboarded =
    memberships.length > 0 || Boolean(profile?.onboardingCompletedAt);
  redirect(hasOnboarded ? nextPath : onboardingPath);
}
