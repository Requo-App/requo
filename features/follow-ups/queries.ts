import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

import type {
  FollowUpActivityItem,
  FollowUpListQueryFilters,
  FollowUpOverviewData,
  FollowUpSummaryCounts,
  FollowUpView,
} from "@/features/follow-ups/types";
import {
  addCalendarDays,
  buildFollowUpSuggestedMessage,
  buildQuoteFollowUpWhyNow,
  getBusinessDayStartInstant,
  getFollowUpDueBucket,
  getFollowUpNextActionLabel,
  getTodayDateStringInTimezone,
} from "@/features/follow-ups/utils";
import { getPublicQuoteUrl } from "@/features/quotes/utils";
import {
  getBusinessFollowUpListCacheTags,
  getBusinessInquiryDetailCacheTags,
  getBusinessQuoteDetailCacheTags,
  hotBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { withCircuitBreaker } from "@/lib/db/circuit-breaker";
import { db } from "@/lib/db/client";
import {
  businesses,
  followUps,
  inquiries,
  quotes,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import type { BusinessPlan } from "@/lib/plans/plans";
import { likePattern } from "@/lib/sql-patterns";

const followUpOverviewLimit = 4;

type FollowUpRow = {
  id: string;
  businessId: string;
  businessName: string;
  businessTimezone: string;
  businessPlan: BusinessPlan;
  inquiryId: string | null;
  quoteId: string | null;
  assignedToUserId: string | null;
  createdByUserId: string | null;
  title: string;
  reason: string;
  channel: FollowUpView["channel"];
  sendMode: FollowUpView["sendMode"];
  category: string;
  recurrence: string;
  recurrenceCount: number;
  recurrenceLimit: number | null;
  terminationCondition: string | null;
  dueAt: Date;
  completedAt: Date | null;
  skippedAt: Date | null;
  snoozedUntil: Date | null;
  completionNote: string | null;
  status: FollowUpView["status"];
  createdAt: Date;
  updatedAt: Date;
  inquiryCustomerName: string | null;
  inquiryCustomerEmail: string | null;
  inquiryCustomerContactMethod: string | null;
  inquiryCustomerContactHandle: string | null;
  inquirySubject: string | null;
  quoteCustomerName: string | null;
  quoteCustomerEmail: string | null;
  quoteCustomerContactMethod: string | null;
  quoteCustomerContactHandle: string | null;
  quoteNumber: string | null;
  quoteTitle: string | null;
  quotePublicToken: string | null;
  quoteViewedAt: Date | null;
  quoteStatus: string | null;
  quoteTotalInCents: number | null;
  quoteCurrency: string | null;
  quoteSentAt: Date | null;
  quoteRespondedAt: Date | null;
  autoFollowUpEnabled: boolean | null;
  autoFollowUpDelayDays: number | null;
  autoFollowUpMaxAttempts: number | null;
  autoFollowUpAttempts: number | null;
  autoFollowUpLastSentAt: Date | null;
  autoFollowUpStoppedAt: Date | null;
};

/**
 * UTC bounds of the business-local "today" and "tomorrow".
 *
 * Due dates are stored as instants anchored at 9 AM in the business timezone,
 * so the day buckets must be cut at business-local midnight — not UTC
 * midnight, which would shift every bucket by a day east of Greenwich.
 */
function getBusinessDayBounds(timezone: string, now = new Date()) {
  const today = getTodayDateStringInTimezone(timezone, now);
  const tomorrow = addCalendarDays(today, 1);

  return {
    today,
    tomorrow,
    todayStart: getBusinessDayStartInstant(today, timezone),
    tomorrowStart: getBusinessDayStartInstant(tomorrow, timezone),
  };
}

function getQuotePublicUrl(publicToken: string | null) {
  if (!publicToken) {
    return null;
  }

  return new URL(getPublicQuoteUrl(publicToken), env.BETTER_AUTH_URL).toString();
}

function mapFollowUpRow(row: FollowUpRow): FollowUpView {
  const quotePublicUrl = getQuotePublicUrl(row.quotePublicToken);
  const isQuoteFollowUp = Boolean(row.quoteId);
  const customerName =
    row.quoteCustomerName ?? row.inquiryCustomerName ?? "Customer";
  const customerEmail = row.quoteCustomerEmail ?? row.inquiryCustomerEmail;
  const customerContactMethod =
    row.quoteCustomerContactMethod ?? row.inquiryCustomerContactMethod;
  const customerContactHandle =
    row.quoteCustomerContactHandle ?? row.inquiryCustomerContactHandle;
  const dueBucket = getFollowUpDueBucket({
    status: row.status,
    dueAt: row.dueAt,
  }, undefined, row.businessTimezone);
  const quoteContext = isQuoteFollowUp
    ? {
        status: row.quoteStatus,
        totalInCents: row.quoteTotalInCents,
        currency: row.quoteCurrency,
        sentAt: row.quoteSentAt,
        viewedAt: row.quoteViewedAt,
        respondedAt: row.quoteRespondedAt,
      }
    : null;

  return {
    id: row.id,
    businessId: row.businessId,
    businessTimezone: row.businessTimezone,
    businessPlan: row.businessPlan as BusinessPlan,
    inquiryId: row.inquiryId,
    quoteId: row.quoteId,
    assignedToUserId: row.assignedToUserId,
    createdByUserId: row.createdByUserId,
    title: row.title,
    reason: row.reason,
    category: (row.category === "post_win" ? "post_win" : "sales") as FollowUpView["category"],
    channel: row.channel,
    sendMode: row.sendMode ?? "manual",
    recurrence: (row.recurrence ?? "none") as FollowUpView["recurrence"],
    recurrenceCount: row.recurrenceCount ?? 0,
    recurrenceLimit: row.recurrenceLimit ?? null,
    terminationCondition: (row.terminationCondition as FollowUpView["terminationCondition"]) ?? null,
    dueAt: row.dueAt,
    completedAt: row.completedAt,
    skippedAt: row.skippedAt,
    snoozedUntil: row.snoozedUntil,
    completionNote: row.completionNote,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    dueBucket,
    customerName,
    customerEmail,
    customerContactMethod,
    customerContactHandle,
    related: isQuoteFollowUp
      ? {
          kind: "quote",
          id: row.quoteId!,
          label: row.quoteNumber
            ? `Quote ${row.quoteNumber}`
            : row.quoteTitle
              ? `Quote: ${row.quoteTitle}`
              : "Quote",
        }
      : {
          kind: "inquiry",
          id: row.inquiryId!,
          label: row.inquirySubject
            ? `Inquiry: ${row.inquirySubject}`
            : "Inquiry",
        },
    quoteNumber: row.quoteNumber,
    quoteTitle: row.quoteTitle,
    quotePublicUrl,
    quoteViewedAt: row.quoteViewedAt,
    source: row.sendMode === "automatic" ? "automatic_sequence" : "manual",
    whyNow: isQuoteFollowUp
      ? buildQuoteFollowUpWhyNow({
          dueAt: row.dueAt,
          dueBucket,
          quoteStatus: row.quoteStatus,
          sentAt: row.quoteSentAt,
          viewedAt: row.quoteViewedAt,
          respondedAt: row.quoteRespondedAt,
        })
      : null,
    nextActionLabel: getFollowUpNextActionLabel({
      channel: row.channel,
      relatedKind: isQuoteFollowUp ? "quote" : "inquiry",
    }),
    quoteContext,
    suggestedMessage: buildFollowUpSuggestedMessage({
      kind: isQuoteFollowUp ? "quote" : "inquiry",
      businessName: row.businessName,
      customerName,
      quoteUrl: quotePublicUrl,
      quoteViewedAt: row.quoteViewedAt,
    }),
  };
}

function getFollowUpSelection() {
  return {
    id: followUps.id,
    businessId: followUps.businessId,
    businessName: businesses.name,
    businessTimezone: businesses.timezone,
    businessPlan: businesses.plan,
    inquiryId: followUps.inquiryId,
    quoteId: followUps.quoteId,
    assignedToUserId: followUps.assignedToUserId,
    createdByUserId: followUps.createdByUserId,
    title: followUps.title,
    reason: followUps.reason,
    category: followUps.category,
    channel: followUps.channel,
    sendMode: followUps.sendMode,
    recurrence: followUps.recurrence,
    recurrenceCount: followUps.recurrenceCount,
    recurrenceLimit: followUps.recurrenceLimit,
    terminationCondition: followUps.terminationCondition,
    dueAt: followUps.dueAt,
    completedAt: followUps.completedAt,
    skippedAt: followUps.skippedAt,
    snoozedUntil: followUps.snoozedUntil,
    completionNote: followUps.completionNote,
    status: followUps.status,
    createdAt: followUps.createdAt,
    updatedAt: followUps.updatedAt,
    inquiryCustomerName: inquiries.customerName,
    inquiryCustomerEmail: inquiries.customerEmail,
    inquiryCustomerContactMethod: inquiries.customerContactMethod,
    inquiryCustomerContactHandle: inquiries.customerContactHandle,
    inquirySubject: inquiries.subject,
    quoteCustomerName: quotes.customerName,
    quoteCustomerEmail: quotes.customerEmail,
    quoteCustomerContactMethod: quotes.customerContactMethod,
    quoteCustomerContactHandle: quotes.customerContactHandle,
    quoteNumber: quotes.quoteNumber,
    quoteTitle: quotes.title,
    quotePublicToken: quotes.publicToken,
    quoteViewedAt: quotes.publicViewedAt,
    quoteStatus: quotes.status,
    quoteTotalInCents: quotes.totalInCents,
    quoteCurrency: quotes.currency,
    quoteSentAt: quotes.sentAt,
    quoteRespondedAt: quotes.customerRespondedAt,
    autoFollowUpEnabled: quotes.autoFollowUpEnabled,
    autoFollowUpDelayDays: quotes.autoFollowUpDelayDays,
    autoFollowUpMaxAttempts: quotes.autoFollowUpMaxAttempts,
    autoFollowUpAttempts: quotes.autoFollowUpAttempts,
    autoFollowUpLastSentAt: quotes.autoFollowUpLastSentAt,
    autoFollowUpStoppedAt: quotes.autoFollowUpStoppedAt,
  };
}

function getFollowUpBaseQuery() {
  return db
    .select(getFollowUpSelection())
    .from(followUps)
    .innerJoin(businesses, eq(followUps.businessId, businesses.id))
    .leftJoin(inquiries, eq(followUps.inquiryId, inquiries.id))
    .leftJoin(quotes, eq(followUps.quoteId, quotes.id));
}

function getFollowUpListConditions({
  businessId,
  filters,
  timezone,
}: {
  businessId: string;
  filters: FollowUpListQueryFilters;
  timezone: string;
}) {
  const { todayStart, tomorrowStart } = getBusinessDayBounds(timezone);
  const conditions = [eq(followUps.businessId, businessId), isNull(followUps.deletedAt)];

  if (filters.status !== "all") {
    conditions.push(eq(followUps.status, filters.status));
  }

  // The due buckets only make sense for open work. Applying them on top of a
  // terminal status filter would ask for `status = 'completed' AND status =
  // 'pending'` and silently return nothing.
  const appliesToPendingOnly =
    filters.due !== "all" &&
    (filters.status === "all" || filters.status === "pending");

  if (appliesToPendingOnly) {
    conditions.push(eq(followUps.status, "pending"));
  }

  if (appliesToPendingOnly && filters.due === "overdue") {
    conditions.push(lt(followUps.dueAt, todayStart));
  }

  if (appliesToPendingOnly && filters.due === "today") {
    conditions.push(gte(followUps.dueAt, todayStart));
    conditions.push(lt(followUps.dueAt, tomorrowStart));
  }

  if (appliesToPendingOnly && filters.due === "upcoming") {
    conditions.push(gte(followUps.dueAt, tomorrowStart));
  }

  if (filters.q) {
    // `q` is untrusted text: `%` and `_` are LIKE wildcards and would widen
    // the search beyond what the owner typed.
    const pattern = likePattern(filters.q);

    conditions.push(
      or(
        ilike(followUps.title, pattern),
        ilike(followUps.reason, pattern),
        ilike(inquiries.customerName, pattern),
        ilike(inquiries.customerEmail, pattern),
        ilike(inquiries.subject, pattern),
        ilike(inquiries.details, pattern),
        ilike(quotes.customerName, pattern),
        ilike(quotes.customerEmail, pattern),
        ilike(quotes.quoteNumber, pattern),
        ilike(quotes.title, pattern),
      )!,
    );
  }

  return conditions;
}

function getFollowUpOrderBy(sort: FollowUpListQueryFilters["sort"]) {
  const pendingFirst = sql`case when ${followUps.status} = 'pending' then 0 else 1 end`;

  switch (sort) {
    case "due_desc":
      return [pendingFirst, desc(followUps.dueAt), desc(followUps.createdAt)];
    case "newest":
      return [desc(followUps.createdAt)];
    case "due_asc":
    default:
      return [pendingFirst, asc(followUps.dueAt), desc(followUps.createdAt)];
  }
}

export async function getFollowUpsForInquiry({
  businessId,
  inquiryId,
}: {
  businessId: string;
  inquiryId: string;
}): Promise<FollowUpView[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(
    ...getBusinessFollowUpListCacheTags(businessId),
    ...getBusinessInquiryDetailCacheTags(businessId, inquiryId),
  );

  const rows = await getFollowUpBaseQuery()
    .where(
      and(eq(followUps.businessId, businessId), eq(followUps.inquiryId, inquiryId), isNull(followUps.deletedAt)),
    )
    .orderBy(
      sql`case when ${followUps.status} = 'pending' then 0 else 1 end`,
      asc(followUps.dueAt),
      desc(followUps.createdAt),
    );

  return rows.map(mapFollowUpRow);
}

export async function getFollowUpsForQuote({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}): Promise<FollowUpView[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(
    ...getBusinessFollowUpListCacheTags(businessId),
    ...getBusinessQuoteDetailCacheTags(businessId, quoteId),
  );

  const rows = await getFollowUpBaseQuery()
    .where(
      and(eq(followUps.businessId, businessId), eq(followUps.quoteId, quoteId), isNull(followUps.deletedAt)),
    )
    .orderBy(
      sql`case when ${followUps.status} = 'pending' then 0 else 1 end`,
      asc(followUps.dueAt),
      desc(followUps.createdAt),
    );

  return rows.map(mapFollowUpRow);
}

async function _getFollowUpOverviewForBusiness(
  businessId: string,
  timezone: string,
): Promise<FollowUpOverviewData> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessFollowUpListCacheTags(businessId));

  return withCircuitBreaker(
    `dashboard:follow-ups-overview:${businessId}`,
    () => queryFollowUpOverviewForBusiness(businessId, timezone),
  );
}

