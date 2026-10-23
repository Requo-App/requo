/**
 * Plan pricing definitions for the billing system.
 *
 * Requo charges a fixed local price in every supported currency. These are
 * not runtime conversions of a USD base: Polar products carry a price in each
 * currency, and the checkout currency is selected from the customer's IP.
 * Annual prices are always ten times the monthly price (two months free).
 */

import { billingCurrencyMeta } from "@/lib/billing/currencies";
import type {
  BillingCurrency,
  BillingInterval,
  PaidPlan,
  PlanPricing,
} from "@/lib/billing/types";

/**
 * Prices in each currency's smallest unit. Most supported currencies use two
 * decimal places, so 900 is USD 9.00, 49900 is PHP 499.00, and so on.
 */
export const planPricing: Record<
  BillingInterval,
  Record<PaidPlan, PlanPricing>
> = {
  monthly: {
    pro: {
      USD: 900,
      PHP: 49_900,
      GBP: 900,
      CAD: 1_200,
      AUD: 1_400,
      EUR: 900,
      NZD: 1_800,
      SGD: 1_200,
      AED: 3_500,
      INR: 49_900,
      ZAR: 12_900,
    },
    business: {
      USD: 2_400,
      PHP: 129_900,
      GBP: 2_400,
      CAD: 3_200,
      AUD: 3_600,
      EUR: 2_400,
      NZD: 4_800,
      SGD: 3_200,
      AED: 8_900,
      INR: 129_900,
      ZAR: 32_900,
    },
  },
  yearly: {
    pro: {
      USD: 9_000,
      PHP: 499_000,
      GBP: 9_000,
      CAD: 12_000,
      AUD: 14_000,
      EUR: 9_000,
      NZD: 18_000,
      SGD: 12_000,
      AED: 35_000,
      INR: 499_000,
      ZAR: 129_000,
    },
    business: {
      USD: 24_000,
      PHP: 1_299_000,
      GBP: 24_000,
      CAD: 32_000,
      AUD: 36_000,
      EUR: 24_000,
      NZD: 48_000,
      SGD: 32_000,
      AED: 89_000,
      INR: 1_299_000,
      ZAR: 329_000,
    },
  },
};

/** Returns the price in the currency's smallest unit. */
export function getPlanPrice(
  plan: PaidPlan,
  currency: BillingCurrency,
  interval: BillingInterval = "monthly",
): number {
  const pricing = planPricing[interval][plan];
  // The price table is complete, but keep a safe fallback for callers that
  // receive a currency added to the enum before its prices are configured.
  return pricing[currency] ?? pricing.USD;
}

/**
 * Formats a price in a currency's smallest unit using that currency's locale
 * for digit grouping. Whole prices omit decimals; a monthly equivalent with
 * cents shows exactly two (for example "$7.50" or "₱415.83").
 */
export function formatPrice(
  amountInSmallestUnit: number,
  currency: BillingCurrency,
): string {
  if (!Number.isFinite(amountInSmallestUnit)) return "";

  const meta = billingCurrencyMeta[currency];
  const roundedMinorUnits = Math.round(amountInSmallestUnit);
  const hasFraction = Math.abs(roundedMinorUnits % 100) > 0;
  const fractionDigits = hasFraction ? 2 : 0;
  const formattedAmount = new Intl.NumberFormat(meta.locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(roundedMinorUnits / 100);

  return `${meta.prefix}${formattedAmount}`;
}

/** Returns the formatted price string for a plan, currency and interval. */
export function getPlanPriceLabel(
  plan: PaidPlan,
  currency: BillingCurrency,
  interval: BillingInterval = "monthly",
): string {
  const suffix = interval === "monthly" ? "/mo" : "/yr";
  return `${formatPrice(getPlanPrice(plan, currency, interval), currency)}${suffix}`;
}

/**
 * Returns the monthly equivalent label for yearly plans.
 * e.g. "$7.50/mo" for Pro yearly at USD.
 */
export function getMonthlyEquivalentLabel(
  plan: PaidPlan,
  currency: BillingCurrency,
): string {
  const yearlyPrice = getPlanPrice(plan, currency, "yearly");
  const monthlyEquivalent = Math.round(yearlyPrice / 12);
  return `${formatPrice(monthlyEquivalent, currency)}/mo`;
}

/**
 * Returns the savings percentage for yearly vs monthly billing.
 * Annual pricing is billed as 10 months for the price of 12 ("two months
 * free"), so every plan saves exactly one sixth. Retained for compatibility;
 * UI copy should use the "Two months free" wording from the plan catalog.
 */
export function getYearlySavingsPercent(
  plan: PaidPlan,
  currency: BillingCurrency,
): number {
  const monthlyTotal = getPlanPrice(plan, currency, "monthly") * 12;
  const yearlyTotal = getPlanPrice(plan, currency, "yearly");
  return Math.round(((monthlyTotal - yearlyTotal) / monthlyTotal) * 100);
}

/** Returns the display symbol for a billing currency. */
export function getCurrencySymbol(currency: BillingCurrency): string {
  return billingCurrencyMeta[currency].symbol;
}
