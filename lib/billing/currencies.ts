/**
 * Canonical billing currency list and display metadata.
 *
 * Requo charges fixed local prices rather than converting a USD base at
 * checkout. The database enum, price table, formatters, and country mapping
 * all read from this module so adding a currency cannot drift between layers.
 *
 * Keep this module free of runtime imports from the database schema: pricing
 * helpers are used by client components, and importing Drizzle schema code
 * would pull Postgres table definitions into the browser bundle.
 */

export const billingCurrencies = [
  "USD",
  "PHP",
  "GBP",
  "CAD",
  "AUD",
  "EUR",
  "NZD",
  "SGD",
  "AED",
  "INR",
  "ZAR",
] as const;

export type BillingCurrency = (typeof billingCurrencies)[number];

export type BillingCurrencyMeta = {
  /** Human-readable currency name for docs and admin surfaces. */
  label: string;
  /** Locale used for digit grouping in that currency's market. */
  locale: string;
  /** Symbol shown before the amount. */
  symbol: string;
  /**
   * Text prefix used by `formatPrice`. Most currencies use the symbol; the
   * dirham uses its ISO code plus a space so "AED 35" is unambiguous.
   */
  prefix: string;
  /**
   * Polar's default tax behavior in this currency's home market. Actual tax
   * is determined from the customer's billing location, so this is
   * documentation metadata rather than a runtime calculation.
   */
  taxInclusive: boolean;
};

export const billingCurrencyMeta: Record<
  BillingCurrency,
  BillingCurrencyMeta
> = {
  USD: {
    label: "US dollar",
    locale: "en-US",
    symbol: "$",
    prefix: "$",
    taxInclusive: false,
  },
  PHP: {
    label: "Philippine peso",
    locale: "en-PH",
    symbol: "₱",
    prefix: "₱",
    taxInclusive: true,
  },
  GBP: {
    label: "British pound",
    locale: "en-GB",
    symbol: "£",
    prefix: "£",
    taxInclusive: true,
  },
  CAD: {
    label: "Canadian dollar",
    locale: "en-US",
    symbol: "CA$",
    prefix: "CA$",
    taxInclusive: false,
  },
  AUD: {
    label: "Australian dollar",
    locale: "en-US",
    symbol: "A$",
    prefix: "A$",
    taxInclusive: true,
  },
  EUR: {
    label: "Euro",
    locale: "en-IE",
    symbol: "€",
    prefix: "€",
    taxInclusive: true,
  },
  NZD: {
    label: "New Zealand dollar",
    locale: "en-US",
    symbol: "NZ$",
    prefix: "NZ$",
    taxInclusive: true,
  },
  SGD: {
    label: "Singapore dollar",
    locale: "en-US",
    symbol: "S$",
    prefix: "S$",
    taxInclusive: true,
  },
  AED: {
    label: "United Arab Emirates dirham",
    locale: "en-US",
    symbol: "AED",
    prefix: "AED ",
    taxInclusive: true,
  },
  INR: {
    label: "Indian rupee",
    locale: "en-IN",
    symbol: "₹",
    prefix: "₹",
    taxInclusive: false,
  },
  ZAR: {
    label: "South African rand",
    locale: "en-US",
    symbol: "R",
    prefix: "R",
    taxInclusive: true,
  },
};

const billingCurrencySet = new Set<string>(billingCurrencies);

/** Narrows an arbitrary currency code to the billing enum. */
export function isBillingCurrency(value: string): value is BillingCurrency {
  return billingCurrencySet.has(value);
}
