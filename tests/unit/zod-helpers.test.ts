import { describe, expect, it } from "vitest";

import {
  coercePositiveInteger,
  emptyToUndefined,
  firstString,
  isValidDateInput,
  optionalText,
} from "@/lib/zod-helpers";
import { quoteEditorSchema } from "@/features/quotes/schemas";
import { invoiceLineItemSchema } from "@/features/invoices/schemas";

describe("emptyToUndefined", () => {
  it("maps null, undefined, and blank strings to undefined", () => {
    expect(emptyToUndefined(null)).toBeUndefined();
    expect(emptyToUndefined(undefined)).toBeUndefined();
    expect(emptyToUndefined("")).toBeUndefined();
    expect(emptyToUndefined("   ")).toBeUndefined();
  });

  it("passes through real values untouched", () => {
    expect(emptyToUndefined("hello")).toBe("hello");
    expect(emptyToUndefined("  padded  ")).toBe("  padded  ");
    expect(emptyToUndefined(0)).toBe(0);
    expect(emptyToUndefined(false)).toBe(false);
  });
});

describe("firstString", () => {
  it("returns the first element of arrays", () => {
    expect(firstString(["a", "b"])).toBe("a");
    expect(firstString([])).toBeUndefined();
  });

  it("passes non-arrays through untouched", () => {
    expect(firstString("x")).toBe("x");
    expect(firstString(null)).toBeNull();
    expect(firstString(3)).toBe(3);
  });
});

describe("coercePositiveInteger", () => {
  const schema = coercePositiveInteger("Page");

  it("accepts numbers and numeric strings", () => {
    expect(schema.safeParse(5).data).toBe(5);
    expect(schema.safeParse("5").data).toBe(5);
    expect(schema.safeParse("  42  ").data).toBe(42);
    expect(schema.safeParse(["7"]).data).toBe(7);
  });

  it("rejects blanks, decimals, zero, negatives, and non-numerics", () => {
    for (const value of ["", "   ", "abc", "1.5", 0, -2, null, undefined, {}]) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it("labels failures with the field name", () => {
    const result = schema.safeParse("1.5");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Page");
  });
});

describe("isValidDateInput", () => {
  it("accepts well-formed real dates", () => {
    expect(isValidDateInput("2026-01-15")).toBe(true);
    expect(isValidDateInput("2024-02-29")).toBe(true);
  });

  it("rejects malformed shapes and impossible dates", () => {
    expect(isValidDateInput("2026-1-5")).toBe(false);
    expect(isValidDateInput("15/01/2026")).toBe(false);
    expect(isValidDateInput("2026-02-30")).toBe(false);
    expect(isValidDateInput("2026-13-01")).toBe(false);
    expect(isValidDateInput("not-a-date")).toBe(false);
    expect(isValidDateInput("")).toBe(false);
  });
});

describe("optionalText", () => {
  it("accepts missing and blank values as undefined", () => {
    const schema = optionalText(10);
    expect(schema.safeParse(undefined).data).toBeUndefined();
    expect(schema.safeParse("").data).toBeUndefined();
    expect(schema.safeParse("   ").data).toBeUndefined();
    expect(schema.safeParse(null).data).toBeUndefined();
  });

  it("accepts text within the limit and trims it", () => {
    expect(optionalText(10).safeParse("  hello  ").data).toBe("hello");
  });

  it("uses a custom max message when provided", () => {
    const result = optionalText(4, "Too long!").safeParse("way too long");
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("Too long!");
  });

  it("falls back to the default Zod message otherwise", () => {
    const custom = optionalText(4, "Too long!").safeParse("way too long");
    const plain = optionalText(4).safeParse("way too long");
    expect(custom.success).toBe(false);
    expect(plain.success).toBe(false);
    expect(JSON.stringify(plain.error?.issues)).not.toContain("Too long!");
  });
});

const quoteBase = {
  title: "Website build",
  customerName: "Acme Co",
  customerContactMethod: "phone",
  customerContactHandle: "555-1234",
  validUntil: "2030-01-01",
  items: [
    {
      id: "item-1",
      description: "Design",
      quantity: 1,
      unitPriceInCents: "1000000",
    },
  ],
};

describe("money limits stay domain-specific", () => {
  it("quotes cap money at 100M cents", () => {
    expect(
      quoteEditorSchema.safeParse({ ...quoteBase, discountInCents: "1000000" })
        .success,
    ).toBe(true);
    const over = quoteEditorSchema.safeParse({
      ...quoteBase,
      discountInCents: "1000000.01",
    });
    expect(over.success).toBe(false);
    expect(JSON.stringify(over.error?.issues)).toContain("Discount is too large.");
  });

  it("invoices allow amounts above the quote cap, up to 2B cents", () => {
    const item = {
      description: "Design",
      quantity: 1,
      unitPriceInCents: "2000000",
    };
    expect(invoiceLineItemSchema.safeParse(item).data?.unitPriceInCents).toBe(
      200_000_000,
    );
    const atCap = invoiceLineItemSchema.safeParse({
      ...item,
      unitPriceInCents: "20000000",
    });
    expect(atCap.success).toBe(true);
    const over = invoiceLineItemSchema.safeParse({
      ...item,
      unitPriceInCents: "20000000.01",
    });
    expect(over.success).toBe(false);
    expect(JSON.stringify(over.error?.issues)).toContain("Unit price is too large.");
  });

  it("both domains still parse ordinary amounts identically", () => {
    expect(
      quoteEditorSchema.safeParse({ ...quoteBase, discountInCents: "150.50" })
        .data?.discountInCents,
    ).toBe(15_050);
    expect(
      invoiceLineItemSchema.safeParse({
        description: "Design",
        quantity: 2,
        unitPriceInCents: "150.50",
      }).data?.unitPriceInCents,
    ).toBe(15_050);
  });
});

describe("shared helpers wire into real schemas", () => {
  it("page filters across domains coerce and default identically", async () => {
    const { quoteListFiltersSchema } = await import(
      "@/features/quotes/schemas"
    );
    const { invoiceListFiltersSchema } = await import(
      "@/features/invoices/schemas"
    );

    expect(quoteListFiltersSchema.safeParse({ page: "3" }).data?.page).toBe(3);
    expect(invoiceListFiltersSchema.safeParse({ page: "3" }).data?.page).toBe(3);
    expect(quoteListFiltersSchema.safeParse({}).data?.page).toBe(1);
  });

  it("quotes keep their custom length message, invoices keep the default", async () => {
    const { quoteEditorSchema: editor } = await import(
      "@/features/quotes/schemas"
    );
    const notes = { ...quoteBase, notes: "x".repeat(4001) };
    const notesResult = editor.safeParse(notes);
    expect(notesResult.success).toBe(false);
    expect(JSON.stringify(notesResult.error?.issues)).toContain(
      "Text must be 4000 characters or fewer.",
    );

    const { invoiceSchema } = await import("@/features/invoices/schemas");
    const emailResult = invoiceSchema.safeParse({
      title: "Website build",
      customerName: "Acme Co",
      customerEmail: "",
      issueDate: "2030-01-01",
      dueDate: "2030-02-01",
      discountInCents: "0",
      taxInCents: "0",
      items: [{ description: "Design", quantity: 1, unitPriceInCents: "100" }],
    });
    expect(emailResult.success).toBe(true);
    expect(emailResult.data?.customerEmail).toBeUndefined();
  });
});
