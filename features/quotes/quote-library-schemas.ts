import { z } from "zod";

import { quoteLibraryEntryKinds } from "@/features/quotes/types";

function emptyToUndefined(value: unknown) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

function coercePositiveInteger(fieldLabel: string) {
  return z.preprocess((value) => {
    if (typeof value === "number") {
      return value;
    }

    if (typeof value !== "string") {
      return value;
    }

    const normalized = value.trim();

    if (!normalized) {
      return Number.NaN;
    }

    return Number(normalized);
  }, z.number().int(`${fieldLabel} must be a whole number.`).min(1, `${fieldLabel} must be at least 1.`));
}

function currencyStringToCents(value: unknown) {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return value;
    }

    return Math.round(value * 100);
  }

  if (typeof value !== "string") {
    return value;
  }

  const normalized = value.trim().replace(/,/g, "");

  if (!normalized) {
    return Number.NaN;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return Number.NaN;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return Number.NaN;
  }

  return Math.round(parsed * 100);
}

const quoteLibraryFormLineItemSchema = z.object({
  id: z.string().trim().min(1).max(128),
  description: z
    .string()
    .trim()
    .min(1, "Enter a line item description.")
    .max(400, "Line item descriptions must be 400 characters or fewer."),
  quantity: coercePositiveInteger("Quantity"),
  unitPriceInCents: z.preprocess(
    currencyStringToCents,
    z
      .number()
      .int()
      .min(0, "Unit price cannot be negative.")
      .max(100_000_000, "Unit price is too large."),
  ),
});

const quoteLibraryItemsFieldSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(quoteLibraryFormLineItemSchema).min(1, "Add at least one line item.").max(25, "Saved entries can include up to 25 line items."));

export const quoteLibraryEntryIdSchema = z
  .string()
  .trim()
  .min(1, "Entry id is required.")
  .max(128, "Entry id is too long.");

export const quoteLibraryEntrySchema = z
  .object({
    kind: z.enum(quoteLibraryEntryKinds),
    name: z
      .string()
      .trim()
      .min(2, "Enter a name.")
      .max(120, "Names must be 120 characters or fewer."),
    description: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(600, "Descriptions must be 600 characters or fewer.")
        .optional(),
    ),
    title: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(200, "Title must be 200 characters or fewer.")
        .optional(),
    ),
    // The quote editor caps both at 4,000 characters — a template longer
    // than that would make every quote created from it fail validation.
    notes: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(4000, "Notes must be 4,000 characters or fewer.")
        .optional(),
    ),
    terms: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(4000, "Terms must be 4,000 characters or fewer.")
        .optional(),
    ),
    validityDays: z.preprocess(
      (value) => {
        if (value == null || value === "") return undefined;
        if (typeof value === "number") return value;
        if (typeof value === "string") {
          const n = Number(value.trim());
          return Number.isNaN(n) ? value : n;
        }
        return value;
      },
      z
        .number()
        .int("Validity days must be a whole number.")
        .min(1, "Validity days must be at least 1.")
        .max(365, "Validity days must be 365 or fewer.")
        .optional(),
    ),
    items: quoteLibraryItemsFieldSchema,
  })
  .superRefine((value, ctx) => {
    if (value.kind === "block" && value.items.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Saved pricing blocks must contain exactly one line item.",
      });
    }

    if (value.kind === "template") {
      if (value.name.length > 100) {
        ctx.addIssue({
          code: "custom",
          path: ["name"],
          message: "Template names must be 100 characters or fewer.",
        });
      }

      if (!value.title || value.title.trim().length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["title"],
          message: "Templates require a title.",
        });
      }

      if (value.validityDays == null) {
        ctx.addIssue({
          code: "custom",
          path: ["validityDays"],
          message: "Templates require a validity period.",
        });
      }

      if (value.items.length > 25) {
        ctx.addIssue({
          code: "custom",
          path: ["items"],
          message: "Templates can include up to 25 line items.",
        });
      }
    }
  });

export type QuoteLibraryEntryInput = z.infer<typeof quoteLibraryEntrySchema>;
