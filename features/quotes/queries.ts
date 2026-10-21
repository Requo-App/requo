import "server-only";

import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { after, connection } from "next/server";
import { cache } from "react";

import { db } from "@/lib/db/client";
import {
  activityLogs,
  followUps,
  inquiries,
  quoteAcceptances,
  quoteItems,
  quotes,
  user,
  businesses,
  } from "@/lib/db/schema";
import {
  syncExpiredQuoteForPublicToken,
  syncExpiredQuotesForBusiness,
} from "@/features/quotes/mutations";
import {
  getEffectiveInquiryStatus,
  getInquiryRecordState,
} from "@/features/inquiries/queries";
import {
  getBusinessInquiryDetailCacheTags,
  getBusinessQuoteDetailCacheTags,
  getBusinessQuoteListCacheTags,
  hotBusinessCacheLife,
} from "@/lib/cache/business-tags";
import { withCircuitBreaker } from "@/lib/db/circuit-breaker";
import { likePattern } from "@/lib/sql-patterns";
import type {
  DashboardQuoteActivity,
  DashboardQuoteDetail,
  DashboardQuoteDetailCore,
  DashboardQuoteItem,
  DashboardQuoteListItem,
  PublicQuoteView,
  QuoteInquiryPrefill,
  QuoteListQueryFilters,
  QuoteRecordView,
  QuoteSendPayload,
  QuoteStatus,
} from "@/features/quotes/types";
import { getQuoteReminderKinds } from "@/features/quotes/utils";
import {
  getQuotePublicTokenLookupCondition,
  tryResolveStoredQuotePublicToken,
} from "@/features/quotes/token-storage";

export const getEffectiveQuoteStatus = sql<QuoteStatus>`case
  when ${quotes.status} = 'sent' and ${quotes.validUntil} < current_date then 'expired'::quote_status
  else ${quotes.status}
end`;

export const getQuoteRecordState = sql<QuoteRecordView>`case
  when ${quotes.archivedAt} is not null then 'archived'
  else 'active'
end`;

const scheduleExpiredQuotesSyncForBusiness = cache((businessId: string) => {
  after(async () => {
    try {
      await syncExpiredQuotesForBusiness(businessId);
    } catch (error) {
      console.error("Failed to reconcile expired quotes for business.", error);
    }
  });
});

const scheduleExpiredQuoteSyncForPublicToken = cache((token: string) => {
  after(async () => {
    try {
      await syncExpiredQuoteForPublicToken(token);
    } catch (error) {
      console.error("Failed to reconcile expired public quote.", error);
    }
  });
});

type GetQuoteListForBusinessInput = {
  businessId: string;
  filters: QuoteListQueryFilters;
};

export function getNonDeletedQuoteCondition() {
  return isNull(quotes.deletedAt);
}

export function getOperationalQuoteCondition() {
  return and(isNull(quotes.deletedAt), isNull(quotes.archivedAt));
}

function getQuoteViewCondition(view: QuoteRecordView) {
  switch (view) {
    case "archived":
      return and(isNull(quotes.deletedAt), isNotNull(quotes.archivedAt));
    case "active":
    default:
      return and(isNull(quotes.deletedAt), isNull(quotes.archivedAt));
  }
}

function getQuoteListConditions({
  businessId,
  filters,
}: GetQuoteListForBusinessInput) {
  const conditions = [
    eq(quotes.businessId, businessId),
    getQuoteViewCondition(filters.view),
  ];

  if (filters.status !== "all") {
    conditions.push(
      sql`${getEffectiveQuoteStatus} = ${filters.status}::quote_status`,
    );
  }

  if (filters.q) {
    const pattern = likePattern(filters.q);

    conditions.push(
      or(
        ilike(quotes.quoteNumber, pattern),
        ilike(quotes.title, pattern),
        ilike(quotes.customerName, pattern),
        ilike(quotes.customerEmail, pattern),
      )!,
    );
  }

  return conditions;
}

