import "server-only";

import { and, count, desc, eq, gte, gt, inArray, isNull, sql } from "drizzle-orm";

import {
  toBusinessNotificationItem,
} from "@/features/notifications/utils";
import type {
  BusinessNotificationBellView,
  BusinessNotificationItem,
  BusinessNotificationRecord,
} from "@/features/notifications/types";
import { db } from "@/lib/db/client";
import {
  businessNotificationReads,
  businessNotificationStates,
  businessNotifications,
} from "@/lib/db/schema";

const defaultNotificationLimit = 15;

export type BusinessNotificationCursor = {
  createdAt: string;
  id: string;
};

async function loadIndividualReadIds({
  businessId,
  userId,
  notificationIds,
}: {
  businessId: string;
  userId: string;
  notificationIds: readonly string[];
}): Promise<Set<string>> {
  if (notificationIds.length === 0) {
    return new Set<string>();
  }

  const rows = await db
    .select({ notificationId: businessNotificationReads.notificationId })
    .from(businessNotificationReads)
    .where(
      and(
        eq(businessNotificationReads.businessId, businessId),
        eq(businessNotificationReads.userId, userId),
        inArray(businessNotificationReads.notificationId, notificationIds),
      ),
    );

  return new Set(rows.map((row) => row.notificationId));
}

export async function getBusinessNotificationBellView({
  businessId,
  businessSlug,
  userId,
  memberSince,
  limit = defaultNotificationLimit,
}: {
  businessId: string;
  businessSlug: string;
  userId: string;
  memberSince: Date;
  limit?: number;
}): Promise<BusinessNotificationBellView> {
  const [rawRows, stateRows] = await Promise.all([
    db
      .select({
        id: businessNotifications.id,
        businessId: businessNotifications.businessId,
        inquiryId: businessNotifications.inquiryId,
        quoteId: businessNotifications.quoteId,
        invoiceId: businessNotifications.invoiceId,
        type: businessNotifications.type,
        title: businessNotifications.title,
        summary: businessNotifications.summary,
        metadata: businessNotifications.metadata,
        createdAt: businessNotifications.createdAt,
      })
      .from(businessNotifications)
      .where(
        and(
          eq(businessNotifications.businessId, businessId),
          gte(businessNotifications.createdAt, memberSince),
        ),
      )
      .orderBy(
        desc(businessNotifications.createdAt),
        desc(businessNotifications.id),
      )
      .limit(limit + 1),
    db
      .select({
        lastReadAt: businessNotificationStates.lastReadAt,
      })
      .from(businessNotificationStates)
      .where(
        and(
          eq(businessNotificationStates.businessId, businessId),
          eq(businessNotificationStates.userId, userId),
        ),
      )
      .limit(1),
  ]);

  const lastReadAt = stateRows[0]?.lastReadAt ?? null;
  const hasMore = rawRows.length > limit;
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows;

  const individuallyReadIds = await loadIndividualReadIds({
    businessId,
    userId,
    notificationIds: rows.map((row) => row.id),
  });

  // Accurate unread count: notifications where
  //   created_at > last_read_at (or no watermark)
  //   AND created_at >= memberSince
  //   AND no individual read row exists for this user.
  //
  // The LEFT JOIN + IS NULL pattern avoids a subquery per row.
  const unreadConditions = [
    eq(businessNotifications.businessId, businessId),
    gte(businessNotifications.createdAt, memberSince),
    isNull(businessNotificationReads.id),
  ];

  if (lastReadAt) {
    unreadConditions.push(gt(businessNotifications.createdAt, lastReadAt));
  }

  const unreadCountRows = await db
    .select({ count: count() })
    .from(businessNotifications)
    .leftJoin(
      businessNotificationReads,
      and(
        eq(
          businessNotificationReads.notificationId,
          businessNotifications.id,
        ),
        eq(businessNotificationReads.userId, userId),
      ),
    )
    .where(and(...unreadConditions));

  const unreadCount = Number(unreadCountRows[0]?.count ?? 0);

  return {
    items: (rows satisfies BusinessNotificationRecord[]).map((notification) =>
      toBusinessNotificationItem(
        businessSlug,
        notification,
        lastReadAt,
        individuallyReadIds,
      ),
    ),
    unreadCount,
    lastReadAt: lastReadAt?.toISOString() ?? null,
    hasMore,
  };
}

/**
 * Older notifications than the given cursor (for infinite scroll in the bell popover).
 */
export async function fetchBusinessNotificationsBeforeCursor({
  businessId,
  businessSlug,
  userId,
  memberSince,
  cursor,
  lastReadAt,
  limit = defaultNotificationLimit,
}: {
  businessId: string;
  businessSlug: string;
  userId: string;
  memberSince: Date;
  cursor: BusinessNotificationCursor;
  lastReadAt: string | null;
  limit?: number;
}): Promise<{
  items: BusinessNotificationItem[];
  hasMore: boolean;
}> {
  const cursorDate = new Date(cursor.createdAt);
  const olderThanCursor = sql`(${businessNotifications.createdAt}, ${businessNotifications.id}) < (${cursorDate}::timestamptz, ${cursor.id})`;

  const rawRows = await db
    .select({
      id: businessNotifications.id,
      businessId: businessNotifications.businessId,
      inquiryId: businessNotifications.inquiryId,
      quoteId: businessNotifications.quoteId,
      invoiceId: businessNotifications.invoiceId,
      type: businessNotifications.type,
      title: businessNotifications.title,
      summary: businessNotifications.summary,
      metadata: businessNotifications.metadata,
      createdAt: businessNotifications.createdAt,
    })
    .from(businessNotifications)
    .where(
      and(
        eq(businessNotifications.businessId, businessId),
        gte(businessNotifications.createdAt, memberSince),
        olderThanCursor,
      ),
    )
    .orderBy(
      desc(businessNotifications.createdAt),
      desc(businessNotifications.id),
    )
    .limit(limit + 1);

  const hasMore = rawRows.length > limit;
  const rows = hasMore ? rawRows.slice(0, limit) : rawRows;
  const lastRead = lastReadAt ? new Date(lastReadAt) : null;

  const individuallyReadIds = await loadIndividualReadIds({
    businessId,
    userId,
    notificationIds: rows.map((row) => row.id),
  });

  return {
    items: (rows satisfies BusinessNotificationRecord[]).map((notification) =>
      toBusinessNotificationItem(
        businessSlug,
        notification,
        lastRead,
        individuallyReadIds,
      ),
    ),
    hasMore,
  };
}
