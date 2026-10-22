import "server-only";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { writeAuditLog } from "@/features/audit/mutations";
import { insertBusinessNotification } from "@/features/notifications/mutations";
import { db } from "@/lib/db/client";
import { newEntityId } from "@/lib/ids";
import {
  activityLogs,
  businessPaymentCounters,
  invoiceLineItems,
  invoices,
  payments,
  quoteItems,
  quotes,
} from "@/lib/db/schema";
import type { InvoiceStatus, PaymentMethod } from "@/lib/db/schema/invoices";
import { formatQuoteMoney, getTodayUtcDateString } from "@/features/quotes/utils";
import { calculateInvoicePaymentState } from "@/features/invoices/utils";
import { getVoidReasonLabel, normalizeVoidReason, voidReasonValues, type VoidReasonValue } from "@/features/invoices/void-reasons";

export { getVoidReasonLabel, normalizeVoidReason, voidReasonValues, type VoidReasonValue };

function nextPaymentNumber(year: number, sequence: number) {
  return `PAY-${year}-${String(sequence).padStart(4, "0")}`;
}

async function allocatePaymentNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  businessId: string,
  paymentDate: string,
): Promise<{ error: string } | { paymentNumber: string }> {
  const year = Number(paymentDate.slice(0, 4));
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { error: "Payment date year is out of range." } as const;
  }
  const now = new Date();
  const [counter] = await tx
    .insert(businessPaymentCounters)
    .values({ businessId, year, lastSequence: 1, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: [businessPaymentCounters.businessId, businessPaymentCounters.year],
      set: { lastSequence: sql`${businessPaymentCounters.lastSequence} + 1`, updatedAt: now },
    })
    .returning({ lastSequence: businessPaymentCounters.lastSequence });
  if (!counter) return { error: "Could not allocate a payment number. Please try again." } as const;
  return { paymentNumber: nextPaymentNumber(year, counter.lastSequence) } as const;
}

function nextInvoiceNumber(sequence: number | null | undefined) {
  const safe = typeof sequence === "number" && Number.isFinite(sequence) ? Math.max(0, Math.trunc(sequence)) : 0;
  return `INV-${String(safe + 1).padStart(6, "0")}`;
}

function isUniqueInvoiceConflict(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505" &&
    ("constraint_name" in error && (error.constraint_name === "invoices_business_invoice_number_unique" || error.constraint_name === "invoices_business_quote_active_unique"));
}

function calculateTotals(items: Array<{ description: string; quantity: number; unitPriceInCents: number }>, discountInCents: number, taxInCents: number) {
  const snapshotItems = items.map((item, position) => ({
    id: newEntityId(),
    description: item.description.trim(),
    quantity: item.quantity,
    unitPriceInCents: item.unitPriceInCents,
    lineTotalInCents: item.quantity * item.unitPriceInCents,
    position,
  }));
  const subtotalInCents = snapshotItems.reduce((sum, item) => sum + item.lineTotalInCents, 0);
  return {
    items: snapshotItems,
    subtotalInCents,
    discountInCents,
    taxInCents,
    totalInCents: subtotalInCents - discountInCents + taxInCents,
  };
}

async function insertInvoiceActivity(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: { businessId: string; invoiceId: string; actorUserId?: string | null; type: string; summary: string; metadata?: Record<string, unknown> },
) {
  const now = new Date();
  await tx.insert(activityLogs).values({
    id: newEntityId(),
    businessId: input.businessId,
    actorUserId: input.actorUserId ?? null,
    type: input.type,
    summary: input.summary,
    metadata: { invoiceId: input.invoiceId, ...(input.metadata ?? {}) },
    createdAt: now,
    updatedAt: now,
  });
}

type CreateInvoiceInput = {
  businessId: string;
  actorUserId: string;
  quoteId?: string | null;
  title: string;
  customerName: string;
  customerEmail?: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  notes?: string | null;
  paymentTerms?: string | null;
  discountInCents: number;
  taxInCents: number;
  taxLabel?: string | null;
  items: Array<{ description: string; quantity: number; unitPriceInCents: number }>;
};

