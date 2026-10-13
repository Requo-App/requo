import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  gt,
  isNotNull,
  isNull,
  lt,
  lte,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { cache } from "react";

import type {
  BusinessDashboardSummaryData,
  BusinessMoneySnapshot,
  BusinessOverviewData,
  PublicBusinessProfile,
  PublicBusinessSitemapEntry,
} from "@/features/businesses/types";
import {
  getEffectiveInquiryStatus,
  getOperationalInquiryCondition,
} from "@/features/inquiries/queries";
import {
  getEffectiveQuoteStatus,
  getNonDeletedQuoteCondition,
  getOperationalQuoteCondition,
} from "@/features/quotes/queries";
import { getQuoteReminderKinds } from "@/features/quotes/utils";
import {
  getBusinessAnalyticsCacheTags,
  getBusinessOverviewCacheTags,
  getPublicBusinessProfileCacheTags,
  hotBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { withCircuitBreaker } from "@/lib/db/circuit-breaker";
import { db } from "@/lib/db/client";
import { businesses, inquiries, quotes } from "@/lib/db/schema";

const overviewQueueItemLimit = 4;

function createEmptyBusinessOverviewData(): BusinessOverviewData {
  return {
    overdueInquiries: [],
    expiringSoonQuotes: [],
    newInquiries: [],
    recentAcceptedQuotes: [],
    declinedQuotes: [],
    draftQuotes: [],
    awaitingResponseQuotes: [],
    counts: {
      overdueInquiries: 0,
      expiringSoonQuotes: 0,
      newInquiries: 0,
      recentAcceptedQuotes: 0,
      declinedQuotes: 0,
      draftQuotes: 0,
      awaitingResponseQuotes: 0,
    },
  };
}

function createEmptyBusinessDashboardSummaryData(): BusinessDashboardSummaryData {
  return {
    totalInquiries: 0,
    totalQuotes: 0,
    inquiriesThisWeek: 0,
    inquiryCoverageRate: 0,
    wonCount: 0,
    lostCount: 0,
  };
}

function getFutureUtcDateString(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

async function _getBusinessOverviewData(
  businessId: string,
): Promise<BusinessOverviewData> {
  try {
    return await withCircuitBreaker(
      `dashboard:overview:${businessId}`,
      () => getCachedBusinessOverviewData(businessId),
    );
  } catch (error) {
    console.error(
      "Failed to load business overview data.",
      { businessId },
      error,
    );

    return createEmptyBusinessOverviewData();
  }
}

/**
 * Two-layer read (AGENTS.md "Performance & Caching"): the inner `"use cache"`
 * function handles cross-request reuse and tag invalidation, while this outer
 * `React.cache()` dedupes within a single request so the several dashboard
 * home regions needing overview data share one call instead of repeating it.
 */
export const getBusinessOverviewData = cache(_getBusinessOverviewData);

async function getCachedBusinessOverviewData(
  businessId: string,
): Promise<BusinessOverviewData> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessOverviewCacheTags(businessId));

  const today = new Date().toISOString().slice(0, 10);
  const expiringSoonCutoff = getFutureUtcDateString(7);
  const isOverdueInquiry = sql`${getEffectiveInquiryStatus} = 'overdue'`;
  const isNewInquiry = sql`${getEffectiveInquiryStatus} = 'new'`;
  const totalCount = sql<number>`count(*) over ()`;

  const [
    overdueInquiries,
    expiringSoonQuotes,
    newInquiries,
    recentAcceptedQuotes,
    declinedQuotes,
    draftQuotes,
    awaitingResponseQuotes,
  ] = await Promise.all([
    db
      .select({
        id: inquiries.id,
        customerName: inquiries.customerName,
        customerEmail: inquiries.customerEmail,
        customerContactMethod: inquiries.customerContactMethod,
        customerContactHandle: inquiries.customerContactHandle,
        subject: inquiries.subject,
        status: getEffectiveInquiryStatus,
        submittedAt: inquiries.submittedAt,
        totalCount,
      })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.businessId, businessId),
          getOperationalInquiryCondition(),
          isOverdueInquiry,
        ),
      )
      .orderBy(
        asc(inquiries.requestedDeadline),
        asc(inquiries.submittedAt),
        asc(inquiries.createdAt),
      )
      .limit(overviewQueueItemLimit),
    db
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        customerContactMethod: quotes.customerContactMethod,
        customerContactHandle: quotes.customerContactHandle,
        currency: quotes.currency,
        totalInCents: quotes.totalInCents,
        status: getEffectiveQuoteStatus,
        validUntil: quotes.validUntil,
        sentAt: quotes.sentAt,
        acceptedAt: quotes.acceptedAt,
        customerRespondedAt: quotes.customerRespondedAt,
        updatedAt: quotes.updatedAt,
        totalCount,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          sql`${getEffectiveQuoteStatus} = 'sent'::quote_status`,
          isNull(quotes.customerRespondedAt),
          gte(quotes.validUntil, today),
          lte(quotes.validUntil, expiringSoonCutoff),
        ),
      )
      .orderBy(asc(quotes.validUntil), desc(quotes.sentAt), desc(quotes.createdAt))
      .limit(overviewQueueItemLimit),
    db
      .select({
        id: inquiries.id,
        customerName: inquiries.customerName,
        customerEmail: inquiries.customerEmail,
        customerContactMethod: inquiries.customerContactMethod,
        customerContactHandle: inquiries.customerContactHandle,
        subject: inquiries.subject,
        status: getEffectiveInquiryStatus,
        submittedAt: inquiries.submittedAt,
        totalCount,
      })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.businessId, businessId),
          getOperationalInquiryCondition(),
          isNewInquiry,
        ),
      )
      .orderBy(asc(inquiries.submittedAt), asc(inquiries.createdAt))
      .limit(overviewQueueItemLimit),
    db
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        customerContactMethod: quotes.customerContactMethod,
        customerContactHandle: quotes.customerContactHandle,
        currency: quotes.currency,
        totalInCents: quotes.totalInCents,
        status: getEffectiveQuoteStatus,
        validUntil: quotes.validUntil,
        sentAt: quotes.sentAt,
        acceptedAt: quotes.acceptedAt,
        customerRespondedAt: quotes.customerRespondedAt,
        updatedAt: quotes.updatedAt,
        totalCount,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          eq(quotes.status, "accepted"),
          isNotNull(quotes.acceptedAt),
        ),
      )
      .orderBy(desc(quotes.acceptedAt), desc(quotes.createdAt))
      .limit(overviewQueueItemLimit),
    db
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        customerContactMethod: quotes.customerContactMethod,
        customerContactHandle: quotes.customerContactHandle,
        currency: quotes.currency,
        totalInCents: quotes.totalInCents,
        status: getEffectiveQuoteStatus,
        validUntil: quotes.validUntil,
        sentAt: quotes.sentAt,
        acceptedAt: quotes.acceptedAt,
        customerRespondedAt: quotes.customerRespondedAt,
        updatedAt: quotes.updatedAt,
        totalCount,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          eq(quotes.status, "rejected"),
          isNotNull(quotes.customerRespondedAt),
        ),
      )
      .orderBy(desc(quotes.customerRespondedAt), desc(quotes.createdAt))
      .limit(overviewQueueItemLimit),
    db
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        customerContactMethod: quotes.customerContactMethod,
        customerContactHandle: quotes.customerContactHandle,
        currency: quotes.currency,
        totalInCents: quotes.totalInCents,
        status: getEffectiveQuoteStatus,
        validUntil: quotes.validUntil,
        sentAt: quotes.sentAt,
        acceptedAt: quotes.acceptedAt,
        customerRespondedAt: quotes.customerRespondedAt,
        updatedAt: quotes.updatedAt,
        totalCount,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          eq(getEffectiveQuoteStatus, "draft")
        ),
      )
      .orderBy(desc(quotes.updatedAt), desc(quotes.createdAt))
      .limit(overviewQueueItemLimit),
    db
      .select({
        id: quotes.id,
        inquiryId: quotes.inquiryId,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        customerContactMethod: quotes.customerContactMethod,
        customerContactHandle: quotes.customerContactHandle,
        currency: quotes.currency,
        totalInCents: quotes.totalInCents,
        status: getEffectiveQuoteStatus,
        validUntil: quotes.validUntil,
        sentAt: quotes.sentAt,
        acceptedAt: quotes.acceptedAt,
        customerRespondedAt: quotes.customerRespondedAt,
        updatedAt: quotes.updatedAt,
        totalCount,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          sql`${getEffectiveQuoteStatus} = 'sent'::quote_status`,
          isNull(quotes.customerRespondedAt),
          gt(quotes.validUntil, expiringSoonCutoff),
        ),
      )
      .orderBy(asc(quotes.sentAt), asc(quotes.createdAt))
      .limit(overviewQueueItemLimit),
  ]);

  function withQuoteReminders<
    T extends {
      status: (typeof expiringSoonQuotes)[number]["status"];
      sentAt: Date | null;
      customerRespondedAt: Date | null;
      validUntil: string;
      totalCount: number;
    },
  >(quote: T) {
    const { totalCount, ...row } = quote;

    void totalCount;

    return {
      ...row,
      reminders: getQuoteReminderKinds({
        status: row.status,
        sentAt: row.sentAt,
        customerRespondedAt: row.customerRespondedAt,
        validUntil: row.validUntil,
      }),
    };
  }

  function stripTotalCount<T extends { totalCount: number }>(row: T) {
    const { totalCount, ...rest } = row;

    void totalCount;

    return rest;
  }

  return {
    overdueInquiries: overdueInquiries.map(stripTotalCount),
    expiringSoonQuotes: expiringSoonQuotes.map(withQuoteReminders),
    newInquiries: newInquiries.map(stripTotalCount),
    recentAcceptedQuotes: recentAcceptedQuotes.map(withQuoteReminders),
    declinedQuotes: declinedQuotes.map(withQuoteReminders),
    draftQuotes: draftQuotes.map(withQuoteReminders),
    awaitingResponseQuotes: awaitingResponseQuotes.map(withQuoteReminders),
    counts: {
      overdueInquiries: Number(overdueInquiries[0]?.totalCount ?? 0),
      expiringSoonQuotes: Number(expiringSoonQuotes[0]?.totalCount ?? 0),
      newInquiries: Number(newInquiries[0]?.totalCount ?? 0),
      recentAcceptedQuotes: Number(recentAcceptedQuotes[0]?.totalCount ?? 0),
      declinedQuotes: Number(declinedQuotes[0]?.totalCount ?? 0),
      draftQuotes: Number(draftQuotes[0]?.totalCount ?? 0),
      awaitingResponseQuotes: Number(awaitingResponseQuotes[0]?.totalCount ?? 0),
    },
  };
}

