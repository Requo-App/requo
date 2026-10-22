import "server-only";

import { and, eq, gte, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newEntityId } from "@/lib/ids";
import {
  analyticsDailyRollups,
  analyticsEvents,
  businesses,
  inquiries,
  quotes,
} from "@/lib/db/schema";

export type AnalyticsRollupSummary = {
  date: string;
  totalBusinesses: number;
  processed: number;
  failed: number;
  errors?: Array<{ businessId: string; error: string }>;
};

export type BatchConfig = {
  batchSize: number; // default: 10, min: 5, max: 25
};

export type RollupConfig = BatchConfig & {
  /**
   * The UTC day to compute, `YYYY-MM-DD`. Defaults to yesterday, the day the
   * nightly job runs for. A past date recomputes that day in place, which is
   * how a definition change is applied to the days already rolled up.
   */
  targetDate?: string;
};

const DEFAULT_BATCH_SIZE = 10;
const MIN_BATCH_SIZE = 5;
const MAX_BATCH_SIZE = 25;

/**
 * Clamp batch size to valid range [5, 25].
 */
export function normalizeBatchSize(size: number): number {
  return Math.max(MIN_BATCH_SIZE, Math.min(MAX_BATCH_SIZE, Math.round(size)));
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Resolves the UTC day to roll up. Accepts `YYYY-MM-DD`; anything else is
 * rejected so a typo cannot silently roll up the wrong day.
 */
export function resolveTargetDate(targetDate?: string): string {
  if (!targetDate) {
    const now = new Date();
    const yesterday = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() - 1,
      ),
    );
    return yesterday.toISOString().split("T")[0]!;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    throw new Error(
      `Invalid rollup target date "${targetDate}". Expected YYYY-MM-DD.`,
    );
  }
  return targetDate;
}