export async function createInvoiceForBusiness(input: CreateInvoiceInput) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const result = await db.transaction(async (tx) => {
        let sourceQuote: typeof quotes.$inferSelect | null = null;
        let sourceItems: Array<typeof quoteItems.$inferSelect> = [];

        if (input.quoteId) {
          const [quote] = await tx.select().from(quotes).where(and(eq(quotes.id, input.quoteId), eq(quotes.businessId, input.businessId), isNull(quotes.deletedAt))).limit(1);
          if (!quote || quote.status !== "accepted") return { error: "Only accepted quotes can be converted into invoices." } as const;
          sourceQuote = quote;

          const existing = await tx.select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber }).from(invoices).where(and(eq(invoices.businessId, input.businessId), eq(invoices.quoteId, input.quoteId), isNull(invoices.deletedAt), sql`${invoices.status} <> 'voided'`)).limit(1);
          if (existing[0]) return { id: existing[0].id, invoiceNumber: existing[0].invoiceNumber, existing: true } as const;

          sourceItems = await tx.select().from(quoteItems).where(and(eq(quoteItems.businessId, input.businessId), eq(quoteItems.quoteId, input.quoteId))).orderBy(quoteItems.position);
        }

        // P5 prefill: the latest approved schedule version maps 1:1 to
        // draft invoice lines for owner review. Display only — no linkage.
        let schedulePrefill: { scheduleId: string; version: number } | null = null;
        let items = input.quoteId && sourceQuote
          ? sourceItems.map((item) => ({ description: item.description, quantity: item.quantity, unitPriceInCents: item.unitPriceInCents }))
          : input.items;

        if (input.quoteId && sourceQuote) {
          const { resolveSchedulePrefillLines } = await import("@/features/payment-schedules/mutations");
          const prefill = await resolveSchedulePrefillLines({
            businessId: input.businessId,
            quoteId: input.quoteId,
          });

          if (prefill) {
            items = prefill.lines;
            schedulePrefill = { scheduleId: prefill.scheduleId, version: prefill.version };

            const { recordAnalyticsEvent } = await import("@/features/analytics/tracking");
            const { hashOpaqueToken } = await import("@/lib/security/tokens");

            await recordAnalyticsEvent({
              businessId: input.businessId,
              quoteId: input.quoteId,
              eventType: "schedule_prefill_used",
              visitorHash: hashOpaqueToken(`${input.businessId}:${input.actorUserId}`),
              metadata: { scheduleId: prefill.scheduleId, actor: "user" },
            }).catch(() => undefined);
          }
        }

        const discountInCents = input.quoteId && sourceQuote ? sourceQuote.discountInCents : input.discountInCents;
        const taxInCents = input.quoteId && sourceQuote ? sourceQuote.taxInCents : input.taxInCents;
        const taxLabel = input.quoteId && sourceQuote ? sourceQuote.taxLabel : (input.taxLabel ?? null);
        const totals = calculateTotals(items, discountInCents, taxInCents);
        const [latest] = await tx.select({ latest: sql<number>`coalesce(max((nullif(substring(${invoices.invoiceNumber} from '[0-9]+$'), ''))::integer), 0)` }).from(invoices).where(eq(invoices.businessId, input.businessId));
        const invoiceNumber = nextInvoiceNumber(latest?.latest);
        const id = newEntityId();
        const now = new Date();

        await tx.insert(invoices).values({
          id,
          businessId: input.businessId,
          quoteId: input.quoteId ?? null,
          invoiceNumber,
          title: input.title,
          customerName: input.customerName,
          customerEmail: input.customerEmail ?? null,
          customerContactMethod: input.customerContactMethod,
          customerContactHandle: input.customerContactHandle,
          currency: input.currency,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          status: "draft",
          notes: input.notes ?? null,
          paymentTerms: input.paymentTerms ?? null,
          subtotalInCents: totals.subtotalInCents,
          discountInCents: totals.discountInCents,
          taxInCents: totals.taxInCents,
          taxLabel,
          totalInCents: totals.totalInCents,
          createdBy: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        });
        await tx.insert(invoiceLineItems).values(totals.items.map((item) => ({ ...item, businessId: input.businessId, invoiceId: id, createdAt: now, updatedAt: now })));
        await insertInvoiceActivity(tx, { businessId: input.businessId, invoiceId: id, actorUserId: input.actorUserId, type: "invoice.created", summary: `Draft invoice ${invoiceNumber} created.`, metadata: { invoiceNumber, quoteId: input.quoteId ?? null, schedulePrefill } });
        await writeAuditLog(tx, { businessId: input.businessId, actorUserId: input.actorUserId, entityType: "invoice", entityId: id, action: "invoice.created", metadata: { invoiceNumber, quoteId: input.quoteId ?? null, customerName: input.customerName } });
        return { id, invoiceNumber, existing: false } as const;
      });

      if ("error" in result) return result;
      return result;
    } catch (error) {
      if (attempt < 4 && isUniqueInvoiceConflict(error)) continue;
      throw error;
    }
  }
  throw new Error("Failed to allocate a unique invoice number.");
}