/**
 * Two-layer read (AGENTS.md "Performance & Caching"): the inner `"use cache"`
 * function handles cross-request reuse and tag invalidation, while this outer
 * `React.cache()` dedupes within a single request. The dashboard home page
 * reads this overview from two separate Suspense regions, which without the
 * outer layer resolve the cache entry twice per render.
 */
export const getFollowUpOverviewForBusiness = cache(
  _getFollowUpOverviewForBusiness,
);

async function queryFollowUpOverviewForBusiness(
  businessId: string,
  timezone: string,
): Promise<FollowUpOverviewData> {
  const { todayStart, tomorrowStart } = getBusinessDayBounds(timezone);
  const totalCount = sql<number>`count(*) over ()`;

  const [overdueRows, todayRows, upcomingRows] = await Promise.all([
    db
      .select({
        ...getFollowUpSelection(),
        totalCount,
      })
      .from(followUps)
      .innerJoin(businesses, eq(followUps.businessId, businesses.id))
      .leftJoin(inquiries, eq(followUps.inquiryId, inquiries.id))
      .leftJoin(quotes, eq(followUps.quoteId, quotes.id))
      .where(
        and(
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
          isNull(followUps.deletedAt),
          lt(followUps.dueAt, todayStart),
        ),
      )
      .orderBy(asc(followUps.dueAt), desc(followUps.createdAt))
      .limit(followUpOverviewLimit),
    db
      .select({
        ...getFollowUpSelection(),
        totalCount,
      })
      .from(followUps)
      .innerJoin(businesses, eq(followUps.businessId, businesses.id))
      .leftJoin(inquiries, eq(followUps.inquiryId, inquiries.id))
      .leftJoin(quotes, eq(followUps.quoteId, quotes.id))
      .where(
        and(
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
          isNull(followUps.deletedAt),
          gte(followUps.dueAt, todayStart),
          lt(followUps.dueAt, tomorrowStart),
        ),
      )
      .orderBy(asc(followUps.dueAt), desc(followUps.createdAt))
      .limit(followUpOverviewLimit),
    db
      .select({
        ...getFollowUpSelection(),
        totalCount,
      })
      .from(followUps)
      .innerJoin(businesses, eq(followUps.businessId, businesses.id))
      .leftJoin(inquiries, eq(followUps.inquiryId, inquiries.id))
      .leftJoin(quotes, eq(followUps.quoteId, quotes.id))
      .where(
        and(
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
          isNull(followUps.deletedAt),
          gte(followUps.dueAt, tomorrowStart),
        ),
      )
      .orderBy(asc(followUps.dueAt), desc(followUps.createdAt))
      .limit(followUpOverviewLimit),
  ]);

  return {
    overdue: overdueRows.map(mapFollowUpRow),
    dueToday: todayRows.map(mapFollowUpRow),
    upcoming: upcomingRows.map(mapFollowUpRow),
    counts: {
      overdue: Number(overdueRows[0]?.totalCount ?? 0),
      dueToday: Number(todayRows[0]?.totalCount ?? 0),
      upcoming: Number(upcomingRows[0]?.totalCount ?? 0),
    },
  };
}

