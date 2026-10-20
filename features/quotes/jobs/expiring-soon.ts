import "server-only";

import { and, eq, gte, isNull, lte, notExists } from "drizzle-orm";

import { insertBusinessNotification } from "@/features/notifications/mutations";
import { addCalendarDays, getLocalDateString } from "@/features/follow-ups/utils";
import { db } from "@/lib/db/client";
import { businessNotifications, businesses, quotes } from "@/lib/db/schema";

export type QuoteExpiringSoonSummary = {
  processed: number;
  notified: number;
};

/**
 * Notifies the owner (in-app, `quote_expiring`) about sent quotes that are
 * about to expire and have not received a customer response. Idempotent per
 * quote: a quote is only ever notified once.
 */
export async function processQuoteExpiringSoon(): Promise<QuoteExpiringSoonSummary> {
  const now = new Date();
  // The window is evaluated per business in the business's own timezone: a
  // quote expiring "today" in UTC+13 is still valid for hours after UTC has
  // already rolled over.
  const utcToday = getLocalDateString(now, "UTC");
  // Business-local today can be a day ahead of UTC; include its two-day horizon.
  const widestHorizon = addCalendarDays(utcToday, 3);
  const earliestToday = addCalendarDays(utcToday, -1);

  let processed = 0;
  let notified = 0;

  const expiringQuotes = await db
    .select({
      quoteId: quotes.id,
      businessId: quotes.businessId,
      quoteNumber: quotes.quoteNumber,
      customerName: quotes.customerName,
      validUntil: quotes.validUntil,
      timezone: businesses.timezone,
      notifyInApp: businesses.notifyInAppOnQuoteExpiring,
    })
    .from(quotes)
    .innerJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(
      and(
        eq(quotes.status, "sent"),
        eq(businesses.notifyInAppOnQuoteExpiring, true),
        gte(quotes.validUntil, earliestToday),
        lte(quotes.validUntil, widestHorizon),
        isNull(quotes.customerRespondedAt),
        isNull(quotes.deletedAt),
        notExists(
          db
            .select({ id: businessNotifications.id })
            .from(businessNotifications)
            .where(
              and(
                eq(businessNotifications.quoteId, quotes.id),
                eq(businessNotifications.type, "quote_expiring"),
              ),
            ),
        ),
      ),
    )
    .limit(50);

  for (const row of expiringQuotes) {
    const today = getLocalDateString(now, row.timezone);
    const expiryHorizon = addCalendarDays(today, 2);

    if (row.validUntil < today || row.validUntil > expiryHorizon) {
      // Outside the window in this business's own timezone.
      continue;
    }

    processed++;

    if (!row.notifyInApp) {
      continue;
    }

    try {
      await db.transaction(async (tx) => {
        await insertBusinessNotification(tx, {
          businessId: row.businessId,
          quoteId: row.quoteId,
          type: "quote_expiring",
          title: `${row.customerName}'s quote ${row.quoteNumber} is expiring soon`,
          summary: `Quote ${row.quoteNumber} expires on ${row.validUntil}. Follow up with ${row.customerName} before it does.`,
          metadata: {
            customerName: row.customerName,
            quoteNumber: row.quoteNumber,
            validUntil: row.validUntil,
          },
          now,
        });
      });
      notified++;
    } catch (error) {
      console.error(
        `[expiring-soon] Failed to notify about expiring quote ${row.quoteId}`,
        error,
      );
    }
  }

  return { processed, notified };
}