export async function markInvoiceSentForBusiness({ businessId, invoiceId, actorUserId, sendMethod }: { businessId: string; invoiceId: string; actorUserId: string; sendMethod: "requo" | "manual" }) {
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId), isNull(invoices.deletedAt))).for("update");
    if (!invoice) return null;
    if (invoice.status === "voided") return { changed: false, status: "voided" as const };
    if (invoice.status !== "draft") return { changed: false, status: invoice.status };
    const now = new Date();
    await tx.update(invoices).set({ status: "sent", sentAt: now, updatedAt: now }).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)));
    // `sendMethod` mirrors the quote send activity so the Requo email
    // budget can count both document types against the same allowance.
    await insertInvoiceActivity(tx, { businessId, invoiceId, actorUserId, type: "invoice.sent", summary: sendMethod === "manual" ? `Invoice ${invoice.invoiceNumber} marked as sent after manual delivery.` : `Invoice ${invoice.invoiceNumber} sent with Requo email.`, metadata: { invoiceNumber: invoice.invoiceNumber, sendMethod } });
    await writeAuditLog(tx, { businessId, actorUserId, entityType: "invoice", entityId: invoiceId, action: "invoice.sent", metadata: { invoiceNumber: invoice.invoiceNumber, sendMethod }, createdAt: now });
    return { changed: true, status: "sent" as const };
  });
}

export type RecordPaymentResult =
  | { error: string }
  | { paymentId: string; paymentNumber: string; status: InvoiceStatus; paidInCents: number; balanceInCents: number; duplicate?: boolean };

