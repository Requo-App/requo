import { z } from "zod";

import {
  quoteRecordViews,
  quoteStatusFilterValues,
} from "@/features/quotes/types";
import {
  coercePositiveInteger,
  emptyToUndefined,
  firstString,
  isValidDateInput,
  optionalText,
} from "@/lib/zod-helpers";

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

const aiQuoteProductStatusValues = [
  "verified",
  "suggested",
  "unpriced",
  "owner_set",
] as const;

const aiQuoteReadinessValues = [
  "ready",
  "needs_confirmation",
  "scope_only",
] as const;

/**
 * AI review metadata attached by the quote editor to a line item. The server
 * only trusts `pricingSource === "owner_brief"` (owner override); everything
 * else is informational and never used for send authorization.
 */
const quoteFormAiReviewSchema = z
  .object({
    name: z.string().trim().max(120).optional(),
    pricingSource: z
      .enum([
        "pricing_library_block",
        "pricing_library_package",
        "past_quote",
        "business_memory",
        "owner_brief",
        "none",
      ])
      .optional(),
    pricingSourceLabel: z.string().trim().max(200).nullable().optional(),
    confidence: z.enum(["high", "medium", "low"]).optional(),
    reviewStatus: z
      .enum(["matched", "calculated", "needs_review", "no_pricing_found"])
      .optional(),
    reason: z.string().trim().max(600).optional(),
  })
  .optional();

/**
 * Grounded pricing evidence behind a generated line item. Set by server-side
 * hydration/verification, carried through the editor so saves persist it.
 */
const quoteFormAiEvidenceSchema = z
  .object({
    entryId: z.string().trim().max(128).nullable().optional(),
    itemId: z.string().trim().max(128).nullable().optional(),
    sourceLabel: z.string().trim().max(200).nullable().optional(),
    matchType: z.enum(["exact", "suggested", "none"]).optional(),
    reason: z.string().trim().max(600).optional(),
  })
  .optional();

const quoteFormLineItemSchema = z.object({
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
  aiReview: quoteFormAiReviewSchema,
  aiProductStatus: z.enum(aiQuoteProductStatusValues).optional(),
  aiProductLibraryEntryId: z.string().trim().max(128).optional(),
  aiProductLibraryItemId: z.string().trim().max(128).optional(),
  aiEvidence: quoteFormAiEvidenceSchema,
});

const quoteItemsFieldSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(quoteFormLineItemSchema).min(1, "Add at least one line item.").max(50, "Quotes can include up to 50 line items."));

const quoteMissingInfoItemSchema = z.object({
  label: z.string().trim().min(1).max(120),
  question: z.string().trim().max(400),
  critical: z.boolean().optional(),
});

const quoteAiMissingInfoFieldSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}, z.array(quoteMissingInfoItemSchema).max(50).optional());

export const quoteIdSchema = z
  .string()
  .trim()
  .min(1, "Quote id is required.")
  .max(128, "Quote id is too long.");
export const quotePublicTokenSchema = z
  .string()
  .trim()
  .min(16, "Quote token is too short.")
  .max(128, "Quote token is too long.")
  .regex(/^[a-zA-Z0-9_-]+$/, "Enter a valid quote token.");

export const quoteRouteParamsSchema = z.object({
  id: quoteIdSchema,
});

export const quotePublicRouteParamsSchema = z.object({
  token: quotePublicTokenSchema,
});

export const quoteListFiltersSchema = z.object({
  q: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z
        .string()
        .trim()
        .max(120, "Search must be 120 characters or fewer.")
        .optional(),
    )
    .catch(undefined),
  view: z
    .preprocess(
      (value) => firstString(value) ?? "active",
      z.enum(quoteRecordViews),
    )
    .catch("active"),
  status: z
    .preprocess(
      (value) => firstString(value) ?? "all",
      z.enum(quoteStatusFilterValues),
    )
    .catch("all"),
  sort: z
    .preprocess(
      (value) => firstString(value) ?? "newest",
      z.enum(["newest", "oldest"]),
    )
    .catch("newest"),
  page: coercePositiveInteger("Page").catch(1),
});

