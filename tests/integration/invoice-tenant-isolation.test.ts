import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

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
  bulkVoidInvoicesForBusiness,
  createInvoiceForBusiness,
  markInvoiceSentForBusiness,
  recordPaymentForBusiness,
  updateInvoiceDraftForBusiness,
  voidInvoiceForBusiness,
} from "@/features/invoices/mutations";
import {
  getInvoiceExportRowsForBusiness,
  getInvoiceForBusiness,
} from "@/features/invoices/queries";
import { invoices, payments } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

const listFilters = {
  q: undefined,
  status: "all" as const,
  sort: "newest" as const,
  page: 1,
};

function invoiceInput(overrides: Record<string, unknown> = {}) {
  return {
    businessId: ids.businessId,
    actorUserId: ids.ownerUserId,
    title: "Isolation invoice",
    customerName: "Nina Duarte",
    customerEmail: "nina@example.com",
    customerContactMethod: "email",
    customerContactHandle: "nina@example.com",
    currency: "USD",
    issueDate: "2026-04-20",
    dueDate: "2099-12-31",
    notes: null,
    paymentTerms: null,
    discountInCents: 0,
    taxInCents: 0,
    taxLabel: null,
    items: [{ description: "Work", quantity: 1, unitPriceInCents: 50000 }],
    ...overrides,
  };
}

async function createInvoice() {
  const created = (await createInvoiceForBusiness(invoiceInput())) as {
    id: string;
    invoiceNumber: string;
  };

  return created;
}

/**
 * Invoices carry customer billing data and payment state. The server-side
 * `businessId` predicate is the only isolation boundary because the app talks
 * to Postgres as the table owner and bypasses RLS.
 */
describe("invoice tenant isolation", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("does not read or export another business's invoice", async () => {
    const created = await createInvoice();

    expect(
      await getInvoiceForBusiness({
        businessId: ids.otherBusinessId,
        invoiceId: created.id,
      }),
    ).toBeNull();

    const foreignRows = await getInvoiceExportRowsForBusiness({
      businessId: ids.otherBusinessId,
      filters: listFilters,
    });
    expect(foreignRows.map((row) => row.invoiceNumber)).not.toContain(
      created.invoiceNumber,
    );

    const ownRows = await getInvoiceExportRowsForBusiness({
      businessId: ids.businessId,
      filters: listFilters,
    });
    expect(ownRows.map((row) => row.invoiceNumber)).toContain(
      created.invoiceNumber,
    );
  });

  it("does not send, edit, pay, or void another business's invoice", async () => {
    const created = await createInvoice();

    expect(
      await markInvoiceSentForBusiness({
        businessId: ids.otherBusinessId,
        invoiceId: created.id,
        actorUserId: ids.outsiderUserId,
        sendMethod: "manual",
      }),
    ).toBeNull();

    expect(
      await updateInvoiceDraftForBusiness({
        businessId: ids.otherBusinessId,
        invoiceId: created.id,
        actorUserId: ids.outsiderUserId,
        title: "Hijacked invoice",
        customerName: "Nina Duarte",
        customerEmail: "nina@example.com",
        issueDate: "2026-04-20",
        dueDate: "2099-12-31",
        notes: null,
        paymentTerms: null,
        discountInCents: 0,
        taxInCents: 0,
        taxLabel: null,
        items: [{ description: "Work", quantity: 1, unitPriceInCents: 50000 }],
      }),
    ).toBeNull();

    const payableInvoice = await createInvoice();
    expect(
      await markInvoiceSentForBusiness({
        businessId: ids.businessId,
        invoiceId: payableInvoice.id,
        actorUserId: ids.ownerUserId,
        sendMethod: "manual",
      }),
    ).toEqual({ changed: true, status: "sent" });

    const [invoiceBeforePayment] = await testDb
      .select()
      .from(invoices)
      .where(eq(invoices.id, payableInvoice.id));
    const paymentsBefore = await testDb
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, payableInvoice.id))
      .orderBy(payments.id);

    expect(invoiceBeforePayment.status).toBe("sent");
    expect(paymentsBefore).toEqual([]);

    expect(
      await recordPaymentForBusiness({
        businessId: ids.otherBusinessId,
        invoiceId: payableInvoice.id,
        actorUserId: ids.outsiderUserId,
        amountInCents: 1000,
        paymentDate: "2026-04-20",
        method: "cash",
      }),
    ).toEqual({ error: "Invoice not found." });

    const invoicesAfterPayment = await testDb
      .select()
      .from(invoices)
      .where(eq(invoices.id, payableInvoice.id));
    const paymentsAfter = await testDb
      .select()
      .from(payments)
      .where(eq(payments.invoiceId, payableInvoice.id))
      .orderBy(payments.id);

    expect(invoicesAfterPayment).toEqual([invoiceBeforePayment]);
    expect(paymentsAfter).toEqual(paymentsBefore);

    expect(
      await voidInvoiceForBusiness({
        businessId: ids.otherBusinessId,
        invoiceId: created.id,
        actorUserId: ids.outsiderUserId,
        reason: "duplicate_entry",
      }),
    ).toBeNull();

    expect(
      await bulkVoidInvoicesForBusiness({
        businessId: ids.otherBusinessId,
        invoiceIds: [created.id],
        actorUserId: ids.outsiderUserId,
        reason: "duplicate_entry",
      }),
    ).toEqual({ affected: 0, skipped: 1 });

    const [stored] = await testDb
      .select({
        title: invoices.title,
        status: invoices.status,
        voidedAt: invoices.voidedAt,
      })
      .from(invoices)
      .where(eq(invoices.id, created.id))
      .limit(1);

    expect(stored.title).toBe("Isolation invoice");
    expect(stored.status).toBe("draft");
    expect(stored.voidedAt).toBeNull();
  });
});