export async function getFollowUpListCountForBusiness({
  businessId,
  filters,
  timezone,
}: {
  businessId: string;
  filters: FollowUpListQueryFilters;
  timezone: string;
}): Promise<number> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessFollowUpListCacheTags(businessId));

  const conditions = getFollowUpListConditions({ businessId, filters, timezone });
  const rows = await db
    .select({ count: count() })
    .from(followUps)
    .leftJoin(inquiries, eq(followUps.inquiryId, inquiries.id))
    .leftJoin(quotes, eq(followUps.quoteId, quotes.id))
    .where(and(...conditions));

  return Number(rows[0]?.count ?? 0);
}

export async function getFollowUpListPageForBusiness({
  businessId,
  filters,
  page,
  pageSize,
  timezone,
}: {
  businessId: string;
  filters: FollowUpListQueryFilters;
  page: number;
  pageSize: number;
  timezone: string;
}): Promise<FollowUpView[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessFollowUpListCacheTags(businessId));

  const conditions = getFollowUpListConditions({ businessId, filters, timezone });
  const offset = Math.max(0, (page - 1) * pageSize);

  const rows = await getFollowUpBaseQuery()
    .where(and(...conditions))
    .orderBy(...getFollowUpOrderBy(filters.sort))
    .limit(pageSize)
    .offset(offset);

  return rows.map(mapFollowUpRow);
}