export async function computeDailyRollups(
  config?: Partial<RollupConfig>,
): Promise<AnalyticsRollupSummary> {
  const batchSize = normalizeBatchSize(config?.batchSize ?? DEFAULT_BATCH_SIZE);
  const targetDate = resolveTargetDate(config?.targetDate);

  const dayStart = new Date(`${targetDate}T00:00:00.000Z`);
  const dayAfter = addUtcDays(dayStart, 1);

  const allBusinesses = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(isNull(businesses.deletedAt));

  let processed = 0;
  let failed = 0;
  const errors: Array<{ businessId: string; error: string }> = [];

  // Process businesses in sequential batches
  for (let i = 0; i < allBusinesses.length; i += batchSize) {
    const batch = allBusinesses.slice(i, i + batchSize);
    const batchIds = batch.map((b) => b.id);

    // Pre-fetch batch-level aggregated metrics using single queries per metric
    const [
      batchFormViews,
      batchUniqueVisitors,
      batchInquiries,
      batchQuotesSent,
      batchQuotesAccepted,
      batchQuotesRejected,
    ] = await Promise.all([
      fetchBatchFormViews(batchIds, dayStart, dayAfter),
      fetchBatchUniqueVisitors(batchIds, dayStart, dayAfter),
      fetchBatchInquiries(batchIds, dayStart, dayAfter),
      fetchBatchQuotesSent(batchIds, dayStart, dayAfter),
      fetchBatchQuotesAccepted(batchIds, dayStart, dayAfter),
      fetchBatchQuotesRejected(batchIds, dayStart, dayAfter),
    ]);

    // Process each business in the batch using Promise.allSettled for error isolation
    const results = await Promise.allSettled(
      batch.map((business) =>
        upsertRollupForBusiness(business.id, targetDate, {
          formViews: batchFormViews.get(business.id) ?? 0,
          uniqueVisitors: batchUniqueVisitors.get(business.id) ?? 0,
          inquirySubmissions: batchInquiries.get(business.id) ?? 0,
          quotesSent: batchQuotesSent.get(business.id) ?? 0,
          quotesAccepted:
            batchQuotesAccepted.get(business.id)?.count ?? 0,
          quotesRejected: batchQuotesRejected.get(business.id) ?? 0,
          revenueCents:
            batchQuotesAccepted.get(business.id)?.revenue ?? 0,
        }),
      ),
    );

    // Collect results
    for (let j = 0; j < results.length; j++) {
      const result = results[j]!;
      if (result.status === "fulfilled") {
        processed++;
      } else {
        failed++;
        const businessId = batch[j]!.id;
        const message =
          result.reason instanceof Error
            ? result.reason.message
            : "Unknown error";
        errors.push({ businessId, error: message });
        console.error(
          `[analytics-rollup] Failed for business ${businessId}:`,
          result.reason,
        );
      }
    }
  }

  return {
    date: targetDate,
    totalBusinesses: allBusinesses.length,
    processed,
    failed,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

// --- Batch aggregation queries ---
// These fetch metrics for all businesses in a batch with a single query each,
// reducing total query count from 6*N to 6 per batch (requirement 4.6).

async function fetchBatchFormViews(
  businessIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, number>> {
  if (businessIds.length === 0) return new Map();

  const rows = await db
    .select({
      businessId: analyticsEvents.businessId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(
      db
        .select({
          businessId: analyticsEvents.businessId,
        })
        .from(analyticsEvents)
        .where(
          and(
            inArray(analyticsEvents.businessId, businessIds),
            eq(analyticsEvents.eventType, "inquiry_form_viewed"),
            isNotNull(analyticsEvents.serviceId),
            gte(analyticsEvents.occurredAt, dayStart),
            lt(analyticsEvents.occurredAt, dayEnd),
          ),
        )
        .groupBy(
          analyticsEvents.businessId,
          analyticsEvents.serviceId,
          analyticsEvents.visitorHash,
          sql`date_trunc('second', ${analyticsEvents.occurredAt})`,
        )
        .as("deduped_form_views"),
    )
    .groupBy(sql`business_id`);

  return new Map(rows.map((r) => [r.businessId, Number(r.count)]));
}

async function fetchBatchUniqueVisitors(
  businessIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, number>> {
  if (businessIds.length === 0) return new Map();

  // The same population the live read path counts: visitors who opened a
  // service form. Counting every event type here would make a rollup day
  // disagree with a live day on the same chart.
  const rows = await db
    .select({
      businessId: analyticsEvents.businessId,
      count:
        sql<number>`count(distinct ${analyticsEvents.visitorHash})`.as("count"),
    })
    .from(analyticsEvents)
    .where(
      and(
        inArray(analyticsEvents.businessId, businessIds),
        eq(analyticsEvents.eventType, "inquiry_form_viewed"),
        isNotNull(analyticsEvents.serviceId),
        gte(analyticsEvents.occurredAt, dayStart),
        lt(analyticsEvents.occurredAt, dayEnd),
      ),
    )
    .groupBy(analyticsEvents.businessId);

  return new Map(rows.map((r) => [r.businessId, Number(r.count)]));
}

async function fetchBatchInquiries(
  businessIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, number>> {
  if (businessIds.length === 0) return new Map();

  const rows = await db
    .select({
      businessId: inquiries.businessId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(inquiries)
    .where(
      and(
        inArray(inquiries.businessId, businessIds),
        isNull(inquiries.deletedAt),
        gte(inquiries.submittedAt, dayStart),
        lt(inquiries.submittedAt, dayEnd),
      ),
    )
    .groupBy(inquiries.businessId);

  return new Map(rows.map((r) => [r.businessId, Number(r.count)]));
}

async function fetchBatchQuotesSent(
  businessIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, number>> {
  if (businessIds.length === 0) return new Map();

  const rows = await db
    .select({
      businessId: quotes.businessId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(quotes)
    .where(
      and(
        inArray(quotes.businessId, businessIds),
        isNull(quotes.deletedAt),
        gte(quotes.sentAt, dayStart),
        lt(quotes.sentAt, dayEnd),
      ),
    )
    .groupBy(quotes.businessId);

  return new Map(rows.map((r) => [r.businessId, Number(r.count)]));
}

async function fetchBatchQuotesAccepted(
  businessIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, { count: number; revenue: number }>> {
  if (businessIds.length === 0) return new Map();

  const rows = await db
    .select({
      businessId: quotes.businessId,
      count: sql<number>`count(*)`.as("count"),
      revenue: sql<number>`coalesce(sum(${quotes.totalInCents}), 0)`.as(
        "revenue",
      ),
    })
    .from(quotes)
    .where(
      and(
        inArray(quotes.businessId, businessIds),
        isNull(quotes.deletedAt),
        eq(quotes.status, "accepted"),
        gte(quotes.acceptedAt, dayStart),
        lt(quotes.acceptedAt, dayEnd),
      ),
    )
    .groupBy(quotes.businessId);

  return new Map(
    rows.map((r) => [
      r.businessId,
      { count: Number(r.count), revenue: Number(r.revenue) },
    ]),
  );
}

async function fetchBatchQuotesRejected(
  businessIds: string[],
  dayStart: Date,
  dayEnd: Date,
): Promise<Map<string, number>> {
  if (businessIds.length === 0) return new Map();

  const rows = await db
    .select({
      businessId: quotes.businessId,
      count: sql<number>`count(*)`.as("count"),
    })
    .from(quotes)
    .where(
      and(
        inArray(quotes.businessId, businessIds),
        isNull(quotes.deletedAt),
        eq(quotes.status, "rejected"),
        gte(quotes.customerRespondedAt, dayStart),
        lt(quotes.customerRespondedAt, dayEnd),
      ),
    )
    .groupBy(quotes.businessId);

  return new Map(rows.map((r) => [r.businessId, Number(r.count)]));
}

// --- Per-business upsert ---

type RollupMetrics = {
  formViews: number;
  uniqueVisitors: number;
  inquirySubmissions: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesRejected: number;
  revenueCents: number;
};

async function upsertRollupForBusiness(
  businessId: string,
  targetDate: string,
  metrics: RollupMetrics,
) {
  await db
    .insert(analyticsDailyRollups)
    .values({
      id: newEntityId(),
      businessId,
      date: targetDate,
      ...metrics,
    })
    .onConflictDoUpdate({
      target: [analyticsDailyRollups.businessId, analyticsDailyRollups.date],
      set: {
        ...metrics,
        updatedAt: new Date(),
      },
    });
}