export async function getQuoteListCountForBusiness({
  businessId,
  filters,
}: GetQuoteListForBusinessInput): Promise<number> {
  scheduleExpiredQuotesSyncForBusiness(businessId);

  return getCachedQuoteListCountForBusiness({
    businessId,
    filters,
  });
}

async function getCachedQuoteListCountForBusiness({
  businessId,
  filters,
}: GetQuoteListForBusinessInput): Promise<number> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessQuoteListCacheTags(businessId));

  const conditions = getQuoteListConditions({
    businessId,
    filters,
  });

  const rows = await withCircuitBreaker(
    `dashboard:quotes-count:${businessId}`,
    () =>
      db
        .select({
          count: count(),
        })
        .from(quotes)
        .where(and(...conditions)),
  );

  return Number(rows[0]?.count ?? 0);
}

type GetQuoteListPageForBusinessInput = GetQuoteListForBusinessInput & {
  page: number;
  pageSize: number;
};

export async function getQuoteListPageForBusiness({
  businessId,
  filters,
  page,
  pageSize,
}: GetQuoteListPageForBusinessInput): Promise<DashboardQuoteListItem[]> {
  scheduleExpiredQuotesSyncForBusiness(businessId);
  return getCachedQuoteListPageForBusiness({
    businessId,
    filters,
    page,
    pageSize,
  });
}

async function getCachedQuoteListPageForBusiness({
  businessId,
  filters,
  page,
  pageSize,
}: GetQuoteListPageForBusinessInput): Promise<DashboardQuoteListItem[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessQuoteListCacheTags(businessId));

  const conditions = getQuoteListConditions({
    businessId,
    filters,
  });

  const createdAtSort = filters.sort === "oldest" ? asc : desc;
  const offset = Math.max(0, (page - 1) * pageSize);

  const rows = await withCircuitBreaker(
    `dashboard:quotes:${businessId}`,
    () =>
      db
        .select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
          title: quotes.title,
          customerName: quotes.customerName,
          customerEmail: quotes.customerEmail,
          customerContactMethod: quotes.customerContactMethod,
          customerContactHandle: quotes.customerContactHandle,
          totalInCents: quotes.totalInCents,
          currency: quotes.currency,
          validUntil: quotes.validUntil,
          status: getEffectiveQuoteStatus,
          archivedAt: quotes.archivedAt,
          sentAt: quotes.sentAt,
          publicViewedAt: quotes.publicViewedAt,
          customerRespondedAt: quotes.customerRespondedAt,
          pendingFollowUpCount: sql<number>`(
            select count(*)::int
            from ${followUps}
            where ${followUps.businessId} = ${quotes.businessId}
              and ${followUps.quoteId} = ${quotes.id}
              and ${followUps.status} = 'pending'
              and ${followUps.deletedAt} is null
          )`,
          nextFollowUpDueAt: sql<Date | null>`(
            select min(${followUps.dueAt})
            from ${followUps}
            where ${followUps.businessId} = ${quotes.businessId}
              and ${followUps.quoteId} = ${quotes.id}
              and ${followUps.status} = 'pending'
              and ${followUps.deletedAt} is null
          )`,
        })
        .from(quotes)
        .where(and(...conditions))
        .orderBy(createdAtSort(quotes.createdAt))
        .limit(pageSize)
        .offset(offset),
  );

  return rows.map((row) => {
    return {
      currency: row.currency,
      customerEmail: row.customerEmail,
      customerContactMethod: row.customerContactMethod,
      customerContactHandle: row.customerContactHandle,
      customerName: row.customerName,
      customerRespondedAt: row.customerRespondedAt,
      id: row.id,
      nextFollowUpDueAt: row.nextFollowUpDueAt,
      pendingFollowUpCount: row.pendingFollowUpCount,
      publicViewedAt: row.publicViewedAt,
      quoteNumber: row.quoteNumber,
      reminders: getQuoteReminderKinds({
        status: row.status,
        sentAt: row.sentAt,
        customerRespondedAt: row.customerRespondedAt,
        validUntil: row.validUntil,
      }),
      archivedAt: row.archivedAt,
      sentAt: row.sentAt,
      status: row.status,
      title: row.title,
      totalInCents: row.totalInCents,
      validUntil: row.validUntil,
    };
  });
}

