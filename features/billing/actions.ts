"use server";

import { revalidatePath } from "next/cache";

import { getBusinessSettingsPath, homePath } from "@/features/businesses/routes";
import { requireUser } from "@/lib/auth/session";
import { startBusinessTrial } from "@/lib/billing/subscription-service";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { PRO_TRIAL_DAYS } from "@/lib/plans/plans";

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

export type StartBusinessTrialActionState = {
  error?: string;
  success?: string;
};

/**
 * Starts the owner's one-time 14-day Pro trial for an existing Free business.
 *
 * Authorization is owner-only. `startBusinessTrial` verifies ownership again
 * and writes the trial claim plus subscription in one transaction.
 */
export async function startBusinessTrialAction(
  businessId: string,
  businessSlug: string,
  _prevState: StartBusinessTrialActionState,
  _formData: FormData,
): Promise<StartBusinessTrialActionState> {
  const access = await getBusinessActionContext({
    businessSlug,
    minimumRole: "owner",
    requireActiveBusiness: true,
    unauthorizedMessage: "Only the business owner can start the trial.",
  });

  if (!access.ok) {
    return { error: access.error };
  }

  if (access.businessContext.business.id !== businessId) {
    return { error: "That business could not be found." };
  }

  const result = await startBusinessTrial({
    businessId,
    userId: access.user.id,
    currency: access.businessContext.business.defaultCurrency,
  });

  if (!result.ok) {
    switch (result.reason) {
      case "already-claimed":
        return { error: "This Pro trial has already been used." };
      case "already-subscribed":
        return {
          error: "This business already has a plan. Manage it from billing.",
        };
      case "not-found":
        return { error: "That business could not be found." };
    }
  }

  revalidatePath(getBusinessSettingsPath(businessSlug, "billing"));
  revalidatePath(homePath);

  return { success: `Your ${PRO_TRIAL_DAYS}-day Pro trial has started.` };
}