export async function recordPaymentForBusiness({ businessId, invoiceId, actorUserId, amountInCents, paymentDate, method, reference, notes, idempotencyKey, currency }: { businessId: string; invoiceId: string; actorUserId: string; amountInCents: number; paymentDate: string; method: PaymentMethod; reference?: string | null; notes?: string | null; idempotencyKey?: string | null; currency?: string | null }): Promise<RecordPaymentResult> {
  const trimmedKey = idempotencyKey?.trim() || null;
  if (trimmedKey && !/^[0-9a-fA-F-]{8,64}$/.test(trimmedKey)) return { error: "Invalid idempotency key." } as const;
  return db.transaction(async (tx) => {
    if (trimmedKey) {
      const [existing] = await tx.select().from(payments).where(and(eq(payments.businessId, businessId), eq(payments.idempotencyKey, trimmedKey))).limit(1);
      if (existing) {
        const [inv] = await tx.select().from(invoices).where(and(eq(invoices.id, existing.invoiceId), eq(invoices.businessId, businessId), isNull(invoices.deletedAt))).limit(1);
        if (!inv) return { error: "Invoice not found." } as const;
        const [paid] = await tx.select({ total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)` }).from(payments).where(and(eq(payments.invoiceId, inv.id), eq(payments.businessId, businessId), isNull(payments.voidedAt)));
        const state = calculateInvoicePaymentState({ totalInCents: inv.totalInCents, paidInCents: Number(paid?.total ?? 0), dueDate: inv.dueDate, lifecycleStatus: inv.status });
        return { paymentId: existing.id, paymentNumber: existing.paymentNumber, status: state.status, paidInCents: state.paidInCents, balanceInCents: state.balanceInCents, duplicate: true } as const;
      }
    }
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId), isNull(invoices.deletedAt))).for("update");
    if (!invoice) return { error: "Invoice not found." } as const;
    if (invoice.status === "draft") return { error: "Mark the invoice as sent before recording a payment." } as const;
    if (invoice.status === "voided") return { error: "Void invoices cannot receive payments." } as const;
    if (currency && currency !== invoice.currency) return { error: `Payment currency (${currency}) does not match the invoice currency (${invoice.currency}).` } as const;
    if (!Number.isInteger(amountInCents) || amountInCents <= 0) return { error: "Payment amount must be greater than zero." } as const;
    if (paymentDate > getTodayUtcDateString()) return { error: "Payment date cannot be in the future." } as const;
    if (method === "other" && !notes?.trim()) return { error: "Add a note describing this payment method." } as const;

    const [paid] = await tx.select({ total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)` }).from(payments).where(and(eq(payments.invoiceId, invoiceId), eq(payments.businessId, businessId), isNull(payments.voidedAt)));
    const current = calculateInvoicePaymentState({ totalInCents: invoice.totalInCents, paidInCents: Number(paid?.total ?? 0), dueDate: invoice.dueDate, lifecycleStatus: invoice.status });
    if (amountInCents > current.balanceInCents) {
      return {
        error: `Payment exceeds the invoice balance due. Balance due: ${formatQuoteMoney(current.balanceInCents, invoice.currency)}. Payment entered: ${formatQuoteMoney(amountInCents, invoice.currency)}.`,
      } as const;
    }

    const allocated = await allocatePaymentNumber(tx, businessId, paymentDate);
    if ("error" in allocated) return allocated;

    const now = new Date();
    const paymentId = newEntityId();
    try {
      await tx.insert(payments).values({ id: paymentId, businessId, invoiceId, paymentNumber: allocated.paymentNumber, idempotencyKey: trimmedKey, source: "manual", amountInCents, paymentDate, method, reference: reference?.trim() || null, notes: notes?.trim() || null, createdBy: actorUserId, createdAt: now, updatedAt: now });
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "23505" && trimmedKey) {
        const [replay] = await tx.select().from(payments).where(and(eq(payments.businessId, businessId), eq(payments.idempotencyKey, trimmedKey))).limit(1);
        if (replay) {
          const [paidAfter] = await tx.select({ total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)` }).from(payments).where(and(eq(payments.invoiceId, replay.invoiceId), eq(payments.businessId, businessId), isNull(payments.voidedAt)));
          const replayState = calculateInvoicePaymentState({ totalInCents: invoice.totalInCents, paidInCents: Number(paidAfter?.total ?? 0), dueDate: invoice.dueDate, lifecycleStatus: invoice.status });
          return { paymentId: replay.id, paymentNumber: replay.paymentNumber, status: replayState.status, paidInCents: replayState.paidInCents, balanceInCents: replayState.balanceInCents, duplicate: true } as const;
        }
      }
      throw error;
    }
    const next = calculateInvoicePaymentState({ totalInCents: invoice.totalInCents, paidInCents: current.paidInCents + amountInCents, dueDate: invoice.dueDate, lifecycleStatus: invoice.status });
    await tx.update(invoices).set({ status: next.status, updatedAt: now }).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)));
    await insertInvoiceActivity(tx, { businessId, invoiceId, actorUserId, type: "invoice.payment_recorded", summary: `Payment ${allocated.paymentNumber} recorded: ${formatQuoteMoney(amountInCents, invoice.currency)} via ${method}.`, metadata: { paymentId, paymentNumber: allocated.paymentNumber, amountInCents, method, status: next.status } });
    if (next.status === "paid") {
      await insertInvoiceActivity(tx, { businessId, invoiceId, actorUserId, type: "invoice.paid", summary: `Invoice ${invoice.invoiceNumber} is paid in full.`, metadata: { invoiceNumber: invoice.invoiceNumber } });
      await insertBusinessNotification(tx, {
        businessId,
        invoiceId,
        type: "invoice_paid",
        title: `Invoice ${invoice.invoiceNumber} is paid`,
        summary: `${invoice.customerName} paid ${invoice.invoiceNumber} in full.`,
        metadata: {
          invoiceId,
          invoiceNumber: invoice.invoiceNumber,
          customerName: invoice.customerName,
          amountInCents: invoice.totalInCents,
        },
        now,
      });
    }
    await writeAuditLog(tx, { businessId, actorUserId, entityType: "payment", entityId: paymentId, action: "payment.recorded", metadata: { invoiceId, invoiceNumber: invoice.invoiceNumber, paymentNumber: allocated.paymentNumber, amountInCents, method, idempotencyKey: trimmedKey }, createdAt: now });
    if (next.status === "paid") await writeAuditLog(tx, { businessId, actorUserId, entityType: "invoice", entityId: invoiceId, action: "invoice.paid", metadata: { invoiceNumber: invoice.invoiceNumber }, createdAt: now });
    return { paymentId, paymentNumber: allocated.paymentNumber, status: next.status, paidInCents: next.paidInCents, balanceInCents: next.balanceInCents } as const;
  });
}

export type VoidPaymentResult = null | { error: string } | { status: InvoiceStatus; paymentNumber: string };

export async function voidPaymentForBusiness({ businessId, paymentId, actorUserId, reason }: { businessId: string; paymentId: string; actorUserId: string; reason?: string | null }): Promise<VoidPaymentResult> {
  const normalized = normalizeVoidReason(reason);
  if (!normalized) return { error: "A void reason is required." } as const;
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(payments).where(and(eq(payments.id, paymentId), eq(payments.businessId, businessId), isNull(payments.voidedAt))).for("update");
    if (!payment) return null;
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, payment.invoiceId), eq(invoices.businessId, businessId), isNull(invoices.deletedAt))).for("update");
    if (!invoice || invoice.status === "voided") return null;
    const now = new Date();
    await tx.update(payments).set({ voidedAt: now, voidedBy: actorUserId, voidReason: normalized, updatedAt: now }).where(and(eq(payments.id, paymentId), eq(payments.businessId, businessId)));
    const [paid] = await tx.select({ total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)` }).from(payments).where(and(eq(payments.invoiceId, invoice.id), eq(payments.businessId, businessId), isNull(payments.voidedAt)));
    const next = calculateInvoicePaymentState({ totalInCents: invoice.totalInCents, paidInCents: Number(paid?.total ?? 0), dueDate: invoice.dueDate, lifecycleStatus: invoice.status });
    await tx.update(invoices).set({ status: next.status, updatedAt: now }).where(and(eq(invoices.id, invoice.id), eq(invoices.businessId, businessId)));
    await insertInvoiceActivity(tx, { businessId, invoiceId: invoice.id, actorUserId, type: "payment.voided", summary: `Payment ${payment.paymentNumber} voided: ${formatQuoteMoney(payment.amountInCents, invoice.currency)} via ${payment.method}. Reason: ${getVoidReasonLabel(normalized)}.`, metadata: { paymentId, paymentNumber: payment.paymentNumber, amountInCents: payment.amountInCents, reason: normalized } });
    await insertInvoiceActivity(tx, { businessId, invoiceId: invoice.id, actorUserId, type: "invoice.payment_voided", summary: `Payment ${payment.paymentNumber} voided on ${invoice.invoiceNumber}.`, metadata: { paymentId, paymentNumber: payment.paymentNumber, reason: normalized, status: next.status } });
    await writeAuditLog(tx, { businessId, actorUserId, entityType: "payment", entityId: paymentId, action: "payment.voided", metadata: { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, paymentNumber: payment.paymentNumber, reason: normalized }, createdAt: now });
    return { status: next.status, paymentNumber: payment.paymentNumber } as const;
  });
}

export async function voidInvoiceForBusiness({ businessId, invoiceId, actorUserId, reason }: { businessId: string; invoiceId: string; actorUserId: string; reason?: string | null }) {
  const normalized = normalizeVoidReason(reason);
  if (!normalized) return { error: "A void reason is required." } as const;
  return db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId), isNull(invoices.deletedAt))).for("update");
    if (!invoice || invoice.status === "voided") return null;
    const [paid] = await tx.select({ total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)` }).from(payments).where(and(eq(payments.invoiceId, invoiceId), eq(payments.businessId, businessId), isNull(payments.voidedAt)));
    if (Number(paid?.total ?? 0) > 0) return { error: "Void all recorded payments before voiding this invoice." } as const;
    const now = new Date();
    await tx.update(invoices).set({ status: "voided", voidedAt: now, voidedBy: actorUserId, voidReason: normalized, updatedAt: now }).where(and(eq(invoices.id, invoiceId), eq(invoices.businessId, businessId)));
    await insertInvoiceActivity(tx, { businessId, invoiceId, actorUserId, type: "invoice.voided", summary: `Invoice ${invoice.invoiceNumber} voided. Reason: ${getVoidReasonLabel(normalized)}.`, metadata: { reason: normalized } });
    await writeAuditLog(tx, { businessId, actorUserId, entityType: "invoice", entityId: invoiceId, action: "invoice.voided", metadata: { invoiceNumber: invoice.invoiceNumber, reason: normalized }, createdAt: now });
    return { changed: true } as const;
  });
}

type UpdateInvoiceDraftInput = {
  businessId: string;
  invoiceId: string;
  actorUserId: string;
  title: string;
  customerName: string;
  customerEmail?: string | null;
  issueDate: string;
  dueDate: string;
  notes?: string | null;
  paymentTerms?: string | null;
  discountInCents: number;
  taxInCents: number;
  taxLabel?: string | null;
  items: Array<{ description: string; quantity: number; unitPriceInCents: number }>;
};

export async function updateInvoiceDraftForBusiness(input: UpdateInvoiceDraftInput) {
  return db.transaction(async (tx) => {
    const [invoice] = await tx
      .select()
      .from(invoices)
      .where(and(eq(invoices.id, input.invoiceId), eq(invoices.businessId, input.businessId), isNull(invoices.deletedAt)))
      .for("update");
    if (!invoice) return null;
    if (invoice.status !== "draft") return { error: "Only draft invoices can be edited." } as const;

    const now = new Date();
    if (invoice.quoteId) {
      await tx
        .update(invoices)
        .set({
          title: input.title,
          customerName: input.customerName,
          customerEmail: input.customerEmail ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          notes: input.notes ?? null,
          paymentTerms: input.paymentTerms ?? null,
          updatedAt: now,
        })
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.businessId, input.businessId)));
    } else {
      const totals = calculateTotals(input.items, input.discountInCents, input.taxInCents);
      await tx
        .update(invoices)
        .set({
          title: input.title,
          customerName: input.customerName,
          customerEmail: input.customerEmail ?? null,
          issueDate: input.issueDate,
          dueDate: input.dueDate,
          notes: input.notes ?? null,
          paymentTerms: input.paymentTerms ?? null,
          subtotalInCents: totals.subtotalInCents,
          discountInCents: totals.discountInCents,
          taxInCents: totals.taxInCents,
          taxLabel: input.taxLabel ?? null,
          totalInCents: totals.totalInCents,
          updatedAt: now,
        })
        .where(and(eq(invoices.id, input.invoiceId), eq(invoices.businessId, input.businessId)));
      await tx.delete(invoiceLineItems).where(and(eq(invoiceLineItems.invoiceId, input.invoiceId), eq(invoiceLineItems.businessId, input.businessId)));
      await tx.insert(invoiceLineItems).values(
        totals.items.map((item) => ({ ...item, businessId: input.businessId, invoiceId: input.invoiceId, createdAt: now, updatedAt: now })),
      );
    }
    await insertInvoiceActivity(tx, {
      businessId: input.businessId,
      invoiceId: input.invoiceId,
      actorUserId: input.actorUserId,
      type: "invoice.updated",
      summary: `Draft invoice ${invoice.invoiceNumber} updated.`,
      metadata: { invoiceNumber: invoice.invoiceNumber },
    });
    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      entityType: "invoice",
      entityId: input.invoiceId,
      action: "invoice.updated",
      metadata: { invoiceNumber: invoice.invoiceNumber, customerName: input.customerName },
      createdAt: now,
    });
    return { changed: true, invoiceNumber: invoice.invoiceNumber } as const;
  });
}

// ---------------------------------------------------------------------------
// Bulk mutations for invoice list actions
// ---------------------------------------------------------------------------

export async function bulkVoidInvoicesForBusiness({
  businessId,
  invoiceIds,
  actorUserId,
  reason,
}: {
  businessId: string;
  invoiceIds: string[];
  actorUserId: string;
  reason?: string | null;
}): Promise<{ affected: number; skipped: number }> {
  const normalized = normalizeVoidReason(reason);
  if (!normalized || invoiceIds.length === 0) {
    return { affected: 0, skipped: invoiceIds.length };
  }

  const now = new Date();

  // One transaction, invoice rows locked `FOR UPDATE`.
  //
  // `recordPaymentForBusiness` takes the same invoice lock before it checks
  // the invoice status and before it inserts the payment, so the two paths
  // serialize: either the payment commits first and this void skips the
  // invoice because it carries a balance, or this void commits first and the
  // payment path then sees a voided invoice and refuses the payment.
  // Voiding an invoice that carries a recorded payment would strand that
  // payment, because a voided invoice's payments can no longer be voided.
  const affected = await db.transaction(async (tx) => {
    const candidates = await tx
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        status: invoices.status,
      })
      .from(invoices)
      .where(
        and(
          eq(invoices.businessId, businessId),
          inArray(invoices.id, invoiceIds),
          isNull(invoices.deletedAt),
        ),
      )
      .for("update");

    const voidableIds = candidates
      .filter((invoice) => invoice.status !== "voided")
      .map((invoice) => invoice.id);

    if (voidableIds.length === 0) {
      return 0;
    }

    // Voiding requires zero recorded (non-voided) payments, mirroring
    // `voidInvoiceForBusiness`. Re-read inside the lock so a payment that
    // committed while the selection was running is still counted.
    const paidTotals = await tx
      .select({
        invoiceId: payments.invoiceId,
        total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)`,
      })
      .from(payments)
      .where(
        and(
          eq(payments.businessId, businessId),
          inArray(payments.invoiceId, voidableIds),
          isNull(payments.voidedAt),
        ),
      )
      .groupBy(payments.invoiceId);

    const paidByInvoiceId = new Map(
      paidTotals.map((row) => [row.invoiceId, Number(row.total ?? 0)]),
    );
    const eligibleIds = voidableIds.filter(
      (id) => (paidByInvoiceId.get(id) ?? 0) <= 0,
    );

    if (eligibleIds.length === 0) {
      return 0;
    }

    const updated = await tx
      .update(invoices)
      .set({
        status: "voided",
        voidedAt: now,
        voidedBy: actorUserId,
        voidReason: normalized,
        updatedAt: now,
      })
      .where(
        and(
          eq(invoices.businessId, businessId),
          inArray(invoices.id, eligibleIds),
          isNull(invoices.deletedAt),
        ),
      )
      .returning({ id: invoices.id, invoiceNumber: invoices.invoiceNumber });

    if (updated.length > 0) {
      await tx.insert(activityLogs).values(
        updated.map((row) => ({
          id: newEntityId(),
          businessId,
          actorUserId,
          type: "invoice.voided",
          summary: `Invoice ${row.invoiceNumber} voided. Reason: ${getVoidReasonLabel(normalized)}.`,
          metadata: { invoiceId: row.id, reason: normalized },
          createdAt: now,
          updatedAt: now,
        })),
      );

      for (const row of updated) {
        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "invoice",
          entityId: row.id,
          action: "invoice.voided",
          metadata: { invoiceNumber: row.invoiceNumber, reason: normalized },
          createdAt: now,
        });
      }
    }

    return updated.length;
  });

  return {
    affected,
    skipped: invoiceIds.length - affected,
  };
}
