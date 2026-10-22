/**
 * Assistant Queries
 *
 * Database query functions for assistant tools.
 * All queries are business-scoped.
 */

import { db } from "@/lib/db/client";
import { eq, and, gte, lte, desc, asc, sql, isNotNull, inArray, ilike } from "drizzle-orm";
import { services, inquiries, quotes } from "@/lib/db/schema";
import type {
  SearchInquiriesInput,
  SearchQuotesInput,
  GetQuoteStatsInput,
  SearchCustomersInput,
} from "./schemas";

/**
 * Visibility baseline: the Assistant answers must match what the owner sees in
 * the app, so archived and deleted records are always excluded.
 */
function visibleInquiryConditions() {
  return [
    sql`${inquiries.deletedAt} is null`,
    sql`${inquiries.archivedAt} is null`,
    sql`${inquiries.status} != 'archived'`,
  ];
}

function visibleQuoteConditions() {
  return [
    sql`${quotes.deletedAt} is null`,
    sql`${quotes.archivedAt} is null`,
  ];
}

/**
 * Search inquiries with filters
 * Business-scoped via businessId parameter
 */
export async function searchInquiriesQuery(
  businessId: string,
  params: SearchInquiriesInput
) {
  const conditions = [
    eq(inquiries.businessId, businessId),
    ...visibleInquiryConditions(),
  ];

  if (params.status) {
    conditions.push(eq(inquiries.status, params.status));
  }

  if (params.dateRange) {
    conditions.push(gte(inquiries.createdAt, new Date(params.dateRange.start)));
    conditions.push(lte(inquiries.createdAt, new Date(params.dateRange.end)));
  }

  if (params.customerEmail) {
    conditions.push(
      sql`lower(${inquiries.customerEmail}) = lower(${params.customerEmail})`,
    );
  }

  if (params.customerName) {
    conditions.push(
      sql`lower(${inquiries.customerName}) like lower(${"%" + params.customerName + "%"})`,
    );
  }

  if (params.aiAssisted !== undefined) {
    conditions.push(eq(inquiries.aiAssisted, params.aiAssisted));
  }

  if (params.serviceSlug) {
    conditions.push(eq(services.slug, params.serviceSlug));
  }

  const orderBy =
    params.sortOrder === "asc"
      ? asc(inquiries[params.sortBy])
      : desc(inquiries[params.sortBy]);

  const results = await db
    .select({
      id: inquiries.id,
      customerName: inquiries.customerName,
      customerEmail: inquiries.customerEmail,
      status: inquiries.status,
      serviceName: services.name,
      serviceSlug: services.slug,
      source: inquiries.source,
      aiAssisted: inquiries.aiAssisted,
      createdAt: inquiries.createdAt,
      updatedAt: inquiries.updatedAt,
    })
    .from(inquiries)
    .leftJoin(
      services,
      eq(inquiries.serviceId, services.id),
    )
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(params.limit)
    .offset(params.offset);

  // Get total count for pagination.
  // The conditions may reference the joined `business_inquiry_forms` table
  // (the serviceSlug filter), so the count query needs the same join —
  // otherwise Postgres rejects the reference with 42P01.
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(inquiries)
    .leftJoin(
      services,
      eq(inquiries.serviceId, services.id),
    )
    .where(and(...conditions));

  return {
    results,
    total: count,
    hasMore: params.offset + params.limit < count,
  };
}

/**
 * Get inquiry statistics
 * Business-scoped via businessId parameter
 */
export async function getInquiryStatsQuery(
  businessId: string,
  params: { dateRange?: { start: string; end: string } }
) {
  const conditions = [
    eq(inquiries.businessId, businessId),
    ...visibleInquiryConditions(),
  ];

  if (params.dateRange) {
    conditions.push(gte(inquiries.createdAt, new Date(params.dateRange.start)));
    conditions.push(lte(inquiries.createdAt, new Date(params.dateRange.end)));
  }

  // Total count
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(inquiries)
    .where(and(...conditions));

  // By status
  const byStatusRaw = await db
    .select({
      status: inquiries.status,
      count: sql<number>`count(*)`,
    })
    .from(inquiries)
    .where(and(...conditions))
    .groupBy(inquiries.status);

  const byStatus = Object.fromEntries(
    byStatusRaw.map((row: { status: string; count: number }) => [row.status, row.count])
  );

  // By source
  const bySourceRaw = await db
    .select({
      source: inquiries.source,
      count: sql<number>`count(*)`,
    })
    .from(inquiries)
    .where(and(...conditions))
    .groupBy(inquiries.source);

  const bySource = Object.fromEntries(
    bySourceRaw.map((row: { source: string | null; count: number }) => [row.source ?? "unknown", row.count])
  );

  // AI assisted
  const [{ aiAssistedCount }] = await db
    .select({ aiAssistedCount: sql<number>`count(*)` })
    .from(inquiries)
    .where(and(...conditions, eq(inquiries.aiAssisted, true)));

  return {
    total,
    byStatus,
    bySource,
    aiAssistedCount,
    aiAssistedPercentage: total > 0 ? (aiAssistedCount / total) * 100 : 0,
  };
}

