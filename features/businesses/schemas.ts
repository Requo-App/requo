import { z } from "zod";

import {
  isSupportedBusinessCountryCode,
  isSupportedBusinessCurrencyCode,
  normalizeBusinessCountryCode,
  normalizeBusinessCurrencyCode,
} from "@/features/businesses/locale";
import { businessTypes } from "@/features/inquiries/business-types";
import { validateBusinessSlug } from "@/features/businesses/validation";

export const createBusinessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a business name.")
    .max(80, "Use 80 characters or fewer."),
  slug: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() === "" ? undefined : value,
    z
      .string()
      .trim()
      .min(2, "Enter a URL slug.")
      .max(60, "Use 60 characters or fewer.")
      .regex(
        /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/,
        "Use only lowercase letters, numbers, and hyphens.",
      )
      .refine(
        (value) => validateBusinessSlug(value).valid,
        "This slug is unavailable — it conflicts with a system route.",
      )
      .optional(),
  ),
  countryCode: z
    .string()
    .trim()
    .min(1, "Choose a country.")
    .transform(normalizeBusinessCountryCode)
    .refine(isSupportedBusinessCountryCode, "Choose a valid country."),
  businessType: z.enum(businessTypes),
  defaultCurrency: z
    .string()
    .trim()
    .min(1, "Choose a currency.")
    .transform(normalizeBusinessCurrencyCode)
    .refine(
      isSupportedBusinessCurrencyCode,
      "Choose a supported currency.",
    ),
  businessId: z.string().trim().min(1, "Please select a temporary business."),
});

/**
 * One named service row sent from business-creation surfaces (onboarding
 * step 3, businesses hub). The first row pre-fills from the business-type
 * preset and stays editable; extra rows must be non-empty. The server trims
 * to the plan's live-service limit.
 */
export const businessServiceEntrySchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Service names need at least 2 characters.")
    .max(80, "Use 80 characters or fewer."),
});

/**
 * Parses the named-services blob sent from a business-creation form. Keeps
 * valid non-empty rows, drops blank or malformed ones, and always returns at
 * least one entry so a business is never created without a service.
 */
export function parseBusinessServiceNames(
  raw: FormDataEntryValue | null,
): Array<{ name: string }> {
  const fallback: Array<{ name: string }> = [{ name: "" }];

  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return fallback;
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return fallback;
    }

    const services = parsed.flatMap((entry) => {
      const name =
        entry && typeof entry === "object" && typeof (entry as { name?: unknown }).name === "string"
          ? (entry as { name: string }).name
          : "";
      const result = businessServiceEntrySchema.safeParse({ name });

      return result.success ? [{ name: result.data.name }] : [];
    });

    return services.length > 0 ? services : fallback;
  } catch {
    return fallback;
  }
}

export const recentlyOpenedBusinessSchema = z.object({
  businessSlug: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[a-z0-9-]+$/),
});
