import { z } from "zod";

import { isValidDateInput } from "@/lib/zod-helpers";

/** Shared slug param (was copy-pasted in 7+ export routes). */
export const slugParamSchema = z.object({
  slug: z.string().trim().min(1).max(120),
});

/** Shared pdf/png format query (was copy-pasted in 3 single-doc routes). */
export const exportFormatSchema = z.enum(["pdf", "png"]);

/**
 * Shared YYYY-MM-DD query fragments for list CSV exports.
 *
 * The shape check alone is not enough: `2024-13-45` matches the pattern but
 * is not a real date, and building a `Date` from it yields an Invalid Date.
 */
export const exportDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidDateInput, "Enter a valid date.")
  .optional();
