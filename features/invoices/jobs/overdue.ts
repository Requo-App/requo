import "server-only";

import { and, eq, isNull, notExists, sql } from "drizzle-orm";

import { insertBusinessNotification } from "@/features/notifications/mutations";
import { getEffectiveInvoiceStatusSql } from "@/features/invoices/queries";
import { getTodayUtcDateString } from "@/features/quotes/utils";
import { db } from "@/lib/db/client";
import { activityLogs, businesses, invoices } from "@/lib/db/schema";
import { sendPushInvoiceOverdueEvent } from "@/lib/inngest/send";
import { newEntityId } from "@/lib/ids";

export type InvoiceOverdueSummary = {
  processed: number;
  notified: number;
};

/**
 * Notifies owners (in-app `invoice_overdue` + push) about invoices that are
 * past due. Idempotent per invoice per day: an invoice is skipped when an
 * `invoice.overdue` activity entry was recorded in the last 24 hours.
 */
export async function processInvoiceOverdue(): Promise<InvoiceOverdueSummary> {
  const now = new Date();
  const today = getTodayUtcDateString();
  const effectiveStatus = getEffectiveInvoiceStatusSql(today);
  let processed = 0;
  let notified = 0;

  const overdueInvoices = await db
    .select({
      invoiceId: invoices.id,
      businessId: invoices.businessId,
      businessSlug: businesses.slug,
      invoiceNumber: invoices.invoiceNumber,
      customerName: invoices.customerName,
      dueDate: invoices.dueDate,
      totalInCents: invoices.totalInCents,
    })
    .from(invoices)
    .innerJoin(businesses, eq(invoices.businessId, businesses.id))
    .where(
      and(
        isNull(invoices.deletedAt),
        sql`${effectiveStatus} = 'overdue'::invoice_status`,
        notExists(
          db
            .select({ id: activityLogs.id })
            .from(activityLogs)
            .where(
              and(
                eq(activityLogs.businessId, invoices.businessId),
                sql`${activityLogs.createdAt} > now() - interval '24 hours'`,
                sql`${activityLogs.metadata}->>'invoiceId' = ${invoices.id}`,
                eq(activityLogs.type, "invoice.overdue"),
              ),
            ),
        ),
      ),
    )
    .limit(50);

  for (const row of overdueInvoices) {
    processed++;

    try {
      await db.transaction(async (tx) => {
        await insertBusinessNotification(tx, {
          businessId: row.businessId,
          invoiceId: row.invoiceId,
          type: "invoice_overdue",
          title: `Invoice ${row.invoiceNumber} is overdue`,
          summary: `Invoice ${row.invoiceNumber} for ${row.customerName} was due ${row.dueDate}. Follow up on the amount due.`,
          metadata: {
            invoiceId: row.invoiceId,
            invoiceNumber: row.invoiceNumber,
            customerName: row.customerName,
            dueDate: row.dueDate,
          },
          now,
        });
        await tx.insert(activityLogs).values({
          id: newEntityId(),
          businessId: row.businessId,
          actorUserId: null,
          type: "invoice.overdue",
          summary: `Invoice ${row.invoiceNumber} is overdue.`,
          metadata: { invoiceId: row.invoiceId, invoiceNumber: row.invoiceNumber, dueDate: row.dueDate },
          createdAt: now,
          updatedAt: now,
        });
      });

      void sendPushInvoiceOverdueEvent({
        businessId: row.businessId,
        businessSlug: row.businessSlug,
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        customerName: row.customerName,
        dueDate: row.dueDate,
      }).catch((error) => {
        console.error("Failed to queue push notification for overdue invoice.", error);
      });

      notified++;
    } catch (error) {
      console.error(`[invoice-overdue] Failed to notify about overdue invoice ${row.invoiceId}`, error);
    }
  }

  return { processed, notified };
}
