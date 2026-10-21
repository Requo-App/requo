import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/lib/db/business-access", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/db/business-access")>(),
  getOperationalBusinessActionContext: async () => ({
    ok: true,
    user: { id: ids.ownerUserId },
    businessContext: { business: { id: ids.businessId } },
  }),
}));

import { updateInvoiceDraftAction } from "@/features/invoices/actions";
import {
  bulkVoidInvoicesForBusiness,
  createInvoiceForBusiness,
  markInvoiceSentForBusiness,
  recordPaymentForBusiness,
  updateInvoiceDraftForBusiness,
  voidInvoiceForBusiness,
} from "@/features/invoices/mutations";
import { getInvoiceListForBusiness } from "@/features/invoices/queries";
import { calculateInvoicePaymentState } from "@/features/invoices/utils";
import {
  createQuoteForBusiness,
  markQuoteSentForBusiness,
  respondToPublicQuoteByToken,
} from "@/features/quotes/mutations";
import { getTodayUtcDateString } from "@/features/quotes/utils";
import { getMonthlyRequoDocumentSendCount } from "@/lib/plans/usage";
import {
  activityLogs,
  businessNotifications,
  businessPaymentCounters,
  invoiceLineItems,
  invoices,
  payments,
  quotes,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

const FUTURE = "2099-01-01";
const PAST = "2026-01-15";

function invoiceInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: ids.businessId,
    actorUserId: ids.ownerUserId,
    title: "Service invoice",
    customerName: "John Doe",
    customerEmail: "john@example.com",
    customerContactMethod: "email",
    customerContactHandle: "john@example.com",
    currency: "USD",
    issueDate: "2026-01-01",
    dueDate: FUTURE,
    notes: null,
    paymentTerms: null,
    discountInCents: 0,
    taxInCents: 0,
    taxLabel: null,
    items: [{ description: "Work", quantity: 1, unitPriceInCents: 50000 }],
    ...overrides,
  };
}

async function createInvoice(overrides: Record<string, unknown> = {}) {
  const created = (await createInvoiceForBusiness(
    invoiceInput(overrides),
  )) as { id: string; invoiceNumber: string };

  return created;
}

async function createSentInvoice(overrides: Record<string, unknown> = {}) {
  const created = await createInvoice(overrides);
  await markInvoiceSentForBusiness({
    businessId: ids.businessId,
    invoiceId: created.id,
    actorUserId: ids.ownerUserId,
    sendMethod: "manual",
  });

  return created;
}

async function createAcceptedQuote(discountInCents: number) {
  const created = await createQuoteForBusiness({
    businessId: ids.businessId,
    actorUserId: ids.ownerUserId,
    currency: "USD",
    inquiryId: ids.inquiryId,
    quote: {
      title: "Roof repair package",
      customerName: "Maria Santos",
      customerEmail: "maria@example.com",
      customerContactMethod: "email",
      customerContactHandle: "maria@example.com",
      notes: "Work scheduled in February.",
      validUntil: "2099-12-31",
      discountInCents,
      taxInCents: 0,
      items: [
        {
          id: "line-work",
          description: "Roof repair",
          quantity: 2,
          unitPriceInCents: 250000,
        },
      ],
    },
  });

  const sent = await markQuoteSentForBusiness({
    businessId: ids.businessId,
    quoteId: created!.id,
    actorUserId: ids.ownerUserId,
    sendMethod: "manual",
  });

  await respondToPublicQuoteByToken({
    token: sent!.publicToken!,
    response: "accepted",
    signerName: "Maria Santos",
    confirmed: true,
    expectedVersion: 1,
  });

  return created!.id;
}

async function cleanupInvoiceFixture() {
  const businessIds = [ids.businessId, ids.otherBusinessId, ids.archivedBusinessId];
  await testDb.delete(businessNotifications).where(inArray(businessNotifications.businessId, businessIds));
  await testDb.delete(activityLogs).where(inArray(activityLogs.businessId, businessIds));
  await testDb.delete(payments).where(inArray(payments.businessId, businessIds));
  await testDb.delete(businessPaymentCounters).where(inArray(businessPaymentCounters.businessId, businessIds));
  await testDb.delete(invoiceLineItems).where(inArray(invoiceLineItems.businessId, businessIds));
  await testDb.delete(invoices).where(inArray(invoices.businessId, businessIds));
  await testDb.delete(quotes).where(inArray(quotes.businessId, businessIds));
}

