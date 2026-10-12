"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, eq, ne } from "drizzle-orm";

import { getValidationActionState } from "@/lib/action-state";
import { uniqueCacheTags, getBusinessMembersCacheTags } from "@/lib/cache/business-tags";
import { getUserPendingInvitesCacheTags } from "@/lib/cache/shell-tags";
import { db } from "@/lib/db/client";
import { businessMemberInvites, businessMembers } from "@/lib/db/schema";
import { getOwnerBusinessActionContext } from "@/lib/db/business-access";
import { requireSession } from "@/lib/auth/session";
import { activeBusinessSlugCookieName, getActiveBusinessCookieAttributes, getBusinessHomePath, getBusinessMemberInvitePath, getBusinessMembersPath, homePath } from "@/features/businesses/routes";
import {
  businessMemberInviteIdSchema,
  businessMemberInviteSchema,
  businessMemberRoleUpdateSchema,
  businessMembershipIdSchema,
} from "@/features/business-members/schemas";
import {
  acceptBusinessInviteLink,
  acceptBusinessMemberInvite,
  cancelBusinessMemberInvite,
  createBusinessMemberInvite,
  getOrCreateBusinessInviteLink,
  regenerateBusinessInviteLink,
  removeBusinessMember,
  updateBusinessMemberRole,
} from "@/features/business-members/mutations";
import type { BusinessMemberInviteActionState } from "@/features/business-members/action-types";
import { businessMemberInviteDurationDays } from "@/lib/business-members";
import { sendBusinessMemberInviteEmail } from "@/lib/email/transactional";
import { env, isMemberInviteEmailEnabled } from "@/lib/env";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { getBusinessMemberCount } from "@/lib/plans/usage";

const initialInviteState: BusinessMemberInviteActionState = {};

function updateCacheTags(tags: string[]) {
  for (const tag of uniqueCacheTags(tags)) {
    updateTag(tag);
  }
}

export async function createBusinessMemberInviteAction(
  prevState: BusinessMemberInviteActionState = initialInviteState,
  formData: FormData,
): Promise<BusinessMemberInviteActionState> {
  void prevState;
  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessMemberInviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the invite details and try again.",
    );
  }

  const memberLimit = getUsageLimit(
    businessContext.business.plan,
    "membersPerBusiness",
  );

  if (memberLimit !== null) {
    const currentMemberCount = await getBusinessMemberCount(
      businessContext.business.id,
    );

    if (currentMemberCount >= memberLimit) {
      return {
        error: `Business supports up to ${memberLimit} member${
          memberLimit === 1 ? "" : "s"
        }, including the owner.`,
      };
    }
  }

  const inviteToken = randomUUID();

  try {
    const { inviteId } = await createBusinessMemberInvite({
      businessId: businessContext.business.id,
      inviterUserId: user.id,
      email: validationResult.data.email,
      role: validationResult.data.role,
      token: inviteToken,
      expiresAt: new Date(Date.now() + businessMemberInviteDurationDays * 24 * 60 * 60 * 1000),
    });

    const invitePath = getBusinessMemberInvitePath(inviteToken);
    const inviteUrl = new URL(invitePath, env.BETTER_AUTH_URL).toString();

    // In low-email mode, skip invite email delivery but still create the
    // secure invite so owners can copy/share the link manually. Email
    // delivery is non-blocking — don't fail the action if email fails.
    if (isMemberInviteEmailEnabled) {
      sendBusinessMemberInviteEmail({
        inviteId,
        token: inviteToken,
        email: validationResult.data.email,
        businessName: businessContext.business.name,
        inviterName: user.name,
        role: validationResult.data.role,
        inviteUrl,
        businessId: businessContext.business.id,
        userId: user.id,
      }).catch((error) => {
        console.error("Failed to send business member invite email.", error);
      });
    }

    updateCacheTags(getBusinessMembersCacheTags(businessContext.business.id));
    revalidatePath(getBusinessMembersPath(businessContext.business.slug));

    return {
      success: isMemberInviteEmailEnabled
        ? "Invite sent."
        : "Invite created. Copy the link to share it manually.",
      inviteLink: invitePath,
    };
  } catch (error) {
    console.error("Failed to create business member invite.", error);
    return { error: "We couldn't create that invite right now." };
  }
}

