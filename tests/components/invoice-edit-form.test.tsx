import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/notify", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { EditInvoiceForm } from "@/features/invoices/components/edit-invoice-form";
import type { InvoiceDetail } from "@/features/invoices/types";

const quoteLinkedInvoice = {
  id: "inv_1",
  invoiceNumber: "INV-000001",
  title: "Roof repair",
  customerName: "Acme",
  customerEmail: "acme@example.com",
  customerContactMethod: "email",
  customerContactHandle: "acme@example.com",
  currency: "USD",
  issueDate: "2026-01-01",
  dueDate: "2026-02-01",
  totalInCents: 495000,
  paidInCents: 0,
  balanceInCents: 495000,
  status: "draft",
  quoteId: "quote_1",
  notes: null,
  paymentTerms: null,
  subtotalInCents: 500000,
  discountInCents: 5000,
  taxInCents: 0,
  taxLabel: null,
  sentAt: null,
  voidedAt: null,
  items: [
    {
      id: "line_1",
      description: "Roof repair",
      quantity: 2,
      unitPriceInCents: 250000,
      lineTotalInCents: 500000,
      position: 0,
    },
  ],
  payments: [],
} as unknown as InvoiceDetail;

const standaloneInvoice = {
  ...quoteLinkedInvoice,
  id: "inv_2",
  quoteId: null,
  discountInCents: 0,
} as unknown as InvoiceDetail;

afterEach(cleanup);

describe("invoice edit form", () => {
  it("submits the stored line items for a quote-linked invoice", async () => {
    // A quote-linked invoice keeps the quote's line items. The form must
    // submit that snapshot rather than a placeholder, so the payload
    // matches the invoice the server keeps.
    const action = vi.fn().mockResolvedValue({});
    const { container } = render(
      <EditInvoiceForm
        action={action}
        businessSlug="test-business"
        currency="USD"
        invoice={quoteLinkedInvoice}
      />,
    );

    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(formData.get("items")))).toEqual([
      { description: "Roof repair", quantity: 2, unitPriceInCents: 250000 },
    ]);
    expect(formData.get("discount")).toBe("50.00");
  });

  it("submits the editable rows for a standalone invoice", async () => {
    const action = vi.fn().mockResolvedValue({});
    const { container } = render(
      <EditInvoiceForm
        action={action}
        businessSlug="test-business"
        currency="USD"
        invoice={standaloneInvoice}
      />,
    );

    fireEvent.submit(container.querySelector("form")!);
    await waitFor(() => expect(action).toHaveBeenCalled());

    const formData = action.mock.calls[0][1] as FormData;
    expect(JSON.parse(String(formData.get("items")))).toEqual([
      { description: "Roof repair", quantity: "2", unitPriceInCents: "2500.00" },
    ]);
    expect(formData.get("discount")).toBe("0.00");
  });
});
