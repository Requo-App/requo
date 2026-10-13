"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath, updateTag } from "next/cache";

import { getBusinessHomePath } from "@/features/businesses/routes";
import { requireUser } from "@/lib/auth/session";
import {
  getBusinessChecklistCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import { getUserProfileCacheTags } from "@/lib/cache/shell-tags";
import { db } from "@/lib/db/client";
import { businessMembers, profiles } from "@/lib/db/schema";
import { env } from "@/lib/env";

/**
 * Tour-completion flags are read back through `"use cache"` queries
 * (`getCachedDashboardTourCompleted` on the membership,
 * `getAccountProfileForUser` for the form editor tour), so each write below has
 * to expire the tags of the query it feeds — otherwise the tour re-appears
 * until the cache life lapses.
 */
function updateCacheTags(tags: string[]) {
  for (const tag of uniqueCacheTags(tags)) {
    updateTag(tag);
  }
}

async function getMembershipForUserAndBusiness({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}) {
  const [membership] = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, userId),
      ),
    )
    .limit(1);

  if (!membership) {
    throw new Error("You do not have access to that business.");
  }

  return membership;
}

export async function completeDashboardTourAction(businessId: string) {
  const user = await requireUser();
  const membership = await getMembershipForUserAndBusiness({
    businessId,
    userId: user.id,
  });

  const now = new Date();

  await db
    .update(businessMembers)
    .set({
      dashboardTourCompletedAt: now,
      updatedAt: now,
    })
    .where(eq(businessMembers.id, membership.id));

  updateCacheTags(getBusinessChecklistCacheTags(businessId));
}

export async function resetDashboardTourForDevAction({
  businessId,
  businessSlug,
}: {
  businessId: string;
  businessSlug: string;
}) {
  if (env.NODE_ENV !== "development") {
    throw new Error("Tour reset is only available in development.");
  }

  const user = await requireUser();
  const membership = await getMembershipForUserAndBusiness({
    businessId,
    userId: user.id,
  });

  const now = new Date();

  await db
    .update(businessMembers)
    .set({
      dashboardTourCompletedAt: null,
      updatedAt: now,
    })
    .where(eq(businessMembers.id, membership.id));

  updateCacheTags(getBusinessChecklistCacheTags(businessId));
  revalidatePath(getBusinessHomePath(businessSlug));
}

export async function completeFormEditorTourAction() {
  const user = await requireUser();

  await db
    .update(profiles)
    .set({
      formEditorTourCompletedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(profiles.userId, user.id));

  updateCacheTags(getUserProfileCacheTags(user.id));
}
