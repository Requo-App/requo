import { describe, it, expect } from "vitest";

import {
  MAX_MONEY_CENTS,
  getInvoiceDraftSchema,
  invoiceQuoteLinkedSchema,
  invoiceSchema,
  voidInvoiceSchema,
} from "@/features/invoices/schemas";
import { invoiceStatuses } from "@/features/invoices/types";

const validInvoice = (overrides: Record<string, unknown> = {}) => ({
  title: "Roof repair",
  customerName: "Acme",
  customerEmail: "",
  customerContactMethod: "email",
  customerContactHandle: "",
  issueDate: "2026-01-01",
  dueDate: "2026-02-01",
  discountInCents: "0.00",
  taxInCents: "0.00",
  taxLabel: "",
  notes: "",
  paymentTerms: "",
  items: [{ description: "Roof repair", quantity: 1, unitPriceInCents: "500000.00" }],
  ...overrides,
});

describe("features/invoices/schemas — quote-linked drafts", () => {
  it("rejects a discount above the subtotal on an editable invoice", () => {
    const result = invoiceSchema.safeParse(
      validInvoice({ discountInCents: "5000.00", items: [{ description: "Work", quantity: 1, unitPriceInCents: "1000.00" }] }),
    );

    expect(result.success).toBe(false);
  });

  it("accepts a quote-linked draft whose submitted totals are discarded", () => {
    // A quote-linked invoice keeps the quote's line items and totals, so the
    // server discards the submitted ones. Validating them against each
    // other would reject a legitimate edit of the customer-facing fields.
    const result = invoiceQuoteLinkedSchema.safeParse(
      validInvoice({ discountInCents: "5000.00", items: [{ description: "locked", quantity: 1, unitPriceInCents: "0.00" }] }),
    );

    expect(result.success).toBe(true);
  });

  it.each([
    { items: [null] },
    { items: ["ignored", 123, false] },
    { items: [{ description: "", quantity: -1, unitPriceInCents: "invalid" }] },
    { items: [{ description: "Bulk", quantity: 1_000_000, unitPriceInCents: "20000.00" }] },
  ])("accepts discarded item values only for quote-linked drafts: $items", ({ items }) => {
    const payload = validInvoice({ items });

    expect(invoiceQuoteLinkedSchema.safeParse(payload).success).toBe(true);
    expect(invoiceSchema.safeParse(payload).success).toBe(false);
  });

  it.each([0, 1, 100, 101])("retains the item count limits for %i quote-linked items", (count) => {
    const result = invoiceQuoteLinkedSchema.safeParse(validInvoice({ items: Array(count).fill(null) }));

    expect(result.success).toBe(count >= 1 && count <= 100);
  });

  it("requires an items array for quote-linked drafts", () => {
    expect(invoiceQuoteLinkedSchema.safeParse(validInvoice({ items: null })).success).toBe(false);
  });

  it("still enforces the date order on a quote-linked draft", () => {
    const result = invoiceQuoteLinkedSchema.safeParse(validInvoice({ dueDate: "2025-12-31" }));

    expect(result.success).toBe(false);
  });

  it("selects the rule from the persisted invoice, not the client", () => {
    // The quote's discount against a placeholder line item: the editable
    // rule rejects it, the quote-linked rule accepts it.
    const payload = validInvoice({
      discountInCents: "5000.00",
      items: [{ description: "locked", quantity: 1, unitPriceInCents: "0.00" }],
    });

    expect(getInvoiceDraftSchema({ quoteId: "quote_1" }).safeParse(payload).success).toBe(true);
    expect(getInvoiceDraftSchema({ quoteId: null }).safeParse(payload).success).toBe(false);
  });
});

describe("features/invoices/schemas — money ceiling", () => {
  it("rejects a line total above the storage ceiling", () => {
    const result = invoiceSchema.safeParse(
      validInvoice({ items: [{ description: "Bulk", quantity: 1_000_000, unitPriceInCents: "20000.00" }] }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a subtotal above the storage ceiling", () => {
    const result = invoiceSchema.safeParse(
      validInvoice({
        items: [
          { description: "First", quantity: 1, unitPriceInCents: "15000000.00" },
          { description: "Second", quantity: 1, unitPriceInCents: "15000000.00" },
        ],
      }),
    );

    expect(result.success).toBe(false);
  });

  it("rejects a total above the storage ceiling", () => {
    const result = invoiceSchema.safeParse(
      validInvoice({
        items: [{ description: "Work", quantity: 1, unitPriceInCents: "15000000.00" }],
        taxInCents: "15000000.00",
      }),
    );

    expect(result.success).toBe(false);
  });

  it("accepts a total exactly at the ceiling", () => {
    const result = invoiceSchema.safeParse(
      validInvoice({
        items: [{ description: "Work", quantity: 1, unitPriceInCents: "15000000.00" }],
        taxInCents: "5000000.00",
      }),
    );

    expect(result.success).toBe(true);
    expect(MAX_MONEY_CENTS).toBe(2_000_000_000);
  });
});

describe("features/invoices/schemas — void reason", () => {
  it("requires a reason", () => {
    expect(voidInvoiceSchema.safeParse({ reason: "", reasonDetail: "" }).success).toBe(false);
    expect(voidInvoiceSchema.safeParse({ reason: "duplicate_entry", reasonDetail: "" }).success).toBe(true);
  });
});

describe("features/invoices/status vocabulary", () => {
  it("does not offer a filter state the effective status can never produce", () => {
    // The stored lifecycle value `sent` is rewritten to `unpaid` once a
    // payment or a due date applies, so a `sent` filter would always
    // return zero rows.
    expect(invoiceStatuses).not.toContain("sent");
    expect(invoiceStatuses).toEqual([
      "draft",
      "unpaid",
      "partially_paid",
      "paid",
      "overdue",
      "voided",
    ]);
  });
});
