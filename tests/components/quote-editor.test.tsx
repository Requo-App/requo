import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/notify", () => ({
  toast: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
}));

vi.mock("@/hooks/use-deferred-refresh", () => ({
  useDeferredRefresh: () => ({ scheduleRefresh: vi.fn(), refreshNow: vi.fn() }),
}));

import { QuoteEditor } from "@/features/quotes/components/quote-editor";
import type { QuoteEditorActionState, QuoteEditorValues } from "@/features/quotes/types";

const initialValues: QuoteEditorValues = {
  title: "Storefront sign package",
  customerName: "Alicia Cruz",
  customerEmail: "alicia@example.com",
  customerContactMethod: "email",
  customerContactHandle: "alicia@example.com",
  notes: "",
  terms: "",
  validUntil: "2099-12-31",
  discount: "",
  discountType: "amount",
  tax: "",
  taxType: "amount",
  taxLabel: "",
  items: [
    { id: "line-1", description: "Design", quantity: "1", unitPrice: "150.25" },
  ],
};

let action: ReturnType<
  typeof vi.fn<
    (state: QuoteEditorActionState, formData: FormData) => Promise<QuoteEditorActionState>
  >
>;

beforeEach(() => {
  vi.clearAllMocks();
  action = vi.fn().mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

function renderEditor(overrides: Partial<QuoteEditorValues> = {}) {
  return render(
    <QuoteEditor
      action={action}
      businessName="Test business"
      businessSlug="test-business"
      currency="USD"
      initialValues={{ ...initialValues, ...overrides }}
      linkedInquiry={null}
      pricingLibrary={[]}
      submitLabel="Save quote"
      submitPendingLabel="Saving…"
    />,
  );
}

describe("quote editor submission", () => {
  it("submits the owner's raw discount and tax intent, not browser-computed cents", async () => {
    const user = userEvent.setup();
    const { container } = renderEditor();

    const discountInput = container.querySelector<HTMLInputElement>(
      '[id="quote-discount"]',
    )!;
    await user.type(discountInput, "10");
    await user.click(screen.getByRole("button", { name: "Toggle discount type" }));

    const taxInput = container.querySelector<HTMLInputElement>('[id="quote-tax"]')!;
    await user.type(taxInput, "10");
    await user.click(screen.getByRole("button", { name: "Toggle tax type" }));

    fireEvent.submit(container.querySelector("form")!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(action).toHaveBeenCalled();
    const formData = action.mock.calls[0]?.[1] as FormData;

    expect(formData.get("discount")).toBe("10");
    expect(formData.get("discountType")).toBe("percentage");
    expect(formData.get("tax")).toBe("10");
    expect(formData.get("taxType")).toBe("percentage");
  });

  it("allows a zero-priced line item to be saved", async () => {
    const { container } = renderEditor({
      items: [
        { id: "line-1", description: "Needs pricing", quantity: "1", unitPrice: "" },
      ],
    });

    const priceInput = container.querySelector<HTMLInputElement>(
      '[id="quote-item-price-line-1"]',
    )!;
    // A blank price must not block the browser's own validation.
    expect(priceInput.required).toBe(false);

    fireEvent.submit(container.querySelector("form")!);

    await act(async () => {
      await Promise.resolve();
    });

    expect(action).toHaveBeenCalled();
    const formData = action.mock.calls[0]?.[1] as FormData;
    const items = JSON.parse(String(formData.get("items"))) as Array<{
      unitPriceInCents: string;
    }>;
    expect(items[0]?.unitPriceInCents).toBe("");
  });
});
