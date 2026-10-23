"use server";

import { randomUUID } from "node:crypto";
import { newEntityId } from "@/lib/ids";
import { and, eq, gt, isNull } from "drizzle-orm";

import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import {
  businessInviteLinks,
  businessMemberInvites,
  businessMembers,
  businesses,
} from "@/lib/db/schema";
import { getBusinessMemberCount } from "@/lib/plans/usage";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { hashOpaqueToken } from "@/lib/security/tokens";
import type { BusinessMemberAssignableRole } from "@/lib/business-members";

export async function createBusinessMemberInvite({
  businessId,
  inviterUserId,
  email,
  role,
  token,
  expiresAt,
}: {
  businessId: string;
  inviterUserId: string;
  email: string;
  role: BusinessMemberAssignableRole;
  token: string;
  expiresAt: Date;
}): Promise<{ inviteId: string }> {
  const tokenHash = hashOpaqueToken(token);
  const inviteId = newEntityId();

  const [row] = await db
    .insert(businessMemberInvites)
    .values({
      id: inviteId,
      businessId,
      inviterUserId,
      email,
      role,
      token,
      tokenHash,
      expiresAt,
    })
    .onConflictDoUpdate({
      target: [businessMemberInvites.businessId, businessMemberInvites.email],
      set: {
        inviterUserId,
        role,
        token,
        tokenHash,
        expiresAt,
        updatedAt: new Date(),
      },
    })
    .returning({ inviteId: businessMemberInvites.id });

  return { inviteId: row.inviteId };
}

export async function cancelBusinessMemberInvite({
  businessId,
  inviteId,
}: {
  businessId: string;
  inviteId: string;
}) {
  await db
    .delete(businessMemberInvites)
    .where(
      and(
        eq(businessMemberInvites.businessId, businessId),
        eq(businessMemberInvites.id, inviteId),
      ),
    );
}

export async function acceptBusinessMemberInvite({
  inviteToken,
  userId,
  userEmail,
}: {
  inviteToken: string;
  userId: string;
  userEmail: string;
}): Promise<
  | { ok: true; businessId: string; businessSlug: string }
  | { ok: false; error: string }