type QuoteExportRow = {
  id: string;
  inquiryId: string | null;
  quoteNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  totalInCents: number;
  currency: string;
  validUntil: string;
  status: string;
  archivedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  sentAt: Date | null;
  customerRespondedAt: Date | null;
};

/**
 * Upper bound for the quote CSV export.
 *
 * The export materializes every row in memory, so the result set is capped.
 * Say so instead of silently truncating the file.
 */
export const quoteExportRowLimit = 10_000;

export async function getQuoteExportRowsForBusiness({
  businessId,
  filters,
  from,
  to,
}: GetQuoteListForBusinessInput & {
  from?: string;
  to?: string;
}): Promise<QuoteExportRow[]> {
  scheduleExpiredQuotesSyncForBusiness(businessId);

  const conditions = getQuoteListConditions({
    businessId,
    filters,
  });
  if (from) {
    conditions.push(gte(quotes.createdAt, new Date(`${from}T00:00:00.000Z`)));
  }
  if (to) {
    conditions.push(lte(quotes.createdAt, new Date(`${to}T23:59:59.999Z`)));
  }
  const createdAtSort = filters.sort === "oldest" ? asc : desc;

  return db
    .select({
      id: quotes.id,
      inquiryId: quotes.inquiryId,
      quoteNumber: quotes.quoteNumber,
      title: quotes.title,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
      customerContactMethod: quotes.customerContactMethod,
      customerContactHandle: quotes.customerContactHandle,
      totalInCents: quotes.totalInCents,
      currency: quotes.currency,
      validUntil: quotes.validUntil,
      status: getEffectiveQuoteStatus,
      archivedAt: quotes.archivedAt,
      voidedAt: quotes.voidedAt,
      createdAt: quotes.createdAt,
      sentAt: quotes.sentAt,
      customerRespondedAt: quotes.customerRespondedAt,
    })
    .from(quotes)
    .where(and(...conditions))
    .orderBy(createdAtSort(quotes.createdAt))
    .limit(quoteExportRowLimit + 1);
}

// ---------------------------------------------------------------------------
// Lightweight quote + items fetch (used by "Save as Template" action)
// ---------------------------------------------------------------------------

type QuoteWithItems = {
  id: string;
  title: string;
  notes: string | null;
  terms: string | null;
  validUntil: string;
  createdAt: Date;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }>;
};

export async function getQuoteWithItemsForBusiness({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}): Promise<QuoteWithItems | null> {
  const [quote] = await db
    .select({
      id: quotes.id,
      title: quotes.title,
      notes: quotes.notes,
      terms: quotes.terms,
      validUntil: quotes.validUntil,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.id, quoteId),
        eq(quotes.businessId, businessId),
        isNull(quotes.deletedAt),
      ),
    )
    .limit(1);

  if (!quote) {
    return null;
  }

  const items = await db
    .select({
      id: quoteItems.id,
      description: quoteItems.description,
      quantity: quoteItems.quantity,
      unitPriceInCents: quoteItems.unitPriceInCents,
    })
    .from(quoteItems)
    .where(
      and(
        eq(quoteItems.businessId, businessId),
        eq(quoteItems.quoteId, quoteId),
      ),
    )
    .orderBy(asc(quoteItems.position), asc(quoteItems.createdAt));

  return {
    id: quote.id,
    title: quote.title,
    notes: quote.notes,
    terms: quote.terms,
    validUntil: quote.validUntil,
    createdAt: quote.createdAt,
    items,
  };
}

// ---------------------------------------------------------------------------

type GetQuoteDetailForBusinessInput = {
  businessId: string;
  quoteId: string;
};