export async function getOrCreateBusinessInviteLinkAction(
  prevState: BusinessMemberInviteActionState = initialInviteState,
): Promise<BusinessMemberInviteActionState> {
  void prevState;
  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;

  try {
    const { token } = await getOrCreateBusinessInviteLink({
      businessId: businessContext.business.id,
      userId: user.id,
    });

    updateCacheTags(getBusinessMembersCacheTags(businessContext.business.id));
    revalidatePath(getBusinessMembersPath(businessContext.business.slug));

    return {
      success: "Invite link ready.",
      inviteLink: getBusinessMemberInvitePath(token),
    };
  } catch (error) {
    console.error("Failed to load business invite link.", error);
    return { error: "We couldn't load that invite link right now." };
  }
}

export async function regenerateBusinessInviteLinkAction(
  prevState: BusinessMemberInviteActionState = initialInviteState,
): Promise<BusinessMemberInviteActionState> {
  void prevState;
  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;

  try {
    const { token } = await regenerateBusinessInviteLink({
      businessId: businessContext.business.id,
      userId: user.id,
    });

    updateCacheTags(getBusinessMembersCacheTags(businessContext.business.id));
    revalidatePath(getBusinessMembersPath(businessContext.business.slug));

    return {
      success: "Invite link regenerated. The previous link no longer works.",
      inviteLink: getBusinessMemberInvitePath(token),
    };
  } catch (error) {
    console.error("Failed to regenerate business invite link.", error);
    return { error: "We couldn't regenerate that invite link right now." };
  }
}

export async function cancelBusinessMemberInviteAction(
  prevState: BusinessMemberInviteActionState = initialInviteState,
  formData: FormData,
): Promise<BusinessMemberInviteActionState> {
  void prevState;
  const parsedId = businessMemberInviteIdSchema.safeParse(formData.get("inviteId"));

  if (!parsedId.success) {
    return { error: "That invite could not be found." };
  }

  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { businessContext } = ownerAccess;

  try {
    await cancelBusinessMemberInvite({
      businessId: businessContext.business.id,
      inviteId: parsedId.data,
    });

    updateCacheTags(getBusinessMembersCacheTags(businessContext.business.id));
    revalidatePath(getBusinessMembersPath(businessContext.business.slug));

    return { success: "Invite canceled." };
  } catch (error) {
    console.error("Failed to cancel member invite.", error);
    return { error: "We couldn't cancel that invite right now." };
  }
}

