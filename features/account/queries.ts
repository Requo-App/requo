import "server-only";

import { and, count, eq, isNull } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";

import type {
  AccountDeletionPreflight,
  AccountProfileRecord,
  AccountSecurityView,
  AccountSessionView,
} from "@/features/account/types";
import {
  getUserProfileCacheTags,
  userShellCacheLife,
} from "@/lib/cache/shell-tags";
import { db } from "@/lib/db/client";
import {
  account,
  businesses,
  businessSubscriptions,
  profiles,
  user,
} from "@/lib/db/schema";

async function getCachedAccountProfile(
  userId: string,
): Promise<AccountProfileRecord | null> {
  "use cache";

  cacheLife(userShellCacheLife);
  cacheTag(...getUserProfileCacheTags(userId));

  const [profile] = await db
    .select({
      fullName: profiles.fullName,
      firstName: profiles.firstName,
      lastName: profiles.lastName,
      jobTitle: profiles.jobTitle,
      phone: profiles.phone,
      avatarStoragePath: profiles.avatarStoragePath,
      avatarContentType: profiles.avatarContentType,
      onboardingCompletedAt: profiles.onboardingCompletedAt,
      dashboardTourCompletedAt: profiles.dashboardTourCompletedAt,
      formEditorTourCompletedAt: profiles.formEditorTourCompletedAt,
      updatedAt: profiles.updatedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  return profile ?? null;
}

export const getAccountProfileForUser = cache(async (
  userId: string,
): Promise<AccountProfileRecord | null> => {
  return getCachedAccountProfile(userId);
});

export const hasGoogleAccountLinked = cache(async (
  userId: string,
): Promise<boolean> => {
  try {
    const rows = await db
      .select({ providerId: account.providerId })
      .from(account)
      .where(eq(account.userId, userId))
      .limit(10);
    return rows.some((row) => row.providerId === "google");
  } catch {
    return false;
  }
});

export const getAccountSecurityForUser = cache(async (
  userId: string,
  email: string,
): Promise<Omit<AccountSecurityView, "activeSessionCount" | "activeSessions">> => {
  const [accountRows, ownedBusinessRows, deletion] = await Promise.all([
    db
      .select({
        providerId: account.providerId,
        password: account.password,
      })
      .from(account)
      .where(eq(account.userId, userId)),
    db
      .select({
        count: count(),
      })
      .from(businesses)
      .where(
        and(
          eq(businesses.ownerUserId, userId),
          isNull(businesses.deletedAt),
        ),
      ),
    getAccountDeletionPreflight(userId),
  ]);

  return {
    email,
    hasPassword: accountRows.some(
      (row) => row.providerId === "credential" && Boolean(row.password),
    ),
    connectedProviders: Array.from(
      new Set(accountRows.map((row) => row.providerId)),
    ),
    ownedBusinessCount: ownedBusinessRows[0]?.count ?? 0,
    deletion,
  };
});

export async function getAccountDeletionPreflight(
  userId: string,
): Promise<AccountDeletionPreflight> {
  const [ownedBusinessRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        subscriptionStatus: businessSubscriptions.status,
        canceledAt: businessSubscriptions.canceledAt,
        currentPeriodEnd: businessSubscriptions.currentPeriodEnd,
        billingProvider: businessSubscriptions.billingProvider,
        providerSubscriptionId: businessSubscriptions.providerSubscriptionId,
      })
      .from(businesses)
      .leftJoin(
        businessSubscriptions,
        eq(businessSubscriptions.businessId, businesses.id),
      )
      .where(
        and(
          eq(businesses.ownerUserId, userId),
          isNull(businesses.deletedAt),
        ),
      ),
  ]);

  const blockers = ownedBusinessRows.map((biz) => {
    const hasActiveSubscription =
      biz.subscriptionStatus === "active" ||
      biz.subscriptionStatus === "past_due" ||
      biz.subscriptionStatus === "paused";

    if (hasActiveSubscription) {
      return {
        code: "owned_business_subscription" as const,
        message: `You can't delete this account yet because ${biz.name} has an active subscription. Cancel it first.`,
        businessName: biz.name,
        businessSlug: biz.slug,
      };
    }

    return {
      code: "owned_business" as const,
      message: `You can't delete this account yet because you still own ${biz.name}. Transfer ownership or delete the business first.`,
      businessName: biz.name,
      businessSlug: biz.slug,
    };
  });

  return {
    allowed: blockers.length === 0,
    blockers,
    ownedBusinesses: ownedBusinessRows.map((biz) => ({
      id: biz.id,
      name: biz.name,
      slug: biz.slug,
    })),
    soleOwnedBusinesses: [],
  };
}

function toSessionISOString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date.toISOString();
}

/**
 * Lists the user's active Better Auth sessions for the Devices section.
 * Request-bound (reads request headers), so intentionally not cached —
 * the current session is identified by matching the session id.
 */
export async function getAccountSessionsForUser(): Promise<AccountSessionView[]> {
  const { auth } = await import("@/lib/auth/server");
  const requestHeaders = await headers();

  const [current, listed] = await Promise.all([
    auth.api.getSession({ headers: requestHeaders }).catch(() => null),
    auth.api.listSessions({ headers: requestHeaders }).catch(() => []),
  ]);

  const currentSessionId = current?.session?.id ?? null;
  const sessions = Array.isArray(listed) ? listed : [];

  return sessions.map((item) => {
    const row: {
      id?: unknown;
      token?: unknown;
      userAgent?: unknown;
      ipAddress?: unknown;
      createdAt?: unknown;
      updatedAt?: unknown;
      expiresAt?: unknown;
    } =
      typeof item === "object" && item !== null && "session" in item
        ? ((item as { session: unknown }).session as Record<string, unknown>)
        : (item as Record<string, unknown>);

    const id = typeof row.id === "string" ? row.id : "";

    return {
      id,
      token: typeof row.token === "string" ? row.token : null,
      userAgent: typeof row.userAgent === "string" ? row.userAgent : null,
      ipAddress: typeof row.ipAddress === "string" ? row.ipAddress : null,
      createdAt: toSessionISOString(
        row.createdAt as Date | string | null | undefined,
      ),
      updatedAt: toSessionISOString(
        row.updatedAt as Date | string | null | undefined,
      ),
      expiresAt: toSessionISOString(
        row.expiresAt as Date | string | null | undefined,
      ),
      isCurrent: currentSessionId ? id === currentSessionId : false,
    } satisfies AccountSessionView;
  });
}

/**
 * Fresh email lookup for the impersonation banner. We deliberately read the
 * row on each request instead of trusting the session cookie's cached copy,
 * so a deleted user or admin is reflected immediately.
 */
export async function getUserEmailForImpersonationBanner(
  userId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return row?.email ?? null;
}