export async function getQuoteDetailForBusiness({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteDetail | null> {
  scheduleExpiredQuotesSyncForBusiness(businessId);

  return getCachedQuoteDetailForBusiness({
    businessId,
    quoteId,
  });
}

/**
 * Core slice of the quote detail: the quote row plus its linked inquiry and
 * derived reminders.
 *
 * Split out of `getQuoteDetailForBusiness` so the detail page can paint its
 * header and sidebars from one indexed lookup while line items and activity
 * stream behind their own boundaries. Shares
 * `getBusinessQuoteDetailCacheTags` with the aggregate, so every existing
 * quote mutation still invalidates it.
 */
async function getCachedQuoteDetailCore({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteDetailCore | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessQuoteDetailCacheTags(businessId, quoteId));

  const [quote] = await db
    .select({
      id: quotes.id,
      businessId: quotes.businessId,
      inquiryId: quotes.inquiryId,
      quoteNumber: quotes.quoteNumber,
      publicToken: quotes.publicToken,
      title: quotes.title,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
      customerContactMethod: quotes.customerContactMethod,
      customerContactHandle: quotes.customerContactHandle,
      currency: quotes.currency,
      notes: quotes.notes,
      terms: quotes.terms,
      subtotalInCents: quotes.subtotalInCents,
      discountInCents: quotes.discountInCents,
      taxInCents: quotes.taxInCents,
      taxLabel: quotes.taxLabel,
      totalInCents: quotes.totalInCents,
      validUntil: quotes.validUntil,
      version: quotes.version,
      status: getEffectiveQuoteStatus,
      archivedAt: quotes.archivedAt,
      voidedAt: quotes.voidedAt,
      sentAt: quotes.sentAt,
      acceptedAt: quotes.acceptedAt,
      completedAt: quotes.completedAt,
      canceledAt: quotes.canceledAt,
      cancellationReason: quotes.cancellationReason,
      cancellationNote: quotes.cancellationNote,
      publicViewedAt: quotes.publicViewedAt,
      customerRespondedAt: quotes.customerRespondedAt,
      customerResponseMessage: quotes.customerResponseMessage,
      autoFollowUpEnabled: quotes.autoFollowUpEnabled,
      autoFollowUpDelayDays: quotes.autoFollowUpDelayDays,
      autoFollowUpMaxAttempts: quotes.autoFollowUpMaxAttempts,
      autoFollowUpAttempts: quotes.autoFollowUpAttempts,
      autoFollowUpLastSentAt: quotes.autoFollowUpLastSentAt,
      autoFollowUpStoppedAt: quotes.autoFollowUpStoppedAt,
      createdAt: quotes.createdAt,
      updatedAt: quotes.updatedAt,
      aiReadiness: quotes.aiReadiness,
      aiAcknowledgedAt: quotes.aiAcknowledgedAt,
      linkedInquiryId: inquiries.id,
      linkedInquiryCustomerName: inquiries.customerName,
      linkedInquiryCustomerEmail: inquiries.customerEmail,
      linkedInquiryCustomerContactMethod: inquiries.customerContactMethod,
      linkedInquiryCustomerContactHandle: inquiries.customerContactHandle,
      linkedInquirySubject: inquiries.subject,
      linkedInquiryRequestedDeadline: inquiries.requestedDeadline,
      linkedInquiryStatus: getEffectiveInquiryStatus,
      linkedInquiryRecordState: getInquiryRecordState,
      linkedInquiryDetails: inquiries.details,
      linkedInquiryBudgetText: inquiries.budgetText,
    })
    .from(quotes)
    .leftJoin(inquiries, eq(quotes.inquiryId, inquiries.id))
    .where(
      and(
        eq(quotes.id, quoteId),
        eq(quotes.businessId, businessId),
        isNull(quotes.deletedAt),
      ),
    )
    .limit(1);

  if (!quote) {
    return null;
  }

  return {
    id: quote.id,
    businessId: quote.businessId,
    inquiryId: quote.inquiryId,
    quoteNumber: quote.quoteNumber,
    publicToken: tryResolveStoredQuotePublicToken(quote),
    title: quote.title,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    customerContactMethod: quote.customerContactMethod,
    customerContactHandle: quote.customerContactHandle,
    currency: quote.currency,
    notes: quote.notes,
    terms: quote.terms,
    subtotalInCents: quote.subtotalInCents,
    discountInCents: quote.discountInCents,
    taxInCents: quote.taxInCents,
    taxLabel: quote.taxLabel,
    totalInCents: quote.totalInCents,
    validUntil: quote.validUntil,
    version: quote.version,
    status: quote.status,
    archivedAt: quote.archivedAt,
    voidedAt: quote.voidedAt,
    sentAt: quote.sentAt,
    acceptedAt: quote.acceptedAt,
    completedAt: quote.completedAt,
    canceledAt: quote.canceledAt,
    cancellationReason: quote.cancellationReason,
    cancellationNote: quote.cancellationNote,
    publicViewedAt: quote.publicViewedAt,
    customerRespondedAt: quote.customerRespondedAt,
    customerResponseMessage: quote.customerResponseMessage,
    autoFollowUpEnabled: quote.autoFollowUpEnabled,
    autoFollowUpDelayDays: quote.autoFollowUpDelayDays,
    autoFollowUpMaxAttempts: quote.autoFollowUpMaxAttempts,
    autoFollowUpAttempts: quote.autoFollowUpAttempts,
    autoFollowUpLastSentAt: quote.autoFollowUpLastSentAt,
    autoFollowUpStoppedAt: quote.autoFollowUpStoppedAt,
    createdAt: quote.createdAt,
    updatedAt: quote.updatedAt,
    aiReadiness: quote.aiReadiness,
    aiAcknowledgedAt: quote.aiAcknowledgedAt,
    linkedInquiry: quote.linkedInquiryId
      ? {
          id: quote.linkedInquiryId,
          customerName: quote.linkedInquiryCustomerName!,
          customerEmail: quote.linkedInquiryCustomerEmail!,
          customerContactMethod: quote.linkedInquiryCustomerContactMethod!,
          customerContactHandle: quote.linkedInquiryCustomerContactHandle!,
          subject: quote.linkedInquirySubject ?? null,
          requestedDeadline: quote.linkedInquiryRequestedDeadline ?? null,
          status: quote.linkedInquiryStatus!,
          recordState: quote.linkedInquiryRecordState!,
          details: quote.linkedInquiryDetails ?? "",
          budgetText: quote.linkedInquiryBudgetText ?? null,
        }
      : null,
    reminders: getQuoteReminderKinds({
      status: quote.status,
      sentAt: quote.sentAt,
      customerRespondedAt: quote.customerRespondedAt,
      validUntil: quote.validUntil,
    }),
  };
}

async function getCachedQuoteItems({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteItem[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessQuoteDetailCacheTags(businessId, quoteId));

  return db
    .select({
      id: quoteItems.id,
      description: quoteItems.description,
      quantity: quoteItems.quantity,
      unitPriceInCents: quoteItems.unitPriceInCents,
      lineTotalInCents: quoteItems.lineTotalInCents,
      position: quoteItems.position,
    })
    .from(quoteItems)
    .where(
      and(
        eq(quoteItems.businessId, businessId),
        eq(quoteItems.quoteId, quoteId),
      ),
    )
    .orderBy(asc(quoteItems.position), asc(quoteItems.createdAt));
}

async function getCachedQuoteActivities({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteActivity[]> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessQuoteDetailCacheTags(businessId, quoteId));

  return db
    .select({
      id: activityLogs.id,
      type: activityLogs.type,
      summary: activityLogs.summary,
      createdAt: activityLogs.createdAt,
      actorName: user.name,
    })
    .from(activityLogs)
    .leftJoin(user, eq(activityLogs.actorUserId, user.id))
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        eq(activityLogs.quoteId, quoteId),
      ),
    )
    .orderBy(desc(activityLogs.createdAt));
}

/**
 * Whole-record quote payload.
 *
 * Composes the staged slices above so the print page, the preview page, the
 * export route, and the invoice-creation flow keep resolving one record in a
 * single call.
 */
async function getCachedQuoteDetailForBusiness({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteDetail | null> {
  const [core, items, activities] = await Promise.all([
    getCachedQuoteDetailCore({ businessId, quoteId }),
    getCachedQuoteItems({ businessId, quoteId }),
    getCachedQuoteActivities({ businessId, quoteId }),
  ]);

  if (!core) {
    return null;
  }

  return { ...core, items, activities };
}

/**
 * Core slice, for the quote detail page's frame region.
 *
 * Keeps the expired-quote sync that `getQuoteDetailForBusiness` schedules,
 * so opening the detail page still nudges stale quotes.
 */
export async function getQuoteDetailCoreForBusiness({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteDetailCore | null> {
  scheduleExpiredQuotesSyncForBusiness(businessId);

  return getCachedQuoteDetailCore({ businessId, quoteId });
}

/** Line items, for the quote detail page's own streaming regions. */
export async function getQuoteItemsForBusiness({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteItem[]> {
  return getCachedQuoteItems({ businessId, quoteId });
}

/** Activity log, for the quote detail page's activity region. */
export async function getQuoteActivitiesForBusiness({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<DashboardQuoteActivity[]> {
  return getCachedQuoteActivities({ businessId, quoteId });
}

export async function getQuoteSendPayloadForBusiness({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<QuoteSendPayload | null> {
  scheduleExpiredQuotesSyncForBusiness(businessId);

  return getCachedQuoteSendPayloadForBusiness({
    businessId,
    quoteId,
  });
}

async function getCachedQuoteSendPayloadForBusiness({
  businessId,
  quoteId,
}: GetQuoteDetailForBusinessInput): Promise<QuoteSendPayload | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessQuoteDetailCacheTags(businessId, quoteId));

  const [quote] = await db
    .select({
      id: quotes.id,
      inquiryId: quotes.inquiryId,
      quoteNumber: quotes.quoteNumber,
      publicToken: quotes.publicToken,
      title: quotes.title,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
      customerContactMethod: quotes.customerContactMethod,
      customerContactHandle: quotes.customerContactHandle,
      currency: quotes.currency,
      notes: quotes.notes,
      terms: quotes.terms,
      subtotalInCents: quotes.subtotalInCents,
      discountInCents: quotes.discountInCents,
      taxInCents: quotes.taxInCents,
      taxLabel: quotes.taxLabel,
      totalInCents: quotes.totalInCents,
      validUntil: quotes.validUntil,
      status: getEffectiveQuoteStatus,
      updatedAt: quotes.updatedAt,
      aiReadiness: quotes.aiReadiness,
      aiAcknowledgedAt: quotes.aiAcknowledgedAt,
      aiMissingInfo: quotes.aiMissingInfo,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.id, quoteId),
        eq(quotes.businessId, businessId),
        isNull(quotes.deletedAt),
      ),
    )
    .limit(1);

  if (!quote) {
    return null;
  }

  const items = await db
    .select({
      id: quoteItems.id,
      description: quoteItems.description,
      quantity: quoteItems.quantity,
      unitPriceInCents: quoteItems.unitPriceInCents,
      lineTotalInCents: quoteItems.lineTotalInCents,
      position: quoteItems.position,
    })
    .from(quoteItems)
    .where(
      and(
        eq(quoteItems.businessId, businessId),
        eq(quoteItems.quoteId, quoteId),
      ),
    )
    .orderBy(asc(quoteItems.position), asc(quoteItems.createdAt));

  return {
    currency: quote.currency,
    customerEmail: quote.customerEmail,
    customerContactMethod: quote.customerContactMethod,
    customerContactHandle: quote.customerContactHandle,
    customerName: quote.customerName,
    discountInCents: quote.discountInCents,
    taxInCents: quote.taxInCents,
    taxLabel: quote.taxLabel,
    id: quote.id,
    inquiryId: quote.inquiryId,
    notes: quote.notes,
    terms: quote.terms,
    publicToken: tryResolveStoredQuotePublicToken(quote),
    quoteNumber: quote.quoteNumber,
    status: quote.status,
    subtotalInCents: quote.subtotalInCents,
    title: quote.title,
    totalInCents: quote.totalInCents,
    updatedAt: quote.updatedAt,
    validUntil: quote.validUntil,
    aiReadiness: quote.aiReadiness,
    aiAcknowledgedAt: quote.aiAcknowledgedAt,
    aiMissingInfo: quote.aiMissingInfo,
    items,
  };
}

async function getPublicQuoteByTokenImpl(
  token: string,
): Promise<PublicQuoteView | null> {
  // Dynamic per-token page: `after()` below uses the clock, which is
  // unstable during prerender. Opt into request-time rendering first.
  await connection();
  scheduleExpiredQuoteSyncForPublicToken(token);

  const [quote] = await db
    .select({
      id: quotes.id,
      businessId: quotes.businessId,
      quoteNumber: quotes.quoteNumber,
      title: quotes.title,
      businessName: businesses.name,
      businessSlug: businesses.slug,
      businessPlan: businesses.plan,
      businessShortDescription: businesses.shortDescription,
      businessContactEmail: businesses.contactEmail,
      businessLogoStoragePath: businesses.logoStoragePath,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
      customerContactMethod: quotes.customerContactMethod,
      customerContactHandle: quotes.customerContactHandle,
      currency: quotes.currency,
      notes: quotes.notes,
      terms: quotes.terms,
      validUntil: quotes.validUntil,
      version: quotes.version,
      status: getEffectiveQuoteStatus,
      subtotalInCents: quotes.subtotalInCents,
      discountInCents: quotes.discountInCents,
      taxInCents: quotes.taxInCents,
      taxLabel: quotes.taxLabel,
      totalInCents: quotes.totalInCents,
      sentAt: quotes.sentAt,
      acceptedAt: quotes.acceptedAt,
      publicViewedAt: quotes.publicViewedAt,
      customerRespondedAt: quotes.customerRespondedAt,
      customerResponseMessage: quotes.customerResponseMessage,
    })
    .from(quotes)
    .innerJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(
      and(
        getQuotePublicTokenLookupCondition(token),
        isNull(quotes.deletedAt),
        isNull(businesses.deletedAt),
        isNull(businesses.deletedAt),
        isNull(businesses.archivedAt),
      ),
    )
    .limit(1);

  if (!quote || quote.status === "draft") {
    return null;
  }

  const items = await db
    .select({
      id: quoteItems.id,
      description: quoteItems.description,
      quantity: quoteItems.quantity,
      unitPriceInCents: quoteItems.unitPriceInCents,
      lineTotalInCents: quoteItems.lineTotalInCents,
      position: quoteItems.position,
    })
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quote.id))
    .orderBy(asc(quoteItems.position), asc(quoteItems.createdAt));

  const [acceptance] = await db
    .select({
      id: quoteAcceptances.id,
      quoteVersion: quoteAcceptances.quoteVersion,
      signerName: quoteAcceptances.signerName,
      signerEmail: quoteAcceptances.signerEmail,
      acceptanceMethod: quoteAcceptances.acceptanceMethod,
      acceptanceText: quoteAcceptances.acceptanceText,
      acceptanceTextVersion: quoteAcceptances.acceptanceTextVersion,
      snapshotHash: quoteAcceptances.snapshotHash,
      acceptedAt: quoteAcceptances.acceptedAt,
    })
    .from(quoteAcceptances)
    .where(eq(quoteAcceptances.quoteId, quote.id))
    .limit(1);

  return {
    acceptedAt: quote.acceptedAt,
    businessId: quote.businessId,
    businessContactEmail: quote.businessContactEmail,
    businessName: quote.businessName,
    businessSlug: quote.businessSlug,
    businessPlan: quote.businessPlan,
    businessShortDescription: quote.businessShortDescription,
    businessLogoStoragePath: quote.businessLogoStoragePath,
    currency: quote.currency,
    customerEmail: quote.customerEmail,
    customerContactMethod: quote.customerContactMethod,
    customerContactHandle: quote.customerContactHandle,
    customerName: quote.customerName,
    customerRespondedAt: quote.customerRespondedAt,
    customerResponseMessage: quote.customerResponseMessage,
    discountInCents: quote.discountInCents,
    taxInCents: quote.taxInCents,
    taxLabel: quote.taxLabel,
    id: quote.id,
    notes: quote.notes,
    terms: quote.terms,
    version: quote.version,
    publicViewedAt: quote.publicViewedAt,
    quoteNumber: quote.quoteNumber,
    sentAt: quote.sentAt,
    status: quote.status,
    subtotalInCents: quote.subtotalInCents,
    token,
    title: quote.title,
    totalInCents: quote.totalInCents,
    validUntil: quote.validUntil,
    items,
    acceptance: acceptance ?? null,
  };
}

export const getPublicQuoteByToken = cache(getPublicQuoteByTokenImpl);

type GetInquiryQuotePrefillForBusinessInput = {
  businessId: string;
  inquiryId: string;
};

export async function getInquiryQuotePrefillForBusiness({
  businessId,
  inquiryId,
}: GetInquiryQuotePrefillForBusinessInput): Promise<QuoteInquiryPrefill | null> {
  "use cache";

  cacheLife(hotBusinessCacheLife);
  cacheTag(...getBusinessInquiryDetailCacheTags(businessId, inquiryId));

  const [inquiry] = await db
    .select({
      id: inquiries.id,
      customerName: inquiries.customerName,
      customerEmail: inquiries.customerEmail,
      customerContactMethod: inquiries.customerContactMethod,
      customerContactHandle: inquiries.customerContactHandle,
      subject: inquiries.subject,
      status: getEffectiveInquiryStatus,
      recordState: getInquiryRecordState,
      details: inquiries.details,
      requestedDeadline: inquiries.requestedDeadline,
      budgetText: inquiries.budgetText,
    })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.id, inquiryId),
        eq(inquiries.businessId, businessId),
      ),
    )
    .limit(1);

  return inquiry ?? null;
}

// ---------------------------------------------------------------------------
// Quote Versions & Revision Requests
// ---------------------------------------------------------------------------

import { quoteRevisionRequests } from "@/lib/db/schema/quotes";
import type { QuoteRevisionRequest } from "@/features/quotes/types";

export async function getRevisionRequestsForQuote(
  businessId: string,
  quoteId: string,
): Promise<QuoteRevisionRequest[]> {
  const requests = await db
    .select({
      id: quoteRevisionRequests.id,
      quoteId: quoteRevisionRequests.quoteId,
      version: quoteRevisionRequests.version,
      message: quoteRevisionRequests.message,
      itemComments: quoteRevisionRequests.itemComments,
      status: quoteRevisionRequests.status,
      createdAt: quoteRevisionRequests.createdAt,
      resolvedAt: quoteRevisionRequests.resolvedAt,
    })
    .from(quoteRevisionRequests)
    .where(
      and(
        eq(quoteRevisionRequests.quoteId, quoteId),
        eq(quoteRevisionRequests.businessId, businessId),
      ),
    )
    .orderBy(desc(quoteRevisionRequests.createdAt));

  return requests as QuoteRevisionRequest[];
}

export async function getAcceptanceForBusiness({
  businessId,
  quoteId,
}: {
  businessId: string;
  quoteId: string;
}) {
  const [row] = await db
    .select({
      id: quoteAcceptances.id,
      quoteVersion: quoteAcceptances.quoteVersion,
      signerName: quoteAcceptances.signerName,
      signerEmail: quoteAcceptances.signerEmail,
      acceptanceMethod: quoteAcceptances.acceptanceMethod,
      acceptanceText: quoteAcceptances.acceptanceText,
      acceptanceTextVersion: quoteAcceptances.acceptanceTextVersion,
      snapshot: quoteAcceptances.snapshot,
      snapshotHash: quoteAcceptances.snapshotHash,
      acceptedAt: quoteAcceptances.acceptedAt,
    })
    .from(quoteAcceptances)
    .where(
      and(
        eq(quoteAcceptances.businessId, businessId),
        eq(quoteAcceptances.quoteId, quoteId),
      ),
    )
    .limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Lightweight business contact email fetch for quote preview
// ---------------------------------------------------------------------------

export async function getBusinessContactEmailForPreview(
  businessId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ contactEmail: businesses.contactEmail })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return row?.contactEmail ?? null;
}
