import "server-only";

import { and, eq, isNull, notExists, sql } from "drizzle-orm";

import { createFollowUpForBusiness } from "@/features/follow-ups/mutations";
import { getLocalDateString } from "@/features/follow-ups/utils";
import { db } from "@/lib/db/client";
import { businesses, followUps, quotes } from "@/lib/db/schema";

export type QuoteViewedFollowUpsSummary = {
  processed: number;
  created: number;
  skipped: number;
};

/**
 * Creates a follow-up task for quotes that the customer has viewed but not
 * yet responded to, once the business's `quoteViewedFollowUpDelayDays` window
 * has elapsed. Idempotent per quote: quotes with an existing follow-up row
 * are never re-processed.
 */
export async function processQuoteViewedFollowUps(): Promise<QuoteViewedFollowUpsSummary> {
  let processed = 0;
  let created = 0;
  let skipped = 0;

  const eligibleQuotes = await db
    .select({
      quoteId: quotes.id,
      businessId: quotes.businessId,
      quoteNumber: quotes.quoteNumber,
      customerName: quotes.customerName,
      publicViewedAt: quotes.publicViewedAt,
      validUntil: quotes.validUntil,
      ownerUserId: businesses.ownerUserId,
      timezone: businesses.timezone,
      followUpDelayDays: businesses.quoteViewedFollowUpDelayDays,
    })
    .from(quotes)
    .innerJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(
      and(
        eq(quotes.status, "sent"),
        eq(businesses.autoFollowUpOnQuoteViewed, true),
        // Wide UTC range; the business-local comparison happens per row below.
        sql`${quotes.validUntil} >= ${getEarliestTodayUtcDateString()}`,
        sql`${quotes.publicViewedAt} is not null`,
        isNull(quotes.customerRespondedAt),
        isNull(quotes.deletedAt),
        notExists(
          db
            .select({ id: followUps.id })
            .from(followUps)
            .where(
              and(
                eq(followUps.quoteId, quotes.id),
                isNull(followUps.deletedAt),
              ),
            ),
        ),
      ),
    )
    .limit(50);

  for (const row of eligibleQuotes) {
    processed++;

    if (!row.publicViewedAt) {
      skipped++;
      continue;
    }

    // The delay window is evaluated in the business's own timezone.
    const today = getLocalDateString(new Date(), row.timezone);
    const dueDate = getLocalDateString(
      new Date(row.publicViewedAt.getTime() + row.followUpDelayDays * 24 * 60 * 60 * 1000),
      row.timezone,
    );

    if (row.validUntil < today || dueDate > today) {
      skipped++;
      continue;
    }

    try {
      await createFollowUpForBusiness({
        businessId: row.businessId,
        quoteId: row.quoteId,
        actorUserId: row.ownerUserId,
        followUp: {
          title: `Follow up on viewed quote ${row.quoteNumber}`,
          reason: `${row.customerName} viewed quote ${row.quoteNumber} but has not responded yet.`,
          channel: "email",
          category: "sales",
          dueDate,
        },
        timezone: row.timezone,
      });
      created++;
    } catch (error) {
      console.error(
        `[viewed-follow-ups] Failed to create follow-up for quote ${row.quoteId}`,
        error,
      );
      skipped++;
    }
  }

  return { processed, created, skipped };
}

/**
 * The earliest "today" across every business timezone, so the SQL range
 * never excludes a quote whose business is ahead of UTC.
 */
function getEarliestTodayUtcDateString() {
  return new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}