async function _getBusinessDashboardSummaryData(
  businessId: string,
): Promise<BusinessDashboardSummaryData> {
  try {
    return await withCircuitBreaker(
      `dashboard:summary:${businessId}`,
      () => getCachedBusinessDashboardSummaryData(businessId),
    );
  } catch (error) {
    console.error(
      "Failed to load business dashboard summary data.",
      { businessId },
      error,
    );

    return createEmptyBusinessDashboardSummaryData();
  }
}

/**
 * Two-layer read (AGENTS.md "Performance & Caching"): the inner `"use cache"`
 * function handles cross-request reuse and tag invalidation, while this outer
 * `React.cache()` dedupes within a single request so the KPI and
 * needs-attention regions share one call instead of repeating it.
 */
export const getBusinessDashboardSummaryData = cache(
  _getBusinessDashboardSummaryData,
);

async function getCachedBusinessDashboardSummaryData(
  businessId: string,
): Promise<BusinessDashboardSummaryData> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessAnalyticsCacheTags(businessId));

  const thisWeekStart = new Date();

  thisWeekStart.setUTCDate(thisWeekStart.getUTCDate() - 6);
  thisWeekStart.setUTCHours(0, 0, 0, 0);
  const thisWeekStartIso = thisWeekStart.toISOString();

  const [inquirySummaryRows, quoteSummaryRows] = await Promise.all([
    db
      .select({
        totalInquiries: sql<number>`count(*)`.as("total_inquiries"),
        inquiriesThisWeek: sql<number>`count(*) filter (where ${inquiries.submittedAt} >= ${thisWeekStartIso}::timestamptz)`.as(
          "inquiries_this_week",
        ),
        wonCount:
          sql<number>`count(*) filter (where ${inquiries.status} = 'won')`.as(
            "won_count",
          ),
        lostCount:
          sql<number>`count(*) filter (where ${inquiries.status} = 'lost')`.as(
            "lost_count",
          ),
      })
      .from(inquiries)
      .where(and(eq(inquiries.businessId, businessId), )),
    db
      .select({
        totalQuotes: sql<number>`count(*)`.as("total_quotes"),
        linkedInquiryCount: sql<number>`count(distinct ${quotes.inquiryId}) filter (where ${quotes.inquiryId} is not null)`.as(
          "linked_inquiry_count",
        ),
      })
      .from(quotes)
      .where(and(eq(quotes.businessId, businessId), getNonDeletedQuoteCondition())),
  ]);

  const totalInquiries = Number(inquirySummaryRows[0]?.totalInquiries ?? 0);
  const totalQuotes = Number(quoteSummaryRows[0]?.totalQuotes ?? 0);
  const linkedInquiryCount = Number(quoteSummaryRows[0]?.linkedInquiryCount ?? 0);

  return {
    totalInquiries,
    totalQuotes,
    inquiriesThisWeek: Number(inquirySummaryRows[0]?.inquiriesThisWeek ?? 0),
    inquiryCoverageRate: totalInquiries ? linkedInquiryCount / totalInquiries : 0,
    wonCount: Number(inquirySummaryRows[0]?.wonCount ?? 0),
    lostCount: Number(inquirySummaryRows[0]?.lostCount ?? 0),
  };
}

