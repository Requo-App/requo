"use server";

import { requireUser } from "@/lib/auth/session";

export type UpgradeEligibleBusiness = {
  id: string;
  name: string;
  slug: string;
  plan: import("@/lib/plans/plans").PlanTier;
  logoUrl?: string | null;
  role: import("@/lib/business-members").BusinessMemberRole;
};

export async function getUserUpgradeEligibleBusinessesAction(): Promise<UpgradeEligibleBusiness[]> {
  try {
    const user = await requireUser();
    const { getBusinessMembershipsForUser } = await import("@/lib/db/business-access");
    const { canManageOperationalBusinessSettings } = await import("@/lib/business-members");

    const memberships = await getBusinessMembershipsForUser(user.id, "active");

    return memberships
      .filter(
        (m) =>
          m.business.recordState !== "trash" &&
          canManageOperationalBusinessSettings(m.role),
      )
      .map((m) => ({
        id: m.business.id,
        name: m.business.name,
        slug: m.business.slug,
        plan: m.business.plan,
        logoUrl: m.business.logoStoragePath
          ? `/api/business/${m.business.slug}/logo`
          : null,
        role: m.role,
      }));
  } catch {
    return [];
  }
}