export const quoteEditorSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(2, "Enter a quote title.")
      .max(160, "Quote titles must be 160 characters or fewer."),
    customerName: z
      .string()
      .trim()
      .min(2, "Enter the customer name.")
      .max(120, "Customer name must be 120 characters or fewer."),
    customerEmail: z
      .string()
      .trim()
      .email("Enter a valid customer email.")
      .nullable()
      .optional()
      .or(z.literal("")),
    customerContactMethod: z.string().trim().min(1, "Select a preferred contact method."),
    customerContactHandle: z.string().trim().min(1, "Enter the contact handle."),
    notes: optionalText(4000, "Text must be 4000 characters or fewer."),
    terms: optionalText(4000, "Text must be 4000 characters or fewer."),
    validUntil: z
      .string()
      .trim()
      .refine(isValidDateInput, "Enter a valid validity date."),
    discountInCents: z.preprocess(
      (value) => {
        const normalized = emptyToUndefined(value);

        if (normalized === undefined) {
          return 0;
        }

        return currencyStringToCents(normalized);
      },
      z
        .number()
        .int()
        .min(0, "Discount cannot be negative.")
        .max(100_000_000, "Discount is too large."),
    ),
    taxInCents: z.preprocess(
      (value) => {
        const normalized = emptyToUndefined(value);

        if (normalized === undefined) {
          return 0;
        }

        return currencyStringToCents(normalized);
      },
      z
        .number()
        .int()
        .min(0, "Tax cannot be negative.")
        .max(100_000_000, "Tax is too large."),
    ),
    taxLabel: z.preprocess(
      emptyToUndefined,
      z.string().trim().max(40, "Tax label must be 40 characters or fewer.").optional(),
    ),
    items: quoteItemsFieldSchema,
    aiReadiness: z.enum(aiQuoteReadinessValues).optional(),
    aiGenerationId: z.string().trim().max(64).optional(),
    aiMissingInfo: quoteAiMissingInfoFieldSchema,
  })
      .superRefine((value, ctx) => {
    const subtotalInCents = value.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceInCents,
      0,
    );

    if (value.discountInCents > subtotalInCents) {
      ctx.addIssue({
        code: "custom",
        path: ["discountInCents"],
        message: "Discount cannot be larger than the subtotal.",
      });
    }

    if (value.customerContactMethod.toLowerCase() === "email") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(value.customerContactHandle)) {
        ctx.addIssue({
          code: "custom",
          path: ["customerContactHandle"],
          message: "Enter a valid email address.",
        });
      }
    }
  });

export const quoteCancellationReasons = [
  "customer_changed_mind",
  "price_too_high",
  "schedule_conflict",
  "scope_changed",
  "no_deposit_payment",
  "duplicate_mistake",
  "business_unavailable",
  "other",
] as const;

export const quoteCancellationSchema = z.object({
  cancellationReason: z.enum(quoteCancellationReasons, {
    error: () => "Choose a cancellation reason.",
  }),
  cancellationNote: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(1200, "Cancellation notes must be 1,200 characters or fewer.")
      .optional(),
  ),
});

export const publicQuoteResponseSchema = z
  .object({
    response: z.enum(["accepted", "rejected"], {
      error: () => "Choose whether to accept or decline this quote.",
    }),
    message: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(1200, "Customer response messages must be 1,200 characters or fewer.")
        .optional(),
    ),
    signerName: z.preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .max(120, "Name must be 120 characters or fewer.")
        .optional(),
    ),
    confirmed: z.preprocess((value) => {
      if (value === true || value === "true" || value === "on" || value === "1") return true;
      return emptyToUndefined(value) === undefined ? undefined : false;
    }, z.boolean().optional()),
    expectedVersion: z.preprocess((value) => {
      const first = firstString(value);
      if (first == null || String(first).trim() === "") return undefined;
      const parsed = Number(String(first).trim());
      return Number.isFinite(parsed) ? parsed : value;
    }, z.number().int().min(1).optional()),
  })
  .superRefine((data, ctx) => {
    if (data.response !== "accepted") return;
    const name = data.signerName?.trim() ?? "";
    if (name.length < 2) {
      ctx.addIssue({
        code: "custom",
        path: ["signerName"],
        message: "Enter your name to accept this quote.",
      });
    }
    if (data.confirmed !== true) {
      ctx.addIssue({
        code: "custom",
        path: ["confirmed"],
        message: "Confirm that you agree to the scope, pricing, and terms.",
      });
    }
  });

export type QuoteEditorInput = z.infer<typeof quoteEditorSchema>;
export type PublicQuoteResponseInput = z.infer<typeof publicQuoteResponseSchema>;

const revisionItemCommentSchema = z.object({
  itemId: z.string().trim().min(1).max(128),
  itemDescription: z.string().trim().max(400),
  comment: z.string().trim().min(1, "Enter a comment.").max(600, "Comment must be 600 characters or fewer."),
});

export const publicQuoteRevisionRequestSchema = z.object({
  message: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(2000, "Revision message must be 2,000 characters or fewer.")
      .optional(),
  ),
  itemComments: z.preprocess((value) => {
    if (value == null) {
      return [];
    }

    if (typeof value !== "string") {
      return value;
    }

    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }, z.array(revisionItemCommentSchema).max(50).default([])),
});

export type PublicQuoteRevisionRequestInput = z.infer<typeof publicQuoteRevisionRequestSchema>;