describe("invoice lifecycle", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
    await cleanupInvoiceFixture();
  }, 30_000);

  afterAll(async () => {
    await cleanupInvoiceFixture();
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("keeps the quote's totals when a quote-linked draft is edited", async () => {
    const quoteId = await createAcceptedQuote(5000);
    const created = await createInvoice({ quoteId });

    const [stored] = await testDb.select().from(invoices).where(eq(invoices.id, created.id));
    expect(stored.quoteId).toBe(quoteId);
    expect(stored.discountInCents).toBe(5000);
    expect(stored.subtotalInCents).toBe(500000);

    // A quote-linked invoice keeps the quote's line items and totals, so the
    // update only touches the customer-facing fields. The submitted totals
    // deliberately differ from the quote's, so the assertion can tell the
    // quote-linked branch apart from the branch that applies the submitted
    // totals.
    const formData = new FormData();
    for (const [key, value] of Object.entries({
      title: "Roof repair - February",
      customerName: "Maria Santos",
      customerEmail: "maria@example.com",
      issueDate: "2026-02-01",
      dueDate: "2026-03-01",
      notes: "Work scheduled.",
      paymentTerms: "Due within 14 days.",
      discount: "9999.99",
      tax: "123.45",
      taxLabel: "Tampered",
      items: JSON.stringify([null, { description: "", quantity: -1, unitPriceInCents: "invalid" }]),
    })) formData.set(key, value);

    const result = await updateInvoiceDraftAction(created.id, {}, formData);

    expect(result).toEqual({ success: "Invoice updated.", invoiceId: created.id, invoiceNumber: created.invoiceNumber });

    const [updated] = await testDb.select().from(invoices).where(eq(invoices.id, created.id));
    expect(updated.title).toBe("Roof repair - February");
    expect(updated.discountInCents).toBe(5000);
    expect(updated.taxInCents).toBe(0);
    expect(updated.subtotalInCents).toBe(500000);
    expect(updated.totalInCents).toBe(495000);

    const items = await testDb.select().from(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, created.id));
    expect(items).toHaveLength(1);
    expect(items[0].description).toBe("Roof repair");
    expect(items[0].lineTotalInCents).toBe(500000);
  });

  it("returns the safe update fallback when the invoice read fails", async () => {
    const select = vi.spyOn(testDb, "select").mockImplementationOnce(() => {
      throw new Error("Failed to query private database details.");
    });

    try {
      await expect(updateInvoiceDraftAction("missing_invoice", {}, new FormData())).resolves.toEqual({
        error: "Unable to update invoice. Please try again.",
      });
    } finally {
      select.mockRestore();
    }
  });

  it("preserves the missing invoice response", async () => {
    await expect(updateInvoiceDraftAction("missing_invoice", {}, new FormData())).resolves.toEqual({
      error: "Invoice not found.",
    });
  });

  it("counts a Requo invoice send against the shared email allowance", async () => {
    const before = await getMonthlyRequoDocumentSendCount(ids.businessId);

    const manual = await createInvoice();
    await markInvoiceSentForBusiness({
      businessId: ids.businessId,
      invoiceId: manual.id,
      actorUserId: ids.ownerUserId,
      sendMethod: "manual",
    });
    expect(await getMonthlyRequoDocumentSendCount(ids.businessId)).toBe(before);

    const requo = await createInvoice();
    await markInvoiceSentForBusiness({
      businessId: ids.businessId,
      invoiceId: requo.id,
      actorUserId: ids.ownerUserId,
      sendMethod: "requo",
    });
    expect(await getMonthlyRequoDocumentSendCount(ids.businessId)).toBe(before + 1);

    const [activity] = await testDb
      .select()
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.businessId, ids.businessId),
          eq(activityLogs.type, "invoice.sent"),
          sql`${activityLogs.metadata} ->> 'invoiceId' = ${requo.id}`,
        ),
      );
    expect(activity.metadata).toEqual(expect.objectContaining({ sendMethod: "requo" }));
  });

  it("skips invoices that carry a recorded payment when voiding in bulk", async () => {
    const withPayment = await createSentInvoice();
    await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId: withPayment.id,
      actorUserId: ids.ownerUserId,
      amountInCents: 1000,
      paymentDate: "2026-06-02",
      method: "cash",
    });
    const withoutPayment = await createSentInvoice();

    const result = await bulkVoidInvoicesForBusiness({
      businessId: ids.businessId,
      invoiceIds: [withPayment.id, withoutPayment.id],
      actorUserId: ids.ownerUserId,
      reason: "entered_by_mistake",
    });

    expect(result.affected).toBe(1);
    expect(result.skipped).toBe(1);

    const [kept] = await testDb.select().from(invoices).where(eq(invoices.id, withPayment.id));
    expect(kept.status).not.toBe("voided");

    const [voided] = await testDb.select().from(invoices).where(eq(invoices.id, withoutPayment.id));
    expect(voided.status).toBe("voided");
    expect(voided.voidReason).toBe("entered_by_mistake");
  });

  it("does not void another business's invoice", async () => {
    const foreign = await createInvoice({ businessId: ids.otherBusinessId });

    const result = await bulkVoidInvoicesForBusiness({
      businessId: ids.businessId,
      invoiceIds: [foreign.id],
      actorUserId: ids.ownerUserId,
      reason: "duplicate_entry",
    });

    expect(result.affected).toBe(0);

    const [stored] = await testDb.select().from(invoices).where(eq(invoices.id, foreign.id));
    expect(stored.status).toBe("draft");
  });

  it("does not edit another business's invoice", async () => {
    const foreign = await createInvoice({ businessId: ids.otherBusinessId });

    const result = await updateInvoiceDraftForBusiness({
      businessId: ids.businessId,
      invoiceId: foreign.id,
      actorUserId: ids.ownerUserId,
      title: "Hijacked",
      customerName: "Someone else",
      customerEmail: null,
      issueDate: "2026-01-01",
      dueDate: "2026-02-01",
      notes: null,
      paymentTerms: null,
      discountInCents: 0,
      taxInCents: 0,
      taxLabel: null,
      items: [{ description: "Work", quantity: 1, unitPriceInCents: 1000 }],
    });

    expect(result).toBeNull();

    const [stored] = await testDb.select().from(invoices).where(eq(invoices.id, foreign.id));
    expect(stored.title).toBe("Service invoice");
  });

  it("requires a reason to void an invoice", async () => {
    const created = await createSentInvoice();

    expect(
      await voidInvoiceForBusiness({
        businessId: ids.businessId,
        invoiceId: created.id,
        actorUserId: ids.ownerUserId,
        reason: null,
      }),
    ).toEqual({ error: "A void reason is required." });

    const [stored] = await testDb.select().from(invoices).where(eq(invoices.id, created.id));
    expect(stored.status).toBe("sent");
  });

  it("filters the invoice list by the effective status", async () => {
    const draft = await createInvoice();
    const unpaid = await createSentInvoice();
    const overdue = await createSentInvoice({ dueDate: PAST });
    const partiallyPaid = await createSentInvoice();
    await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId: partiallyPaid.id,
      actorUserId: ids.ownerUserId,
      amountInCents: 1000,
      paymentDate: "2026-06-02",
      method: "cash",
    });
    const paid = await createSentInvoice();
    await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId: paid.id,
      actorUserId: ids.ownerUserId,
      amountInCents: 50000,
      paymentDate: "2026-06-02",
      method: "cash",
    });
    const voided = await createSentInvoice();
    await voidInvoiceForBusiness({
      businessId: ids.businessId,
      invoiceId: voided.id,
      actorUserId: ids.ownerUserId,
      reason: "duplicate_entry",
    });

    // The SQL effective-status expression and the TypeScript derivation are
    // twins of the same rule — derive the expectation from the stored rows
    // and assert both agree for every invoice.
    const today = getTodayUtcDateString();
    const stored = await testDb
      .select({
        id: invoices.id,
        status: invoices.status,
        totalInCents: invoices.totalInCents,
        dueDate: invoices.dueDate,
      })
      .from(invoices)
      .where(eq(invoices.businessId, ids.businessId));
    const paidRows = await testDb
      .select({
        invoiceId: payments.invoiceId,
        total: sql<number>`coalesce(sum(${payments.amountInCents}), 0)`,
      })
      .from(payments)
      .where(and(eq(payments.businessId, ids.businessId), isNull(payments.voidedAt)))
      .groupBy(payments.invoiceId);
    const paidByInvoice = new Map(
      paidRows.map((row) => [row.invoiceId, Number(row.total ?? 0)]),
    );

    const expectedByStatus = new Map<string, string[]>();
    for (const row of stored) {
      const derived = calculateInvoicePaymentState({
        totalInCents: row.totalInCents,
        paidInCents: paidByInvoice.get(row.id) ?? 0,
        dueDate: row.dueDate,
        lifecycleStatus: row.status,
        today,
      }).status;
      expectedByStatus.set(derived, [
        ...(expectedByStatus.get(derived) ?? []),
        row.id,
      ]);
    }

    // Every state the derivation can produce is reachable through a filter —
    // no filter option is a permanent no-op.
    expect([...expectedByStatus.keys()].sort()).toEqual([
      "draft",
      "overdue",
      "paid",
      "partially_paid",
      "unpaid",
      "voided",
    ]);
    expect(expectedByStatus.get("draft")).toEqual([draft.id]);
    expect(expectedByStatus.get("unpaid")).toEqual([unpaid.id]);
    expect(expectedByStatus.get("overdue")).toEqual([overdue.id]);
    expect(expectedByStatus.get("partially_paid")).toEqual([partiallyPaid.id]);
    expect(expectedByStatus.get("paid")).toEqual([paid.id]);
    expect(expectedByStatus.get("voided")).toEqual([voided.id]);

    for (const [status, expectedIds] of expectedByStatus) {
      const rows = await getInvoiceListForBusiness({
        businessId: ids.businessId,
        filters: { q: undefined, status: status as never, sort: "newest", page: 1 },
        page: 1,
        pageSize: 50,
      });

      expect(new Set(rows.map((row) => row.id))).toEqual(new Set(expectedIds));
    }
  });
});