/**
 * Dismissed + completed follow-ups for the History dialog, newest first.
 * Kept lean (limit 50) — the full filterable list route remains for deep links.
 */
export async function getFollowUpHistoryForBusiness({
  businessId,
  limit = 50,
}: {
  businessId: string;
  limit?: number;
}): Promise<FollowUpView[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessFollowUpListCacheTags(businessId));

  const rows = await getFollowUpBaseQuery()
    .where(
      and(
        eq(followUps.businessId, businessId),
        isNull(followUps.deletedAt),
        or(eq(followUps.status, "completed"), eq(followUps.status, "skipped"))!,
      ),
    )
    .orderBy(desc(followUps.updatedAt))
    .limit(limit);

  return rows.map(mapFollowUpRow);
}

/**
 * Context for the AI message generator.
 *
 * Everything the model sees is loaded from the tenant's own records — the
 * client only names the follow-up, never the customer, the business or the
 * quote link.
 */
export async function getFollowUpAiContextForBusiness({
  businessId,
  followUpId,
}: {
  businessId: string;
  followUpId: string;
}): Promise<{
  title: string;
  reason: string;
  channel: string;
  customerName: string;
  recordKind: "inquiry" | "quote";
  quoteUrl: string | null;
  quoteViewed: boolean;
} | null> {
  const [row] = await db
    .select({
      title: followUps.title,
      reason: followUps.reason,
      channel: followUps.channel,
      inquiryId: followUps.inquiryId,
      quoteId: followUps.quoteId,
      inquiryCustomerName: inquiries.customerName,
      quoteCustomerName: quotes.customerName,
      quotePublicToken: quotes.publicToken,
      quoteViewedAt: quotes.publicViewedAt,
    })
    .from(followUps)
    .innerJoin(businesses, eq(followUps.businessId, businesses.id))
    .leftJoin(inquiries, eq(followUps.inquiryId, inquiries.id))
    .leftJoin(quotes, eq(followUps.quoteId, quotes.id))
    .where(
      and(
        eq(followUps.id, followUpId),
        eq(followUps.businessId, businessId),
        isNull(followUps.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  return {
    title: row.title,
    reason: row.reason,
    channel: row.channel,
    customerName: row.quoteCustomerName ?? row.inquiryCustomerName ?? "the customer",
    recordKind: row.quoteId ? "quote" : "inquiry",
    quoteUrl: getQuotePublicUrl(row.quotePublicToken),
    quoteViewed: Boolean(row.quoteViewedAt),
  };
}

/**
 * Active automatic email sequences for a business, composed from
 * quotes.autoFollowUp* columns (no follow_ups row). Phase one of the unified
 * read model: callers combine this with manual follow_ups rows instead of a
 * risky immediate migration.
 */
export async function getActiveAutoFollowUpSequencesForBusiness(
  businessId: string,
): Promise<Extract<FollowUpActivityItem, { kind: "auto_sequence" }>[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessFollowUpListCacheTags(businessId));

  const rows = await db
    .select({
      quoteId: quotes.id,
      quoteNumber: quotes.quoteNumber,
      quoteTitle: quotes.title,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
      status: quotes.status,
      totalInCents: quotes.totalInCents,
      currency: quotes.currency,
      sentAt: quotes.sentAt,
      viewedAt: quotes.publicViewedAt,
      respondedAt: quotes.customerRespondedAt,
      enabled: quotes.autoFollowUpEnabled,
      delayDays: quotes.autoFollowUpDelayDays,
      maxAttempts: quotes.autoFollowUpMaxAttempts,
      attempts: quotes.autoFollowUpAttempts,
      lastSentAt: quotes.autoFollowUpLastSentAt,
      stoppedAt: quotes.autoFollowUpStoppedAt,
      businessTimezone: businesses.timezone,
    })
    .from(quotes)
    .innerJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(
      and(
        eq(quotes.businessId, businessId),
        eq(quotes.autoFollowUpEnabled, true),
        isNull(quotes.deletedAt),
        isNull(quotes.autoFollowUpStoppedAt),
        eq(quotes.status, "sent"),
      ),
    )
    .orderBy(asc(quotes.sentAt))
    .limit(50);

  return rows.map((row) => {
    const attempts = row.attempts ?? 0;
    const maxAttempts = row.maxAttempts ?? 0;
    const isComplete = attempts >= maxAttempts;
    const base = row.lastSentAt ?? row.sentAt;
    const nextSendAt =
      !isComplete && base && row.delayDays
        ? new Date(base.getTime() + row.delayDays * 24 * 60 * 60 * 1000)
        : null;

    return {
      kind: "auto_sequence" as const,
      quoteId: row.quoteId,
      quoteNumber: row.quoteNumber,
      quoteTitle: row.quoteTitle,
      customerName: row.customerName,
      customerEmail: row.customerEmail,
      businessTimezone: row.businessTimezone,
      sequence: {
        enabled: true,
        isActive: !isComplete,
        isPaused: false,
        isComplete,
        attempts,
        maxAttempts,
        delayDays: row.delayDays ?? 0,
        lastSentAt: row.lastSentAt,
        nextSendAt,
        stoppedAt: row.stoppedAt,
      },
      quoteContext: {
        status: row.status,
        totalInCents: row.totalInCents,
        currency: row.currency,
        sentAt: row.sentAt,
        viewedAt: row.viewedAt,
        respondedAt: row.respondedAt,
      },
    };
  });
}

/**
 * Compact outcome-oriented counts for the summary strip: attention now,
 * due today, waiting (upcoming + active sequences), and history depth.
 */
export async function getFollowUpSummaryCountsForBusiness(
  businessId: string,
  overview: FollowUpOverviewData,
): Promise<FollowUpSummaryCounts> {
  const [historyRows, sequences] = await Promise.all([
    db
      .select({ count: count() })
      .from(followUps)
      .where(
        and(
          eq(followUps.businessId, businessId),
          isNull(followUps.deletedAt),
          or(eq(followUps.status, "completed"), eq(followUps.status, "skipped"))!,
        ),
      ),
    getActiveAutoFollowUpSequencesForBusiness(businessId),
  ]);

  return {
    needsAttention: overview.counts.overdue,
    dueToday: overview.counts.dueToday,
    waiting: overview.counts.upcoming + sequences.filter((s) => s.sequence.isActive).length,
    activeSequences: sequences.filter((s) => s.sequence.isActive).length,
    history: Number(historyRows[0]?.count ?? 0),
  };
}


/**
 * Returns recent inquiries and quotes for the quick-create follow-up picker.
 * Limited to 20 most recent open records.
 */
export async function getRecentRecordsForFollowUpCreate(
  businessId: string,
): Promise<{ kind: "inquiry" | "quote"; id: string; label: string }[]> {
  const [recentInquiries, recentQuotes] = await Promise.all([
    db
      .select({
        id: inquiries.id,
        customerName: inquiries.customerName,
        subject: inquiries.subject,
        createdAt: inquiries.createdAt,
      })
      .from(inquiries)
      .where(eq(inquiries.businessId, businessId))
      .orderBy(desc(inquiries.createdAt))
      .limit(10),
    db
      .select({
        id: quotes.id,
        customerName: quotes.customerName,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        createdAt: quotes.createdAt,
      })
      .from(quotes)
      .where(and(eq(quotes.businessId, businessId), isNull(quotes.deletedAt)))
      .orderBy(desc(quotes.createdAt))
      .limit(10),
  ]);

  const results: { kind: "inquiry" | "quote"; id: string; label: string; createdAt: Date }[] = [];

  for (const inquiry of recentInquiries) {
    const label = inquiry.customerName
      ? `Inquiry: ${inquiry.customerName}${inquiry.subject ? ` — ${inquiry.subject}` : ""}`
      : `Inquiry${inquiry.subject ? `: ${inquiry.subject}` : ""}`;
    results.push({ kind: "inquiry", id: inquiry.id, label, createdAt: inquiry.createdAt });
  }

  for (const quote of recentQuotes) {
    const label = quote.quoteNumber
      ? `Quote ${quote.quoteNumber}${quote.customerName ? ` — ${quote.customerName}` : ""}`
      : quote.title
        ? `Quote: ${quote.title}`
        : `Quote${quote.customerName ? `: ${quote.customerName}` : ""}`;
    results.push({ kind: "quote", id: quote.id, label, createdAt: quote.createdAt });
  }

  return results
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 20)
    .map(({ kind, id, label }) => ({ kind, id, label }));
}


/**
 * Returns business members (userId, name, email) for the reassign picker.
 */
export async function getBusinessMembersForReassign(
  businessId: string,
): Promise<{ userId: string; name: string; email: string }[]> {
  const { businessMembers, user } = await import("@/lib/db/schema");

  const rows = await db
    .select({
      userId: businessMembers.userId,
      name: user.name,
      email: user.email,
    })
    .from(businessMembers)
    .innerJoin(user, eq(businessMembers.userId, user.id))
    .where(eq(businessMembers.businessId, businessId))
    .orderBy(asc(user.name));

  return rows.map((row) => ({
    userId: row.userId,
    name: row.name,
    email: row.email,
  }));
}
