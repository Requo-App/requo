import "server-only";

import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

import type {
  BusinessInviteLinkView,
  BusinessMembersSettingsView,
} from "@/features/business-members/types";
import type { BusinessMemberRole } from "@/lib/business-members";
import {
  getBusinessMembersCacheTags,
  settingsBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { getUserPendingInvitesCacheTags } from "@/lib/cache/shell-tags";
import { db } from "@/lib/db/client";
import {
  businessInviteLinks,
  businessMemberInvites,
  businessMembers,
  businesses,
  user,
} from "@/lib/db/schema";
import { hashOpaqueToken } from "@/lib/security/tokens";

function getMemberRoleSortExpression() {
  return sql`case
    when ${businessMembers.role} = 'owner' then 0
    when ${businessMembers.role} = 'manager' then 1
    else 2
  end`;
}

export async function getBusinessMembersSettingsForBusiness(
  businessId: string,
  currentUserId: string,
): Promise<BusinessMembersSettingsView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessMembersCacheTags(businessId));

  const [businessRow, memberRows, inviteRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        membershipId: businessMembers.id,
        userId: businessMembers.userId,
        role: businessMembers.role,
        joinedAt: businessMembers.createdAt,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(businessMembers)
      .innerJoin(user, eq(businessMembers.userId, user.id))
      .where(eq(businessMembers.businessId, businessId))
      .orderBy(
        getMemberRoleSortExpression(),
        asc(user.name),
        asc(user.email),
        asc(businessMembers.createdAt),
      ),
    db
      .select({
        inviteId: businessMemberInvites.id,
        email: businessMemberInvites.email,
        role: businessMemberInvites.role,
        token: businessMemberInvites.token,
        expiresAt: businessMemberInvites.expiresAt,
        createdAt: businessMemberInvites.createdAt,
        inviterName: user.name,
        inviterEmail: user.email,
      })
      .from(businessMemberInvites)
      .innerJoin(user, eq(businessMemberInvites.inviterUserId, user.id))
      .where(eq(businessMemberInvites.businessId, businessId))
      .orderBy(asc(businessMemberInvites.createdAt)),
  ]);

  const business = businessRow[0];

  if (!business) {
    return null;
  }

  return {
    businessId: business.id,
    businessName: business.name,
    businessSlug: business.slug,
    currentUserId,
    members: memberRows.map((member) => ({
      membershipId: member.membershipId,
      userId: member.userId,
      name: member.name,
      email: member.email,
      image: member.image ?? null,
      role: member.role,
      joinedAt: member.joinedAt,
      isCurrentUser: member.userId === currentUserId,
    })),
    invites: inviteRows
      .filter((invite) => typeof invite.token === "string" && invite.token.length > 0)
      .filter((invite) => invite.role !== "owner")
      .map((invite) => ({
        inviteId: invite.inviteId,
        email: invite.email,
        role: invite.role === "manager" ? "manager" : "staff",
        token: invite.token as string,
        inviterName: invite.inviterName,
        inviterEmail: invite.inviterEmail,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
      })),
  };
}

export async function getBusinessInviteLinkForBusiness(
  businessId: string,
): Promise<BusinessInviteLinkView | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getBusinessMembersCacheTags(businessId));

  const rows = await db
    .select({
      token: businessInviteLinks.token,
      role: businessInviteLinks.role,
      createdAt: businessInviteLinks.createdAt,
      updatedAt: businessInviteLinks.updatedAt,
    })
    .from(businessInviteLinks)
    .where(
      and(
        eq(businessInviteLinks.businessId, businessId),
        isNull(businessInviteLinks.disabledAt),
      ),
    )
    .limit(1);

  const row = rows[0];

  if (!row?.token) {
    return null;
  }

  return {
    token: row.token,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export type BusinessInviteLinkForToken = {
  businessId: string;
  businessName: string;
  businessSlug: string;
  role: BusinessMemberRole;
};

export async function getBusinessInviteLinkForToken(
  token: string,
): Promise<BusinessInviteLinkForToken | null> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);

  const tokenHash = hashOpaqueToken(token);

  const rows = await db
    .select({
      businessId: businessInviteLinks.businessId,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      role: businessInviteLinks.role,
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

  return rows[0] ?? null;
}

export async function getBusinessMemberInviteForToken(token: string) {
  "use cache";

  cacheLife(settingsBusinessCacheLife);

  const tokenHash = hashOpaqueToken(token);

  const rows = await db
    .select({
      inviteId: businessMemberInvites.id,
      businessId: businessMemberInvites.businessId,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      email: businessMemberInvites.email,
      role: businessMemberInvites.role,
      expiresAt: businessMemberInvites.expiresAt,
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

  return rows[0] ?? null;
}

export type PendingInviteForUser = {
  inviteId: string;
  businessName: string;
  role: string;
  token: string;
  inviterName: string | null;
  expiresAt: Date;
};

export async function getPendingInvitesForUser(
  userId: string,
  userEmail: string,
): Promise<PendingInviteForUser[]> {
  "use cache";

  cacheLife(settingsBusinessCacheLife);
  cacheTag(...getUserPendingInvitesCacheTags(userId));

  const rows = await db
    .select({
      inviteId: businessMemberInvites.id,
      businessName: businesses.name,
      role: businessMemberInvites.role,
      token: businessMemberInvites.token,
      inviterName: user.name,
      expiresAt: businessMemberInvites.expiresAt,
    })
    .from(businessMemberInvites)
    .innerJoin(businesses, eq(businessMemberInvites.businessId, businesses.id))
    .innerJoin(user, eq(businessMemberInvites.inviterUserId, user.id))
    .where(
      and(
        eq(businessMemberInvites.email, userEmail.toLowerCase()),
        gt(businessMemberInvites.expiresAt, new Date()),
      ),
    )
    .orderBy(asc(businessMemberInvites.createdAt));

  return rows
    .filter((row) => typeof row.token === "string" && row.token.length > 0)
    .map((row) => ({
      inviteId: row.inviteId,
      businessName: row.businessName,
      role: row.role,
      token: row.token as string,
      inviterName: row.inviterName,
      expiresAt: row.expiresAt,
    }));
}
