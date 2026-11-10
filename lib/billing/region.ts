/**
 * Detect the visitor's billing currency from Vercel geo headers.
 *
 * Vercel sets `x-vercel-ip-country` to an ISO 3166-1 alpha-2 country code on
 * requests it proxies. Visitors in a supported market see that market's fixed
 * local prices; every other country defaults to USD.
 *
 * This is a display and checkout-market signal only. Polar still calculates
 * tax and chooses the product price from the customer's IP at checkout.
 */

import { headers } from "next/headers";

import type { BillingCurrency } from "@/lib/billing/types";

/** Countries mapped to a non-USD fixed pricing currency. */
export const countryToBillingCurrency: Readonly<
  Record<string, BillingCurrency>
> = {
  // British pound
  GB: "GBP",
  IM: "GBP",
  JE: "GBP",
  GG: "GBP",
  UK: "GBP", // Defensive alias; Vercel emits ISO "GB".

  // Canadian dollar
  CA: "CAD",

  // Australian dollar
  AU: "AUD",

  // Euro (eurozone members plus countries that use the euro)
  AT: "EUR",
  BE: "EUR",
  BG: "EUR",
  CY: "EUR",
  DE: "EUR",
  EE: "EUR",
  ES: "EUR",
  FI: "EUR",
  FR: "EUR",
  GR: "EUR",
  HR: "EUR",
  IE: "EUR",
  IT: "EUR",
  LT: "EUR",
  LU: "EUR",
  LV: "EUR",
  MT: "EUR",
  NL: "EUR",
  PT: "EUR",
  SI: "EUR",
  SK: "EUR",
  AD: "EUR",
  MC: "EUR",
  ME: "EUR",
  SM: "EUR",
  VA: "EUR",
  XK: "EUR",

  // New Zealand dollar
  NZ: "NZD",

  // Singapore dollar
  SG: "SGD",

  // UAE dirham
  AE: "AED",

  // Philippine peso
  PH: "PHP",

  // Indian rupee
  IN: "INR",

  // South African rand
  ZA: "ZAR",
};

/**
 * Returns the fixed pricing currency for a country code. Unknown, empty, or
 * non-country values (including Vercel's `XX` fallback) resolve to USD.
 */
export function getDisplayCurrencyForCountry(
  countryCode: string | null | undefined,
): BillingCurrency {
  const normalized = countryCode?.trim().toUpperCase();

  if (
    normalized &&
    Object.prototype.hasOwnProperty.call(
      countryToBillingCurrency,
      normalized,
    )
  ) {
    return countryToBillingCurrency[normalized];
  }

  return "USD";
}

function getCountryHeaderNames() {
  const configured = process.env.GEO_COUNTRY_HEADER?.trim();
  const defaults = ["x-vercel-ip-country", "cf-ipcountry"];

  return configured
    ? [configured]
    : defaults;
}

function readCountryHeader(
  headerStore: Awaited<ReturnType<typeof headers>>,
): string | null {
  for (const name of getCountryHeaderNames()) {
    const value = headerStore.get(name)?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

/** Reads the configured geo header and returns the matching display currency. */
export async function detectDisplayCurrency(): Promise<BillingCurrency> {
  const headerStore = await headers();
  return getDisplayCurrencyForCountry(readCountryHeader(headerStore));
}

/**
 * Reads the visitor's ISO country from the configured geo header.
 *
 * Returns `null` when the header is absent or set to the `XX` fallback.
 * Callers that gate a payment method must treat `null` as "not in the
 * Philippines".
 */
export async function detectVisitorCountry(): Promise<string | null> {
  const headerStore = await headers();
  const value = readCountryHeader(headerStore)?.toUpperCase();

  if (!value || value === "XX") {
    return null;
  }

  return value;
}