function createEmptyBusinessMoneySnapshot(): BusinessMoneySnapshot {
  return {
    currency: "USD",
    wonInCents: 0,
    wonCount: 0,
    inPlayInCents: 0,
    inPlayCount: 0,
    wonInCentsPrior: 0,
    wonCountPrior: 0,
  };
}

/**
 * Lightweight money snapshot for the dashboard KPI row. Available to all
 * plans — deliberately NOT gated behind the analytics entitlement. Both
 * figures are quote-derived sums in the business's default currency.
 */
async function _getBusinessMoneySnapshot(
  businessId: string,
): Promise<BusinessMoneySnapshot> {
  try {
    return await withCircuitBreaker(
      `dashboard:money:${businessId}`,
      () => getCachedBusinessMoneySnapshot(businessId),
    );
  } catch (error) {
    console.error(
      "Failed to load business money snapshot.",
      { businessId },
      error,
    );

    return createEmptyBusinessMoneySnapshot();
  }
}

/**
 * Two-layer read (AGENTS.md "Performance & Caching"): the inner `"use cache"`
 * function handles cross-request reuse and tag invalidation, while this outer
 * `React.cache()` dedupes within a single request so the KPI row and any
 * other region reading money figures share one call instead of repeating it.
 */
export const getBusinessMoneySnapshot = cache(_getBusinessMoneySnapshot);

