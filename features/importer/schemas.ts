import { z } from "zod";

import {
  importerMaxQuoteLibraryEntries,
  importerMaxQuoteLibraryItemsPerEntry,
} from "@/features/importer/types";

export const importerCommitQuoteLibraryLineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Line items need a description.")
    .max(400, "Line item descriptions must be 400 characters or fewer."),
  quantity: z
    .number()
    .int("Quantity must be a whole number.")
    .min(1, "Quantity must be at least 1.")
    .max(100_000, "Quantity is too large."),
  unitPriceInCents: z
    .number()
    .int("Price must be a whole number of cents.")
    .min(0, "Price cannot be negative.")
    .max(100_000_000, "Price is too large."),
});

export const importerCommitQuoteLibraryEntrySchema = z
  .object({
    kind: z.enum(["block", "package"]),
    name: z
      .string()
      .trim()
      .min(2, "Quote library entries need a name.")
      .max(120, "Names must be 120 characters or fewer."),
    description: z
      .string()
      .trim()
      .max(600, "Descriptions must be 600 characters or fewer.")
      .optional()
      .or(z.literal("").transform(() => undefined)),
    items: z
      .array(importerCommitQuoteLibraryLineItemSchema)
      .min(1, "Quote library entries need at least one line item.")
      .max(
        importerMaxQuoteLibraryItemsPerEntry,
        `Quote library entries can include up to ${importerMaxQuoteLibraryItemsPerEntry} line items.`,
      ),
  })
  .superRefine((value, ctx) => {
    if (value.kind === "block" && value.items.length !== 1) {
      ctx.addIssue({
        code: "custom",
        path: ["items"],
        message: "Quote library blocks must contain exactly one line item.",
      });
    }
  });

export const importerCommitQuoteLibrarySchema = z.object({
  sourceName: z.string().trim().min(1).max(200),
  entries: z
    .array(importerCommitQuoteLibraryEntrySchema)
    .min(1, "Select at least one quote library entry to import.")
    .max(
      importerMaxQuoteLibraryEntries,
      `You can import at most ${importerMaxQuoteLibraryEntries} quote library entries at once.`,
    ),
});

export type ImporterCommitQuoteLibraryInput = z.infer<
  typeof importerCommitQuoteLibrarySchema
>;
