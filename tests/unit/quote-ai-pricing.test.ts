import { describe, expect, it } from "vitest";

import { computeQuoteAiReadiness } from "@/features/quotes/utils";
import { quoteEditorSchema } from "@/features/quotes/schemas";

/**
 * The readiness string is what arms the "suggested pricing needs your
 * confirmation" gate on a quote. It used to be read from the browser and
 * silently dropped by the schema, so the column was always NULL and the
 * gate never fired.
 */
describe("computeQuoteAiReadiness", () => {
  it("returns null for a quote with no AI provenance", () => {
    expect(
      computeQuoteAiReadiness({
        items: [{ aiProductStatus: undefined, aiEvidence: undefined }],
        missingInfo: null,
      }),
    ).toBeNull();
  });

  it("is ready when every line is verified", () => {
    expect(
      computeQuoteAiReadiness({
        items: [
          { aiProductStatus: "verified", aiEvidence: { matchType: "exact" } },
        ],
        missingInfo: [],
      }),
    ).toBe("ready");
  });

  it("needs confirmation when a line is a suggested match", () => {
    expect(
      computeQuoteAiReadiness({
        items: [
          { aiProductStatus: "suggested", aiEvidence: { matchType: "suggested" } },
        ],
        missingInfo: [],
      }),
    ).toBe("needs_confirmation");
  });

  it("needs confirmation when the evidence says suggested, whatever the status", () => {
    expect(
      computeQuoteAiReadiness({
        items: [{ aiProductStatus: null, aiEvidence: { matchType: "suggested" } }],
        missingInfo: [],
      }),
    ).toBe("needs_confirmation");
  });

  it("is scope only when a line could not be priced", () => {
    expect(
      computeQuoteAiReadiness({
        items: [{ aiProductStatus: "unpriced", aiEvidence: { matchType: "none" } }],
        missingInfo: [],
      }),
    ).toBe("scope_only");
  });

  it("treats a line with no evidence and no status as unpriced", () => {
    expect(
      computeQuoteAiReadiness({
        items: [{ aiProductStatus: null, aiEvidence: { matchType: "none" } }],
        missingInfo: [],
      }),
    ).toBe("scope_only");
  });

  it("does not block a line the owner priced themselves", () => {
    expect(
      computeQuoteAiReadiness({
        items: [{ aiProductStatus: "owner_set", aiEvidence: null }],
        missingInfo: [],
      }),
    ).toBe("ready");
  });

  it("needs confirmation when a critical question is unanswered", () => {
    expect(
      computeQuoteAiReadiness({
        items: [{ aiProductStatus: "verified", aiEvidence: { matchType: "exact" } }],
        missingInfo: [{ label: "Access", question: "Which floor?", critical: true }],
      }),
    ).toBe("needs_confirmation");
  });
});

/**
 * The discount/tax intent the owner expressed in the editor. The action used
 * to map the raw string onto `discountInCents`, so a 10 % discount on a 1000
 * subtotal persisted as 10 and the customer was emailed 990.
 */
describe("quoteEditorSchema — money intent", () => {
  const base = {
    title: "Kitchen renovation",
    customerName: "Jane Doe",
    customerContactMethod: "email",
    customerContactHandle: "jane@example.com",
    validUntil: "2026-12-01",
    items: [
      {
        id: "line-1",
        description: "Labour",
        quantity: 1,
        // The editor submits a currency string; the schema converts it.
        unitPriceInCents: "1000",
      },
    ],
  };

  it("derives a percentage discount from the subtotal", () => {
    const parsed = quoteEditorSchema.safeParse({
      ...base,
      discountValue: "10",
      discountType: "percentage",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.discountInCents).toBe(10_000);
  });

  it("derives an absolute discount from the amount", () => {
    const parsed = quoteEditorSchema.safeParse({
      ...base,
      discountValue: "50",
      discountType: "amount",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.discountInCents).toBe(5_000);
  });

  it("rejects a percentage discount larger than the subtotal", () => {
    const parsed = quoteEditorSchema.safeParse({
      ...base,
      discountValue: "150",
      discountType: "percentage",
    });

    expect(parsed.success).toBe(false);
  });

  it("treats an empty discount as no discount", () => {
    const parsed = quoteEditorSchema.safeParse({
      ...base,
      discountValue: "",
      discountType: "amount",
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.discountInCents).toBe(0);
  });

  it("refuses a generation reference that the server did not issue", () => {
    const parsed = quoteEditorSchema.safeParse({
      ...base,
      aiGenerationId: "not-a-server-issued-id",
    });

    expect(parsed.success).toBe(false);
  });

  it("accepts a server-issued generation reference", () => {
    const parsed = quoteEditorSchema.safeParse({
      ...base,
      aiGenerationId: `qgen_${"a".repeat(32)}`,
    });

    expect(parsed.success).toBe(true);
  });
});
