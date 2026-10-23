import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";

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

import {
  createInvoiceForBusiness,
  markInvoiceSentForBusiness,
  recordPaymentForBusiness,
  voidInvoiceForBusiness,
  voidPaymentForBusiness,
} from "@/features/invoices/mutations";
import {
  getInvoiceActivityForBusiness,
  getPaymentDetailForBusiness,
  getPaymentListForBusiness,
} from "@/features/invoices/queries";
import { getPaymentReceiptData } from "@/features/invoices/receipt";
import {
  activityLogs,
  businessNotifications,
  businessPaymentCounters,
  invoiceLineItems,
  invoices,
  payments,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "test_payment_lifecycle";
let ids: WorkflowFixtureIds;

function invoiceInput(totalInCents: number) {
  return {
    businessId: ids.businessId,
    actorUserId: ids.ownerUserId,
    title: "Service invoice",
    customerName: "John Doe",
    customerEmail: "john@example.com",
    customerContactMethod: "email",
    customerContactHandle: "john@example.com",
    currency: "USD",
    issueDate: "2026-06-01",
    dueDate: "2099-01-01",
    notes: null,
    paymentTerms: null,
    discountInCents: 0,
    taxInCents: 0,
    taxLabel: null,
    items: [{ description: "Work", quantity: 1, unitPriceInCents: totalInCents }],
  };
}

async function createSentInvoice(totalInCents = 50000) {
  const created = (await createInvoiceForBusiness(invoiceInput(totalInCents))) as { id: string };
  await markInvoiceSentForBusiness({ businessId: ids.businessId, invoiceId: created.id, actorUserId: ids.ownerUserId, sendMethod: "manual" });
  return created.id;
}

async function cleanupPaymentFixture() {
  const businessIds = [ids.businessId, ids.otherBusinessId, ids.archivedBusinessId];
  await testDb.delete(businessNotifications).where(inArray(businessNotifications.businessId, businessIds));
  await testDb.delete(activityLogs).where(inArray(activityLogs.businessId, businessIds));
  await testDb.delete(payments).where(inArray(payments.businessId, businessIds));
  await testDb.delete(businessPaymentCounters).where(inArray(businessPaymentCounters.businessId, businessIds));
  await testDb.delete(invoiceLineItems).where(inArray(invoiceLineItems.businessId, businessIds));
  await testDb.delete(invoices).where(inArray(invoices.businessId, businessIds));
}

describe("manual payment lifecycle", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
    await cleanupPaymentFixture();
  }, 30_000);

  afterAll(async () => {
    await cleanupPaymentFixture();
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("records a full payment and marks the invoice paid", async () => {
    const invoiceId = await createSentInvoice(50000);
    const result = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 50000,
      paymentDate: "2026-06-02",
      method: "bank_transfer",
      reference: "BDO-829183",
    });

    expect(result).toEqual(expect.objectContaining({ status: "paid", paidInCents: 50000, balanceInCents: 0 }));
    expect((result as { paymentNumber: string }).paymentNumber).toMatch(/^PAY-2026-\d{4}$/);

    const [stored] = await testDb.select().from(payments).where(eq(payments.id, (result as { paymentId: string }).paymentId));
    expect(stored.source).toBe("manual");
    expect(stored.reference).toBe("BDO-829183");

    const notes = await testDb
      .select()
      .from(businessNotifications)
      .where(and(eq(businessNotifications.businessId, ids.businessId), eq(businessNotifications.type, "invoice_paid")));
    expect(notes).toHaveLength(1);
  });

  it("records partial payments and tracks the remaining balance", async () => {
    const invoiceId = await createSentInvoice(50000);
    const first = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 20000,
      paymentDate: "2026-06-02",
      method: "bank_transfer",
    });
    expect(first).toEqual(expect.objectContaining({ status: "partially_paid", paidInCents: 20000, balanceInCents: 30000 }));

    const second = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 30000,
      paymentDate: "2026-06-03",
      method: "gcash",
      reference: "8A72F9",
    });
    expect(second).toEqual(expect.objectContaining({ status: "paid", paidInCents: 50000, balanceInCents: 0 }));
    expect((second as { paymentNumber: string }).paymentNumber).not.toBe((first as { paymentNumber: string }).paymentNumber);
  });

  it("supports many small payments until fully paid", async () => {
    const invoiceId = await createSentInvoice(100000);
    for (const amount of [25000, 25000, 25000]) {
      const result = await recordPaymentForBusiness({
        businessId: ids.businessId,
        invoiceId,
        actorUserId: ids.ownerUserId,
        amountInCents: amount,
        paymentDate: "2026-06-02",
        method: "cash",
      });
      expect("error" in result).toBe(false);
    }
    const last = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 25000,
      paymentDate: "2026-06-03",
      method: "check",
      reference: "CHK-000192",
    });
    expect(last).toEqual(expect.objectContaining({ status: "paid", balanceInCents: 0 }));
  });

  it("voiding a full payment reopens the invoice", async () => {
    const invoiceId = await createSentInvoice(50000);
    const recorded = (await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 50000,
      paymentDate: "2026-06-02",
      method: "cash",
    })) as { paymentId: string };
    const voided = await voidPaymentForBusiness({
      businessId: ids.businessId,
      paymentId: recorded.paymentId,
      actorUserId: ids.ownerUserId,
      reason: "duplicate_entry",
    });
    expect(voided).toEqual(expect.objectContaining({ status: "unpaid" }));

    const [stored] = await testDb.select().from(payments).where(eq(payments.id, recorded.paymentId));
    expect(stored.voidedAt).not.toBeNull();
    expect(stored.voidReason).toBe("duplicate_entry");
  });

  it("voiding a partial payment returns the invoice to unpaid", async () => {
    const invoiceId = await createSentInvoice(50000);
    const recorded = (await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 20000,
      paymentDate: "2026-06-02",
      method: "gcash",
    })) as { paymentId: string };
    const voided = await voidPaymentForBusiness({
      businessId: ids.businessId,
      paymentId: recorded.paymentId,
      actorUserId: ids.ownerUserId,
      reason: "wrong_amount|Charged 20000 instead of 15000",
    });
    expect(voided).toEqual(expect.objectContaining({ status: "unpaid" }));
  });

  it("rejects overpayments with the remaining balance", async () => {
    const invoiceId = await createSentInvoice(50000);
    await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 40000,
      paymentDate: "2026-06-02",
      method: "cash",
    });
    const result = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 15000,
      paymentDate: "2026-06-03",
      method: "cash",
    });
    expect(result).toEqual({
      error: expect.stringContaining("invoice balance due"),
    });
  });

  it("rejects future payment dates", async () => {
    const invoiceId = await createSentInvoice(50000);
    const result = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 1000,
      paymentDate: "2099-12-31",
      method: "cash",
    });
    expect(result).toEqual({ error: "Payment date cannot be in the future." });
  });

  it("rejects payments on draft and voided invoices", async () => {
    const draft = (await createInvoiceForBusiness(invoiceInput(50000))) as { id: string };
    const onDraft = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId: draft.id,
      actorUserId: ids.ownerUserId,
      amountInCents: 1000,
      paymentDate: "2026-06-02",
      method: "cash",
    });
    expect(onDraft).toEqual({ error: "Mark the invoice as sent before recording a payment." });

    const sentId = await createSentInvoice(5000);
    await voidInvoiceForBusiness({ businessId: ids.businessId, invoiceId: sentId, actorUserId: ids.ownerUserId, reason: "entered_by_mistake" });
    const onVoided = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId: sentId,
      actorUserId: ids.ownerUserId,
      amountInCents: 1000,
      paymentDate: "2026-06-02",
      method: "cash",
    });
    expect(onVoided).toEqual({ error: "Void invoices cannot receive payments." });
  });

  it("replays duplicate submissions by idempotency key instead of double-recording", async () => {
    const invoiceId = await createSentInvoice(50000);
    const key = "123e4567-e89b-12d3-a456-426614174001";
    const first = (await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 20000,
      paymentDate: "2026-06-02",
      method: "bank_transfer",
      idempotencyKey: key,
    })) as { paymentId: string; paymentNumber: string };
    const second = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 20000,
      paymentDate: "2026-06-02",
      method: "bank_transfer",
      idempotencyKey: key,
    });
    expect(second).toEqual(expect.objectContaining({ paymentId: first.paymentId, paymentNumber: first.paymentNumber, duplicate: true }));

    const rows = await testDb.select().from(payments).where(eq(payments.invoiceId, invoiceId));
    expect(rows).toHaveLength(1);
  });

  it("rejects a concurrent idempotency key reused on another invoice", async () => {
    const firstInvoiceId = await createSentInvoice(5000);
    const secondInvoiceId = await createSentInvoice(5000);
    const key = "123e4567-e89b-12d3-a456-426614174002";
    const params = {
      businessId: ids.businessId,
      actorUserId: ids.ownerUserId,
      amountInCents: 5000,
      paymentDate: "2026-06-02",
      method: "cash" as const,
      idempotencyKey: key,
    };

    const results = await Promise.all([
      recordPaymentForBusiness({ ...params, invoiceId: firstInvoiceId }),
      recordPaymentForBusiness({ ...params, invoiceId: secondInvoiceId }),
    ]);

    const success = results.filter((result) => !("error" in result));
    const failures = results.filter(
      (result) =>
        "error" in result &&
        result.error ===
          "This idempotency key was already used for another invoice.",
    );
    expect(success).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const rows = await testDb
      .select()
      .from(payments)
      .where(eq(payments.idempotencyKey, key));
    expect(rows).toHaveLength(1);
  });

  it("lets exactly one concurrent payment win when both cover the balance", async () => {
    const invoiceId = await createSentInvoice(10000);
    const [a, b] = await Promise.all([
      recordPaymentForBusiness({
        businessId: ids.businessId,
        invoiceId,
        actorUserId: ids.ownerUserId,
        amountInCents: 10000,
        paymentDate: "2026-06-02",
        method: "cash",
      }),
      recordPaymentForBusiness({
        businessId: ids.businessId,
        invoiceId,
        actorUserId: ids.ownerUserId,
        amountInCents: 10000,
        paymentDate: "2026-06-02",
        method: "gcash",
      }),
    ]);
    const successes = [a, b].filter((r) => !("error" in r));
    const failures = [a, b].filter((r) => "error" in r);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const rows = await testDb.select().from(payments).where(eq(payments.invoiceId, invoiceId));
    const active = rows.filter((row) => !row.voidedAt);
    const paid = active.reduce((sum, row) => sum + row.amountInCents, 0);
    expect(paid).toBe(10000);
  });

  it("requires notes for other methods and matching currency", async () => {
    const invoiceId = await createSentInvoice(50000);
    const noNotes = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 1000,
      paymentDate: "2026-06-02",
      method: "other",
    });
    expect(noNotes).toEqual({ error: "Add a note describing this payment method." });

    const wrongCurrency = await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 1000,
      paymentDate: "2026-06-02",
      method: "cash",
      currency: "PHP",
    });
    expect(wrongCurrency).toEqual({ error: expect.stringContaining("does not match the invoice currency") });
  });

  it("requires a void reason and preserves the record", async () => {
    const invoiceId = await createSentInvoice(50000);
    const recorded = (await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 10000,
      paymentDate: "2026-06-02",
      method: "cash",
    })) as { paymentId: string };
    const missing = await voidPaymentForBusiness({
      businessId: ids.businessId,
      paymentId: recorded.paymentId,
      actorUserId: ids.ownerUserId,
    });
    expect(missing).toEqual({ error: "A void reason is required." });

    const rows = await testDb.select().from(payments).where(eq(payments.id, recorded.paymentId));
    expect(rows).toHaveLength(1);
    expect(rows[0].voidedAt).toBeNull();
  });

  it("writes payment activity that is visible on the invoice timeline", async () => {
    const invoiceId = await createSentInvoice(50000);
    const recorded = (await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 20000,
      paymentDate: "2026-06-02",
      method: "bank_transfer",
    })) as { paymentId: string };
    await voidPaymentForBusiness({
      businessId: ids.businessId,
      paymentId: recorded.paymentId,
      actorUserId: ids.ownerUserId,
      reason: "duplicate_entry",
    });

    const activity = await getInvoiceActivityForBusiness({ businessId: ids.businessId, invoiceId });
    const types = activity.map((item) => item.type);
    expect(types).toContain("invoice.payment_recorded");
    expect(types).toContain("payment.voided");
    expect(types).toContain("invoice.payment_voided");
  });

  it("exposes payments in the operational list and detail views", async () => {
    const invoiceId = await createSentInvoice(50000);
    const recorded = (await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 20000,
      paymentDate: "2026-06-02",
      method: "bank_transfer",
      reference: "BDO-1",
    })) as { paymentId: string; paymentNumber: string };

    const list = await getPaymentListForBusiness({
      businessId: ids.businessId,
      filters: { status: "all", method: "all", page: 1 },
      page: 1,
      pageSize: 20,
    });
    expect(list.total).toBe(1);
    expect(list.items[0]).toEqual(expect.objectContaining({ paymentNumber: recorded.paymentNumber, status: "recorded" }));

    const search = await getPaymentListForBusiness({
      businessId: ids.businessId,
      filters: { q: "BDO-1", status: "all", method: "all", page: 1 },
      page: 1,
      pageSize: 20,
    });
    expect(search.total).toBe(1);

    const detail = await getPaymentDetailForBusiness({ businessId: ids.businessId, paymentId: recorded.paymentId });
    expect(detail).toEqual(
      expect.objectContaining({
        paymentNumber: recorded.paymentNumber,
        invoiceBalanceInCents: 30000,
        invoicePaidInCents: 20000,
      }),
    );

    const receipt = getPaymentReceiptData({ businessName: "Acme", payment: detail!, methodLabel: "Bank Transfer" });
    expect(receipt.paymentNumber).toBe(recorded.paymentNumber);
    expect(receipt.invoiceBalanceInCents).toBe(30000);
  });

  it("isolates payments by business", async () => {
    const invoiceId = await createSentInvoice(50000);
    await recordPaymentForBusiness({
      businessId: ids.businessId,
      invoiceId,
      actorUserId: ids.ownerUserId,
      amountInCents: 5000,
      paymentDate: "2026-06-02",
      method: "cash",
    });
    const outsider = await getPaymentListForBusiness({
      businessId: ids.otherBusinessId,
      filters: { status: "all", method: "all", page: 1 },
      page: 1,
      pageSize: 20,
    });
    expect(outsider.total).toBe(0);
  });
}, 60_000);
