import { describe, expect, it } from "vitest";

import {
  publicQuoteResponseSchema,
  quoteEditorSchema,
  quotePublicTokenSchema,
} from "@/features/quotes/schemas";

function quoteInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    title: "Storefront sign package",
    customerName: "Alicia Cruz",
    customerEmail: "",
    customerContactMethod: "email",
    customerContactHandle: "alicia@example.com",
    notes: "Includes install and cleanup.",
    validUntil: "2026-05-31",
    discountInCents: "25.50",
    items: JSON.stringify([
      {
        id: "line-design",
        description: "Design and proofing",
        quantity: "2",
        unitPriceInCents: "150.25",
      },
      {
        id: "line-install",
        description: "Installation",
        quantity: "1",
        unitPriceInCents: "300",
      },
    ]),
    ...overrides,
  };
}

describe("quote validation schemas", () => {
  it("normalizes the quote editor payload that drives quote totals", () => {
    const parsed = quoteEditorSchema.safeParse(quoteInput());

    expect(parsed.success).toBe(true);
    expect(parsed.data?.discountInCents).toBe(2550);
    expect(parsed.data?.items).toEqual([
      expect.objectContaining({
        description: "Design and proofing",
        quantity: 2,
        unitPriceInCents: 15025,
      }),
      expect.objectContaining({
        description: "Installation",
        quantity: 1,
        unitPriceInCents: 30000,
      }),
    ]);
  });

  it("rejects discounts larger than the subtotal", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        discountInCents: "1000",
        items: JSON.stringify([
          {
            id: "line-small",
            description: "Small service",
            quantity: "1",
            unitPriceInCents: "99",
          },
        ]),
      }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["discountInCents"],
          message: "Discount cannot be larger than the subtotal.",
        }),
      ]),
    );
  });

  it("requires an email-shaped contact handle when email is selected", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        customerContactMethod: "email",
        customerContactHandle: "not-an-email",
      }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["customerContactHandle"],
          message: "Enter a valid email address.",
        }),
      ]),
    );
  });

  it("rejects empty or malformed line items", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        items: JSON.stringify([
          {
            id: "line-empty",
            description: "",
            quantity: "0",
            unitPriceInCents: "-1",
          },
        ]),
      }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.path.join("."))).toEqual(
      expect.arrayContaining([
        "items.0.description",
        "items.0.quantity",
        "items.0.unitPriceInCents",
      ]),
    );
  });

  it("bounds public quote responses and tokens", () => {
    expect(
      publicQuoteResponseSchema.safeParse({
        response: "accepted",
        message: "a".repeat(1200),
        signerName: "Maria Santos",
        confirmed: true,
        expectedVersion: 1,
      }).success,
    ).toBe(true);
    expect(
      publicQuoteResponseSchema.safeParse({
        response: "accepted",
        message: "a".repeat(1201),
        signerName: "Maria Santos",
        confirmed: true,
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      publicQuoteResponseSchema.safeParse({
        response: "accepted",
        message: "ok",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      publicQuoteResponseSchema.safeParse({
        response: "accepted",
        message: "ok",
        signerName: "Maria Santos",
        expectedVersion: 1,
      }).success,
    ).toBe(false);
    expect(
      publicQuoteResponseSchema.safeParse({
        response: "rejected",
        message: "no thanks",
        expectedVersion: 1,
      }).success,
    ).toBe(true);
    expect(quotePublicTokenSchema.safeParse("abc").success).toBe(false);
    expect(
      quotePublicTokenSchema.safeParse("public_token-123456").success,
    ).toBe(true);
    expect(quotePublicTokenSchema.safeParse("bad token value").success).toBe(
      false,
    );
  });

  it("requires the quote version so a customer accepts the version they saw", () => {
    expect(
      publicQuoteResponseSchema.safeParse({
        response: "accepted",
        signerName: "Maria Santos",
        confirmed: true,
      }).success,
    ).toBe(false);
  });

  it("derives the discount and tax from the owner's raw intent", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        discountValue: "10",
        discountType: "percentage",
        taxValue: "10",
        taxType: "percentage",
        discountInCents: undefined,
        taxInCents: undefined,
      }),
    );

    expect(parsed.success).toBe(true);
    // Subtotal is 2 * 15025 + 30000 = 60050.
    expect(parsed.data?.discountInCents).toBe(6005);
    expect(parsed.data?.taxInCents).toBe(5405);
  });

  it("treats a blank unit price as a zero price so unpriced items can be saved", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        discountInCents: "0",
        items: JSON.stringify([
          {
            id: "line-unpriced",
            description: "Needs pricing",
            quantity: "1",
            unitPriceInCents: "",
          },
        ]),
      }),
    );

    expect(parsed.success).toBe(true);
    expect(parsed.data?.items[0]?.unitPriceInCents).toBe(0);
  });

  it("normalizes the customer contact method to lower case", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        customerContactMethod: "Email",
        customerContactHandle: "alicia@example.com",
      }),
    );

    expect(parsed.success).toBe(true);
    expect(parsed.data?.customerContactMethod).toBe("email");
  });

  it("rejects a malformed discount or tax amount", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        discountValue: "abc",
        discountType: "amount",
      }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["discountValue"],
          message: "Enter a valid discount amount.",
        }),
      ]),
    );
  });

  it("rejects a discount percentage outside 0-100", () => {
    const parsed = quoteEditorSchema.safeParse(
      quoteInput({
        discountValue: "150",
        discountType: "percentage",
      }),
    );

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["discountValue"],
          message: "Enter a discount percentage between 0 and 100.",
        }),
      ]),
    );
  });
});