export async function updateBusinessMemberRoleAction(
  prevState: BusinessMemberInviteActionState = initialInviteState,
  formData: FormData,
): Promise<BusinessMemberInviteActionState> {
  void prevState;
  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { businessContext, user } = ownerAccess;
  const validationResult = businessMemberRoleUpdateSchema.safeParse({
    membershipId: formData.get("membershipId"),
    role: formData.get("role"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check that role and try again.",
    );
  }

  // Prevent owner from changing their own role.
  const isSelf = formData.get("userId") === user.id;
  if (isSelf) {
    return { error: "Owner access stays unchanged here." };
  }

  try {
    await updateBusinessMemberRole({
      businessId: businessContext.business.id,
      membershipId: validationResult.data.membershipId,
      role: validationResult.data.role,
    });

    updateCacheTags(getBusinessMembersCacheTags(businessContext.business.id));
    revalidatePath(getBusinessMembersPath(businessContext.business.slug));

    return { success: "Member updated." };
  } catch (error) {
    console.error("Failed to update member role.", error);
    return { error: "We couldn't update that member right now." };
  }
}

export async function removeBusinessMemberAction(
  prevState: BusinessMemberInviteActionState = initialInviteState,
  formData: FormData,
): Promise<BusinessMemberInviteActionState> {
  void prevState;
  const parsedMembershipId = businessMembershipIdSchema.safeParse(
    formData.get("membershipId"),
  );

  if (!parsedMembershipId.success) {
    return { error: "That member could not be found." };
  }

  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { businessContext, user } = ownerAccess;
  const isSelf = formData.get("userId") === user.id;

  if (isSelf) {
    // Allow leaving only if there is at least one other owner.
    const otherOwners = await db
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(
        and(
          eq(businessMembers.businessId, businessContext.business.id),
          eq(businessMembers.role, "owner"),
          ne(businessMembers.userId, user.id),
        ),
      )
      .limit(1);

    if (otherOwners.length === 0) {
      return { error: "Assign another owner before leaving this business." };
    }
  }

  try {
    await removeBusinessMember({
      businessId: businessContext.business.id,
      membershipId: parsedMembershipId.data,
    });

    updateCacheTags(getBusinessMembersCacheTags(businessContext.business.id));
    revalidatePath(getBusinessMembersPath(businessContext.business.slug));

    return { success: "Member removed." };
  } catch (error) {
    console.error("Failed to remove member.", error);
    return { error: "We couldn't remove that member right now." };
  }
}

export async function acceptBusinessMemberInviteAction(inviteToken: string) {
  const session = await requireSession();
  const result = await acceptBusinessMemberInvite({
    inviteToken,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  if (!result.ok) {
    redirect(`/invite/${inviteToken}?error=1`);
  }

  updateCacheTags([
    ...getBusinessMembersCacheTags(result.businessId),
    ...getUserPendingInvitesCacheTags(session.user.id),
  ]);

  // Persist active business in the shell cookie.
  const cookieStore = await cookies();
  cookieStore.set(
    activeBusinessSlugCookieName,
    result.businessSlug,
    getActiveBusinessCookieAttributes(),
  );

  redirect(getBusinessHomePath(result.businessSlug));
}

export async function acceptBusinessInviteLinkAction(inviteToken: string) {
  const session = await requireSession();
  const result = await acceptBusinessInviteLink({
    inviteToken,
    userId: session.user.id,
  });

  if (!result.ok) {
    redirect(`/invite/${inviteToken}?error=1`);
  }

  updateCacheTags(getBusinessMembersCacheTags(result.businessId));

  const cookieStore = await cookies();
  cookieStore.set(
    activeBusinessSlugCookieName,
    result.businessSlug,
    getActiveBusinessCookieAttributes(),
  );

  redirect(getBusinessHomePath(result.businessSlug));
}

export async function acceptInviteFromHubAction(
  inviteToken: string,
): Promise<{ error?: string }> {
  const session = await requireSession();
  const result = await acceptBusinessMemberInvite({
    inviteToken,
    userId: session.user.id,
    userEmail: session.user.email,
  });

  if (!result.ok) {
    return { error: result.error };
  }

  updateCacheTags(getUserPendingInvitesCacheTags(session.user.id));
  updateCacheTags(getBusinessMembersCacheTags(result.businessId));

  // Persist active business in the shell cookie.
  const cookieStore = await cookies();
  cookieStore.set(
    activeBusinessSlugCookieName,
    result.businessSlug,
    getActiveBusinessCookieAttributes(),
  );

  revalidatePath(homePath);
  redirect(getBusinessHomePath(result.businessSlug));
}

export async function declineInviteFromHubAction(
  inviteId: string,
): Promise<{ error?: string }> {
  const session = await requireSession();

  // Verify the invite belongs to this user's email before deleting.
  const invite = await db
    .select({
      id: businessMemberInvites.id,
      email: businessMemberInvites.email,
      businessId: businessMemberInvites.businessId,
    })
    .from(businessMemberInvites)
    .where(eq(businessMemberInvites.id, inviteId))
    .limit(1);

  const row = invite[0];

  if (!row) {
    return { error: "That invite could not be found." };
  }

  if (row.email.toLowerCase() !== session.user.email.toLowerCase()) {
    return { error: "This invite belongs to a different account." };
  }

  await db
    .delete(businessMemberInvites)
    .where(eq(businessMemberInvites.id, inviteId));

  updateCacheTags(getUserPendingInvitesCacheTags(session.user.id));
  updateCacheTags(getBusinessMembersCacheTags(row.businessId));
  revalidatePath(homePath);

  return {};
}