async function getCachedBusinessMoneySnapshot(
  businessId: string,
): Promise<BusinessMoneySnapshot> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessOverviewCacheTags(businessId));

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
  const today = new Date().toISOString().slice(0, 10);

  const [currencyRow, wonRows, priorRows, inPlayRows] = await Promise.all([
    db
      .select({ defaultCurrency: businesses.defaultCurrency })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        totalInCents: sql<number>`coalesce(sum(${quotes.totalInCents}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          eq(quotes.status, "accepted"),
          gte(quotes.acceptedAt, thirtyDaysAgo),
        ),
      ),
    // Prior-window wins: the same accepted predicate, windowed 30–60 days
    // ago, so the home stat card can show a real period-over-period delta.
    db
      .select({
        totalInCents: sql<number>`coalesce(sum(${quotes.totalInCents}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          eq(quotes.status, "accepted"),
          gte(quotes.acceptedAt, sixtyDaysAgo),
          lt(quotes.acceptedAt, thirtyDaysAgo),
        ),
      ),
    db
      .select({
        totalInCents: sql<number>`coalesce(sum(${quotes.totalInCents}), 0)`,
        count: sql<number>`count(*)`,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          getOperationalQuoteCondition(),
          sql`${getEffectiveQuoteStatus} = 'sent'::quote_status`,
          isNull(quotes.customerRespondedAt),
          gte(quotes.validUntil, today),
        ),
      ),
  ]);

  return {
    currency: currencyRow[0]?.defaultCurrency ?? "USD",
    wonInCents: Number(wonRows[0]?.totalInCents ?? 0),
    wonCount: Number(wonRows[0]?.count ?? 0),
    inPlayInCents: Number(inPlayRows[0]?.totalInCents ?? 0),
    inPlayCount: Number(inPlayRows[0]?.count ?? 0),
    wonInCentsPrior: Number(priorRows[0]?.totalInCents ?? 0),
    wonCountPrior: Number(priorRows[0]?.count ?? 0),
  };
}