> {
  const tokenHash = hashOpaqueToken(inviteToken);

  const rows = await db
    .select({
      inviteId: businessMemberInvites.id,
      businessId: businessMemberInvites.businessId,
      role: businessMemberInvites.role,
      email: businessMemberInvites.email,
      expiresAt: businessMemberInvites.expiresAt,
      businessSlug: businesses.slug,
    })
    .from(businessMemberInvites)
    .innerJoin(businesses, eq(businessMemberInvites.businessId, businesses.id))
    .where(
      and(
        eq(businessMemberInvites.tokenHash, tokenHash),
        gt(businessMemberInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const invite = rows[0];

  if (!invite) {
    return { ok: false, error: "That invite is invalid or expired." };
  }

  if (invite.email.toLowerCase() !== userEmail.toLowerCase()) {
    return {
      ok: false,
      error: "This invite was sent to a different email address.",
    };
  }

  // Create membership if it doesn't exist.
  await db
    .insert(businessMembers)
    .values({
      id: newEntityId(),
      businessId: invite.businessId,
      userId,
      role: invite.role,
    })
    .onConflictDoNothing();

  // Consume invite
  await db.delete(businessMemberInvites).where(eq(businessMemberInvites.id, invite.inviteId));

  return { ok: true, businessId: invite.businessId, businessSlug: invite.businessSlug };
}

export async function getOrCreateBusinessInviteLink({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}): Promise<{ token: string }> {
  const existing = await db
    .select({
      token: businessInviteLinks.token,
    })
    .from(businessInviteLinks)
    .where(
      and(
        eq(businessInviteLinks.businessId, businessId),
        isNull(businessInviteLinks.disabledAt),
      ),
    )
    .limit(1);

  const active = existing[0];

  if (active?.token) {
    return { token: active.token };
  }

  const token = randomUUID();
  const tokenHash = hashOpaqueToken(token);

  const inserted = await db
    .insert(businessInviteLinks)
    .values({
      id: newEntityId(),
      businessId,
      createdByUserId: userId,
      role: "staff",
      token,
      tokenHash,
    })
    .onConflictDoNothing({ target: businessInviteLinks.businessId })
    .returning({ token: businessInviteLinks.token });

  if (inserted[0]?.token) {
    return { token: inserted[0].token };
  }

  // Lost a race with another creator — read the winner.
  const raced = await db
    .select({ token: businessInviteLinks.token })
    .from(businessInviteLinks)
    .where(eq(businessInviteLinks.businessId, businessId))
    .limit(1);

  const winner = raced[0];

  if (!winner?.token) {
    throw new Error("Could not create a business invite link.");
  }

  return { token: winner.token };
}

export async function regenerateBusinessInviteLink({
  businessId,
  userId,
}: {
  businessId: string;
  userId: string;
}): Promise<{ token: string }> {
  const token = randomUUID();
  const tokenHash = hashOpaqueToken(token);

  const updated = await db
    .update(businessInviteLinks)
    .set({
      createdByUserId: userId,
      role: "staff",
      token,
      tokenHash,
      disabledAt: null,
      updatedAt: new Date(),
    })
    .where(eq(businessInviteLinks.businessId, businessId))
    .returning({ token: businessInviteLinks.token });

  if (updated[0]?.token) {
    return { token: updated[0].token };
  }

  await db.insert(businessInviteLinks).values({
    id: newEntityId(),
    businessId,
    createdByUserId: userId,
    role: "staff",
    token,
    tokenHash,
  });

  return { token };
}

export async function acceptBusinessInviteLink({
  inviteToken,
  userId,
}: {
  inviteToken: string;
  userId: string;
}): Promise<
  | { ok: true; businessId: string; businessSlug: string }
  | { ok: false; error: string }
> {
  const tokenHash = hashOpaqueToken(inviteToken);

  const rows = await db
    .select({
      businessId: businessInviteLinks.businessId,
      role: businessInviteLinks.role,
      businessSlug: businesses.slug,
    })
    .from(businessInviteLinks)
    .innerJoin(businesses, eq(businessInviteLinks.businessId, businesses.id))
    .where(
      and(
        eq(businessInviteLinks.tokenHash, tokenHash),
        isNull(businessInviteLinks.disabledAt),
      ),
    )
    .limit(1);

  const link = rows[0];

  if (!link) {
    return { ok: false, error: "That invite is invalid or expired." };
  }

  // Re-joining with an existing membership is always allowed.
  const existingMembership = await db
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, link.businessId),
        eq(businessMembers.userId, userId),
      ),
    )
    .limit(1);

  if (existingMembership.length > 0) {
    return {
      ok: true,
      businessId: link.businessId,
      businessSlug: link.businessSlug,
    };
  }

  const effectivePlan = await getEffectivePlanForBusiness(link.businessId);
  const memberLimit = getUsageLimit(effectivePlan, "membersPerBusiness");

  if (memberLimit !== null) {
    const currentMemberCount = await getBusinessMemberCount(link.businessId);

    if (currentMemberCount >= memberLimit) {
      return {
        ok: false,
        error: `This business supports up to ${memberLimit} member${
          memberLimit === 1 ? "" : "s"
        }, including the owner.`,
      };
    }
  }

  await db
    .insert(businessMembers)
    .values({
      id: newEntityId(),
      businessId: link.businessId,
      userId,
      role: link.role,
    })
    .onConflictDoNothing();

  return {
    ok: true,
    businessId: link.businessId,
    businessSlug: link.businessSlug,
  };
}

export async function updateBusinessMemberRole({
  businessId,
  membershipId,
  role,
}: {
  businessId: string;
  membershipId: string;
  role: "owner" | "manager" | "staff";
}) {
  await db
    .update(businessMembers)
    .set({
      role,
      updatedAt: new Date(),
    })
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.id, membershipId)));
}

export async function removeBusinessMember({
  businessId,
  membershipId,
}: {
  businessId: string;
  membershipId: string;
}) {
  await db
    .delete(businessMembers)
    .where(and(eq(businessMembers.businessId, businessId), eq(businessMembers.id, membershipId)));
}

