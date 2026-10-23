import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  isNull,
  lte,
  sql,
} from "drizzle-orm";

import {
  auditActionOptions,
  auditEntityOptions,
  businessAuditPageSize,
} from "@/features/audit/constants";
import type {
  AuditAction,
  AuditEntityType,
  AuditLogFilters,
  BusinessAuditLogFilterOption,
  BusinessAuditLogFiltersView,
  BusinessAuditLogItem,
  BusinessAuditLogPage,
} from "@/features/audit/types";
import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import { auditLogs, businesses, businessMembers, user } from "@/lib/db/schema";
import { hasFeatureAccess } from "@/lib/plans/entitlements";

function getDayStart(value: string) {
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDayEnd(value: string) {
  const start = getDayStart(value);

  if (!start) {
    return null;
  }

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return end;
}

export function parseAuditLogFilters(
  searchParams: Record<string, string | string[] | undefined>,
): AuditLogFilters {
  const actor = typeof searchParams.actor === "string" ? searchParams.actor : null;
  const business =
    typeof searchParams.business === "string" ? searchParams.business : null;
  const action =
    typeof searchParams.action === "string"
      ? (searchParams.action as AuditAction)
      : null;
  const entity =
    typeof searchParams.entity === "string"
      ? (searchParams.entity as AuditEntityType)
      : null;
  const from = typeof searchParams.from === "string" ? searchParams.from : null;
  const to = typeof searchParams.to === "string" ? searchParams.to : null;
  const pageValue = Number.parseInt(
    typeof searchParams.page === "string" ? searchParams.page : "1",
    10,
  );

  return {
    actor: actor?.trim() || null,
    business: business?.trim() || null,
    action,
    entity,
    from: from?.trim() || null,
    to: to?.trim() || null,
    page: Number.isFinite(pageValue) && pageValue > 0 ? pageValue : 1,
  };
}

export async function getBusinessAuditLogPageBySlug(
  userId: string,
  businessSlug: string,
  filters: AuditLogFilters,
): Promise<BusinessAuditLogPage | null> {
  const [membership] = await db
    .select({
      businessId: businesses.id,
      slug: businesses.slug,
      role: businessMembers.role,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businesses.slug, businessSlug),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  if (membership.role !== "owner" && membership.role !== "manager") {
    return null;
  }

  if (
    !hasFeatureAccess(
      await getEffectivePlanForBusiness(membership.businessId),
      "auditLogs",
    )
  ) {
    return null;
  }

  const fromDate = filters.from ? getDayStart(filters.from) : null;
  const toDate = filters.to ? getDayEnd(filters.to) : null;
  const offset = (filters.page - 1) * businessAuditPageSize;
  const where = and(
    eq(auditLogs.businessId, membership.businessId),
    filters.actor ? eq(auditLogs.actorUserId, filters.actor) : undefined,
    filters.action ? eq(auditLogs.action, filters.action) : undefined,
    filters.entity ? eq(auditLogs.entityType, filters.entity) : undefined,
    fromDate ? gte(auditLogs.createdAt, fromDate) : undefined,
    toDate ? lte(auditLogs.createdAt, toDate) : undefined,
  );

  const [items, totalRows] = await Promise.all([
    db
      .select({
        id: auditLogs.id,
        businessId: auditLogs.businessId,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        actorUserId: auditLogs.actorUserId,
        actorName: sql<string | null>`coalesce(${user.name}, ${auditLogs.metadata}->>'actorName')`,
        actorEmail: sql<string | null>`coalesce(${user.email}, ${auditLogs.metadata}->>'actorEmail')`,
        entityType: auditLogs.entityType,
        entityId: auditLogs.entityId,
        action: auditLogs.action,
        metadata: auditLogs.metadata,
        source: auditLogs.source,
        createdAt: auditLogs.createdAt,
      })
      .from(auditLogs)
      .leftJoin(user, eq(auditLogs.actorUserId, user.id))
      .leftJoin(businesses, eq(auditLogs.businessId, businesses.id))
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(businessAuditPageSize)
      .offset(offset),
    db
      .select({
        value: count(),
      })
      .from(auditLogs)
      .where(where),
  ]);

  return {
    items: items as BusinessAuditLogItem[],
    totalCount: Number(totalRows[0]?.value ?? 0),
    page: filters.page,
    pageCount: Math.max(
      1,
      Math.ceil(Number(totalRows[0]?.value ?? 0) / businessAuditPageSize),
    ),
    pageSize: businessAuditPageSize,
  };
}

export async function getBusinessAuditLogFiltersBySlug(
  userId: string,
  businessSlug: string,
): Promise<BusinessAuditLogFiltersView | null> {
  const [membership] = await db
    .select({
      businessId: businesses.id,
      role: businessMembers.role,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businesses.slug, businessSlug),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(1);

  if (!membership) {
    return null;
  }

  if (membership.role !== "owner" && membership.role !== "manager") {
    return null;
  }

  if (
    !hasFeatureAccess(
      await getEffectivePlanForBusiness(membership.businessId),
      "auditLogs",
    )
  ) {
    return null;
  }

  const [actorRows] = await Promise.all([
    db
      .select({
        value: auditLogs.actorUserId,
        label: sql<string>`coalesce(${user.name}, ${auditLogs.metadata}->>'actorName', ${auditLogs.metadata}->>'actorEmail', 'Former user')`,
      })
      .from(auditLogs)
      .leftJoin(user, eq(auditLogs.actorUserId, user.id))
      .where(
        and(
          eq(auditLogs.businessId, membership.businessId),
          sql`${auditLogs.actorUserId} is not null`,
        ),
      )
      .groupBy(
        auditLogs.actorUserId,
        user.name,
        sql`${auditLogs.metadata}->>'actorName'`,
        sql`${auditLogs.metadata}->>'actorEmail'`,
      )
      .orderBy(asc(sql<string>`coalesce(${user.name}, ${auditLogs.metadata}->>'actorName', ${auditLogs.metadata}->>'actorEmail', 'Former user')`)),
  ]);

  return {
    actors: actorRows
      .filter((row): row is BusinessAuditLogFilterOption => Boolean(row.value))
      .map((row) => ({
        value: row.value!,
        label: row.label,
      })),
    businesses: [], // Single-business context — no business filter needed
    actions: auditActionOptions,
    entities: auditEntityOptions,
  };
}


export async function getBusinessAuditLogExportRowsBySlug(
  userId: string,
  businessSlug: string,
  filters: AuditLogFilters,
): Promise<BusinessAuditLogItem[] | null> {
  const [membership] = await db
    .select({
      businessId: businesses.id,
      role: businessMembers.role,
    })
    .from(businessMembers)
    .innerJoin(businesses, eq(businessMembers.businessId, businesses.id))
    .where(
      and(
        eq(businessMembers.userId, userId),
        eq(businesses.slug, businessSlug),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(1);

  if (!membership || (membership.role !== "owner" && membership.role !== "manager")) {
    return null;
  }

  if (
    !hasFeatureAccess(
      await getEffectivePlanForBusiness(membership.businessId),
      "auditLogs",
    )
  ) {
    return null;
  }

  const fromDate = filters.from ? getDayStart(filters.from) : null;
  const toDate = filters.to ? getDayEnd(filters.to) : null;
  const where = and(
    eq(auditLogs.businessId, membership.businessId),
    filters.actor ? eq(auditLogs.actorUserId, filters.actor) : undefined,
    filters.action ? eq(auditLogs.action, filters.action) : undefined,
    filters.entity ? eq(auditLogs.entityType, filters.entity) : undefined,
    fromDate ? gte(auditLogs.createdAt, fromDate) : undefined,
    toDate ? lte(auditLogs.createdAt, toDate) : undefined,
  );

  const rows = await db
    .select({
      id: auditLogs.id,
      businessId: auditLogs.businessId,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      actorUserId: auditLogs.actorUserId,
      actorName: sql<string | null>`coalesce(${user.name}, ${auditLogs.metadata}->>'actorName')`,
      actorEmail: sql<string | null>`coalesce(${user.email}, ${auditLogs.metadata}->>'actorEmail')`,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      metadata: auditLogs.metadata,
      source: auditLogs.source,
      createdAt: auditLogs.createdAt,
    })
    .from(auditLogs)
    .leftJoin(user, eq(auditLogs.actorUserId, user.id))
    .leftJoin(businesses, eq(auditLogs.businessId, businesses.id))
    .where(where)
    .orderBy(desc(auditLogs.createdAt));

  return rows as BusinessAuditLogItem[];
}