/**
 * Inner cached lookup for the public `/businesses/[slug]` page and its
 * `generateMetadata`. Tagged with slug-scoped tags so mutations that change
 * public profile data (see task 8.2) can call
 * `revalidateTag(...getPublicBusinessProfileCacheTags(slug))` regardless of
 * whether the caller currently holds the business id.
 *
 * Must not call `cookies()` or `headers()` — `"use cache"` bodies have to be
 * request-agnostic. The outer `React.cache()` wrapper below gives us
 * per-request deduplication so the page and `generateMetadata` share a
 * single DB round-trip.
 */
async function _getPublicBusinessProfileBySlugCached(
  slug: string,
): Promise<PublicBusinessProfile | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getPublicBusinessProfileCacheTags(slug));

  const [row] = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
      name: businesses.name,
      shortDescription: businesses.shortDescription,
      logoStoragePath: businesses.logoStoragePath,
      updatedAt: businesses.updatedAt,
      archivedAt: businesses.archivedAt,
      lockedAt: businesses.lockedAt,
      deletedAt: businesses.deletedAt,
    })
    .from(businesses)
    .where(
      and(eq(businesses.slug, slug), isNull(businesses.deletedAt)),
    )
    .limit(1);

  if (!row) {
    return null;
  }

  const isPublic = row.archivedAt === null && row.lockedAt === null;
  const logoUrl = row.logoStoragePath
    ? `/api/public/businesses/${row.slug}/logo?v=${row.updatedAt.getTime()}`
    : null;

  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.shortDescription,
    shortDescription: row.shortDescription,
    logoUrl,
    updatedAt: row.updatedAt,
    isPublic,
    // `address`, `telephone`, and `areaServed` are intentionally left
    // undefined — the schema has no columns for them today.
  } satisfies PublicBusinessProfile;
}

/**
 * Two-layer cached lookup for the public business profile consumed by
 * `/businesses/[slug]`:
 *
 * - inner `"use cache"` function tagged via
 *   `getPublicBusinessProfileCacheTags(slug)` for cross-request caching,
 * - outer `React.cache()` wrapper for within-request deduplication so the
 *   page component and `generateMetadata` share one DB round-trip.
 */
export const getPublicBusinessProfileBySlug = cache(
  async (slug: string): Promise<PublicBusinessProfile | null> => {
    return _getPublicBusinessProfileBySlugCached(slug);
  },
);

/**
 * Indexable public business URLs for `sitemap.xml`. Mirrors the
 * public-visibility predicate used by `getPublicBusinessProfileBySlug`
 * (archived/locked/deleted all null). Rows whose `noIndex` is `true`
 * are returned so callers can log or observe filtering, but the sitemap
 * generator must drop them before emitting entries.
 *
 * On a DB failure we log at `error` level and return `[]` so a transient
 * database issue cannot take down the sitemap route.
 */
export async function listPublicBusinessSitemapEntries(): Promise<
  PublicBusinessSitemapEntry[]
> {
  try {
    const rows = await db
      .select({
        slug: businesses.slug,
        updatedAt: businesses.updatedAt,
        archivedAt: businesses.archivedAt,
        lockedAt: businesses.lockedAt,
        deletedAt: businesses.deletedAt,
      })
      .from(businesses)
      .where(isNull(businesses.deletedAt));

    return rows.map((row) => ({
      slug: row.slug,
      pathname: `/b/${row.slug}/inquire`,
      lastModified: row.updatedAt,
      noIndex:
        row.archivedAt !== null
        || row.lockedAt !== null
        || row.deletedAt !== null,
    }));
  } catch (error) {
    console.error("Failed to load public business sitemap entries.", error);

    return [];
  }
}