/**
 * Search quotes with filters
 * Business-scoped via businessId parameter
 */
export async function searchQuotesQuery(
  businessId: string,
  params: SearchQuotesInput
) {
  const conditions = [
    eq(quotes.businessId, businessId),
    ...visibleQuoteConditions(),
  ];

  if (params.status) {
    conditions.push(eq(quotes.status, params.status));
  }

  if (params.dateRange) {
    conditions.push(gte(quotes.createdAt, new Date(params.dateRange.start)));
    conditions.push(lte(quotes.createdAt, new Date(params.dateRange.end)));
  }

  if (params.customerEmail) {
    conditions.push(
      sql`lower(${quotes.customerEmail}) = lower(${params.customerEmail})`,
    );
  }

  if (params.customerName) {
    conditions.push(
      sql`lower(${quotes.customerName}) like lower(${"%" + params.customerName + "%"})`,
    );
  }

  if (params.minValue !== undefined) {
    conditions.push(gte(quotes.totalInCents, Math.round(params.minValue * 100)));
  }

  if (params.maxValue !== undefined) {
    conditions.push(lte(quotes.totalInCents, Math.round(params.maxValue * 100)));
  }

  if (params.inquiryId) {
    conditions.push(eq(quotes.inquiryId, params.inquiryId));
  }

  const sortColumn =
    params.sortBy === "total"
      ? quotes.totalInCents
      : params.sortBy === "sentAt"
        ? quotes.sentAt
        : params.sortBy === "customerName"
          ? quotes.customerName
          : quotes.createdAt;

  const orderBy =
    params.sortOrder === "asc" ? asc(sortColumn) : desc(sortColumn);

  const results = await db
    .select({
      id: quotes.id,
      quoteNumber: quotes.quoteNumber,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
      status: quotes.status,
      totalInCents: quotes.totalInCents,
      currency: quotes.currency,
      sentAt: quotes.sentAt,
      viewedAt: quotes.publicViewedAt,
      respondedAt: quotes.customerRespondedAt,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(and(...conditions))
    .orderBy(orderBy)
    .limit(params.limit)
    .offset(params.offset);

  // Get total count and total value
  const [{ count, totalValue }] = await db
    .select({
      count: sql<number>`count(*)`,
      totalValue: sql<number>`sum(${quotes.totalInCents})`,
    })
    .from(quotes)
    .where(and(...conditions));

  return {
    results,
    total: count,
    totalValue: totalValue || 0,
    hasMore: params.offset + params.limit < count,
  };
}

/**
 * Get quote statistics
 * Business-scoped via businessId parameter
 */
export async function getQuoteStatsQuery(
  businessId: string,
  params: Pick<GetQuoteStatsInput, "dateRange">
) {
  const conditions = [
    eq(quotes.businessId, businessId),
    ...visibleQuoteConditions(),
  ];

  if (params.dateRange) {
    conditions.push(gte(quotes.createdAt, new Date(params.dateRange.start)));
    conditions.push(lte(quotes.createdAt, new Date(params.dateRange.end)));
  }

  // Total count
  const [{ total }] = await db
    .select({ total: sql<number>`count(*)` })
    .from(quotes)
    .where(and(...conditions));

  // By status
  const byStatusRaw = await db
    .select({
      status: quotes.status,
      count: sql<number>`count(*)`,
    })
    .from(quotes)
    .where(and(...conditions))
    .groupBy(quotes.status);

  const byStatus = Object.fromEntries(
    byStatusRaw.map((row: { status: string; count: number }) => [row.status, row.count])
  );

  // Pipeline value: sum of sent/viewed quotes (not yet responded)
  const [{ pipelineValue }] = await db
    .select({ pipelineValue: sql<number>`coalesce(sum(${quotes.totalInCents}), 0)` })
    .from(quotes)
    .where(
      and(
        ...conditions,
        sql`${quotes.status} = 'sent'`,
        sql`${quotes.customerRespondedAt} is null`
      )
    );

  // Accepted value
  const [{ acceptedValue }] = await db
    .select({ acceptedValue: sql<number>`coalesce(sum(${quotes.totalInCents}), 0)` })
    .from(quotes)
    .where(and(...conditions, sql`${quotes.status} = 'accepted'`));

  // Average quote value
  const [{ avgValue }] = await db
    .select({ avgValue: sql<number>`coalesce(avg(${quotes.totalInCents}), 0)` })
    .from(quotes)
    .where(and(...conditions));

  // Acceptance rate (accepted / (accepted + rejected))
  const responded = (byStatus["accepted"] ?? 0) + (byStatus["rejected"] ?? 0);
  const acceptanceRate =
    responded > 0 ? ((byStatus["accepted"] ?? 0) / responded) * 100 : 0;

  // View rate (publicViewedAt set / sent)
  const sentCount = byStatus["sent"] ?? 0;
  const [{ viewedCount }] = await db
    .select({ viewedCount: sql<number>`count(*)` })
    .from(quotes)
    .where(and(...conditions, isNotNull(quotes.publicViewedAt)));

  const viewRate = sentCount > 0 ? (viewedCount / sentCount) * 100 : 0;

  // Average time to view (hours from sentAt to publicViewedAt)
  const [{ avgTimeToViewHours }] = await db
    .select({
      avgTimeToViewHours: sql<number>`coalesce(
        avg(extract(epoch from (${quotes.publicViewedAt} - ${quotes.sentAt})) / 3600),
        0
      )`,
    })
    .from(quotes)
    .where(
      and(
        ...conditions,
        isNotNull(quotes.sentAt),
        isNotNull(quotes.publicViewedAt)
      )
    );

  // Average time to respond (hours from sentAt to customerRespondedAt)
  const [{ avgTimeToRespondHours }] = await db
    .select({
      avgTimeToRespondHours: sql<number>`coalesce(
        avg(extract(epoch from (${quotes.customerRespondedAt} - ${quotes.sentAt})) / 3600),
        0
      )`,
    })
    .from(quotes)
    .where(
      and(
        ...conditions,
        isNotNull(quotes.sentAt),
        isNotNull(quotes.customerRespondedAt)
      )
    );

  return {
    total,
    byStatus,
    pipelineValue: pipelineValue ?? 0,
    acceptedValue: acceptedValue ?? 0,
    averageQuoteValue: avgValue ?? 0,
    acceptanceRate,
    viewRate,
    averageTimeToView: avgTimeToViewHours ?? 0,
    averageTimeToRespond: avgTimeToRespondHours ?? 0,
  };
}

/**
 * The most customer rows a single search scans. The search is a lookup, not
 * an export: the tool returns a page, so scanning the whole customer base on
 * every call only cost memory and latency.
 */
const CUSTOMER_SCAN_LIMIT = 500;

/**
 * Search customers aggregated from inquiries and quotes
 * Customers are not a first-class entity; aggregated by email
 */
export async function searchCustomersQuery(
  businessId: string,
  params: SearchCustomersInput
) {
  // Union the distinct emails present in either table, then aggregate the
  // paginated set below. (Unions keep the working set small; per-email
  // aggregates are computed from the fetched rows.)

  // The scan is bounded and the filters run in SQL. Loading every customer
  // email in the business on every tool call made this a per-turn memory
  // spike on the surface with the tightest token budget, and the model can
  // call the tool on every step of a turn.
  const emailFilter = params.email ? `%${params.email.toLowerCase()}%` : null;
  const nameFilter = params.name ? `%${params.name.toLowerCase()}%` : null;

  // Get unique emails present in either table
  const allEmails = await db
    .selectDistinct({
      email: inquiries.customerEmail,
      name: inquiries.customerName,
    })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.businessId, businessId),
        isNotNull(inquiries.customerEmail),
        ...(emailFilter ? [ilike(inquiries.customerEmail, emailFilter)] : []),
        ...(nameFilter ? [ilike(inquiries.customerName, nameFilter)] : []),
        ...visibleInquiryConditions(),
      )
    )
    .union(
      db
        .selectDistinct({
          email: quotes.customerEmail,
          name: quotes.customerName,
        })
        .from(quotes)
        .where(
          and(
            eq(quotes.businessId, businessId),
            isNotNull(quotes.customerEmail),
            ...(emailFilter ? [ilike(quotes.customerEmail, emailFilter)] : []),
            ...(nameFilter ? [ilike(quotes.customerName, nameFilter)] : []),
            ...visibleQuoteConditions(),
          )
        )
    )
    .limit(CUSTOMER_SCAN_LIMIT);

  // Build a map of unique emails, picking the most recent name
  const emailMap = new Map<string, { email: string; name: string }>();
  for (const row of allEmails) {
    if (!row.email) continue;
    const key = row.email.toLowerCase();
    if (!emailMap.has(key)) {
      emailMap.set(key, { email: row.email, name: row.name });
    }
  }

  const uniqueEmails = Array.from(emailMap.values());

  // Apply filters
  let filtered = uniqueEmails;
  if (params.email) {
    const q = params.email.toLowerCase();
    filtered = filtered.filter((c) => c.email.toLowerCase().includes(q));
  }
  if (params.name) {
    const q = params.name.toLowerCase();
    filtered = filtered.filter((c) => c.name.toLowerCase().includes(q));
  }

  // Apply pagination
  const paginated = filtered.slice(params.offset, params.offset + params.limit);

  if (paginated.length === 0) {
    return { results: [], total: filtered.length, hasMore: false };
  }

  // Fetch inquiries for the paginated set
  const pageEmails = paginated.map((c) => c.email);

  const inquiryRows = await db
    .select({
      email: inquiries.customerEmail,
      id: inquiries.id,
      status: inquiries.status,
      createdAt: inquiries.createdAt,
    })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.businessId, businessId),
        inArray(inquiries.customerEmail, pageEmails),
        ...visibleInquiryConditions(),
      )
    )
    .orderBy(desc(inquiries.createdAt));

  // Fetch quotes for the paginated set
  const quoteRows = await db
    .select({
      email: quotes.customerEmail,
      id: quotes.id,
      status: quotes.status,
      totalInCents: quotes.totalInCents,
      createdAt: quotes.createdAt,
    })
    .from(quotes)
    .where(
      and(
        eq(quotes.businessId, businessId),
        inArray(quotes.customerEmail, pageEmails),
        ...visibleQuoteConditions(),
      )
    )
    .orderBy(desc(quotes.createdAt));

  // Group by email
  const inquiryByEmail = new Map<string, typeof inquiryRows>();
  for (const row of inquiryRows) {
    if (!row.email) continue;
    const key = row.email.toLowerCase();
    if (!inquiryByEmail.has(key)) inquiryByEmail.set(key, []);
    inquiryByEmail.get(key)!.push(row);
  }

  const quoteByEmail = new Map<string, typeof quoteRows>();
  for (const row of quoteRows) {
    if (!row.email) continue;
    const key = row.email.toLowerCase();
    if (!quoteByEmail.has(key)) quoteByEmail.set(key, []);
    quoteByEmail.get(key)!.push(row);
  }

  // Build results
  interface InquiryData {
    id: string;
    createdAt: Date | null;
    status: string;
  }

  interface QuoteData {
    id: string;
    createdAt: Date | null;
    status: string;
    totalInCents: number | null;
  }

  let results = paginated.map((customer) => {
    const key = customer.email.toLowerCase();
    const custInquiries = (inquiryByEmail.get(key) ?? []) as InquiryData[];
    const custQuotes = (quoteByEmail.get(key) ?? []) as QuoteData[];
    const acceptedQuotes = custQuotes.filter((q) => q.status === "accepted");
    const totalSpentCents = acceptedQuotes.reduce(
      (sum: number, q) => sum + (q.totalInCents ?? 0),
      0
    );

    const lastContactDate = [
      ...custInquiries.map((i) => i.createdAt),
      ...custQuotes.map((q) => q.createdAt),
    ]
      .filter(Boolean)
      .sort((a, b) => (b?.getTime() ?? 0) - (a?.getTime() ?? 0))[0];

    return {
      email: customer.email,
      name: customer.name,
      inquiryCount: custInquiries.length,
      quoteCount: custQuotes.length,
      acceptedQuoteCount: acceptedQuotes.length,
      totalSpentCents,
      lastContactDate: lastContactDate?.toISOString() ?? null,
      inquiries: custInquiries.slice(0, 5).map((i) => ({
        id: i.id,
        status: i.status,
        createdAt: i.createdAt?.toISOString() ?? null,
      })),
      quotes: custQuotes.slice(0, 5).map((q) => ({
        id: q.id,
        status: q.status,
        totalInCents: q.totalInCents ?? 0,
        createdAt: q.createdAt?.toISOString() ?? null,
      })),
    };
  });

  // Apply boolean filters post-aggregation
  if (params.hasInquiries === true) {
    results = results.filter((c) => c.inquiryCount > 0);
  }
  if (params.hasQuotes === true) {
    results = results.filter((c) => c.quoteCount > 0);
  }
  if (params.hasAcceptedQuotes === true) {
    results = results.filter((c) => c.acceptedQuoteCount > 0);
  }

  return {
    results,
    total: filtered.length,
    hasMore: params.offset + params.limit < filtered.length,
  };
}

