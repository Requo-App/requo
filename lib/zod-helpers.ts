import { z } from "zod";

/**
 * Shared Zod input helpers for FormData-first validation.
 *
 * These are intentionally small and pure: normalize untrusted input
 * (missing keys, blank strings, multi-value arrays) before it reaches a
 * Zod schema. Domain-specific parsing (money caps, date ranges, entity
 * rules) stays in the feature schemas — including deliberate divergences:
 * `features/invoices` keeps its own money parser (different number
 * semantics and a 2B cap vs quotes' 100M) and its regex-only date check.
 */

/** `null`, `undefined`, and blank strings become `undefined`. */
export function emptyToUndefined(value: unknown) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

/** First value of a multi-value input, otherwise the value as-is. */
export function firstString(value: unknown) {
  if (Array.isArray(value)) {
    return value[0];
  }

  return value;
}

/**
 * Coerces numbers and numeric strings to a positive integer, labelling
 * failures with `fieldLabel`. Arrays resolve to their first element;
 * blank strings fail (never silently become 0).
 */
export function coercePositiveInteger(fieldLabel: string) {
  return z.preprocess(
    (value) => {
      const normalized = firstString(value);

      if (typeof normalized === "number") {
        return normalized;
      }

      if (typeof normalized !== "string") {
        return normalized;
      }

      const trimmed = normalized.trim();

      if (!trimmed) {
        return Number.NaN;
      }

      return Number(trimmed);
    },
    z
      .number({ error: `${fieldLabel} must be a whole number.` })
      .int(`${fieldLabel} must be a whole number.`)
      .min(1, `${fieldLabel} must be at least 1.`),
  );
}

/** Strict `YYYY-MM-DD` check that rejects impossible dates (e.g. Feb 30). */
export function isValidDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

/**
 * Optional trimmed text with a length cap. Pass `maxMessage` to override
 * the default Zod length message; omitting it preserves Zod's default.
 */
export function optionalText(maxLength: number, maxMessage?: string) {
  return z.preprocess(
    emptyToUndefined,
    maxMessage
      ? z.string().trim().max(maxLength, maxMessage).optional()
      : z.string().trim().max(maxLength).optional(),
  );
}
