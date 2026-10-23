import { describe, expect, it, vi } from "vitest";

import {
  billingCurrencies,
  billingCurrencyMeta,
  type BillingCurrency,
} from "@/lib/billing/currencies";
import { normalizeBillingCurrency } from "@/lib/billing/currency";
import {
  formatPrice,
  getCurrencySymbol,
  getMonthlyEquivalentLabel,
  getPlanPrice,
  getPlanPriceLabel,
  getYearlySavingsPercent,
  planPricing,
} from "@/lib/billing/plans";
import {
  countryToBillingCurrency,
  getDisplayCurrencyForCountry,
} from "@/lib/billing/region";
import type { PaidPlan } from "@/lib/billing/types";

const expectedPrices: Record<
  BillingCurrency,
  Record<PaidPlan, { monthly: number; yearly: number }>
> = {
  USD: { pro: { monthly: 900, yearly: 9_000 }, business: { monthly: 2_400, yearly: 24_000 } },
  PHP: { pro: { monthly: 49_900, yearly: 499_000 }, business: { monthly: 129_900, yearly: 1_299_000 } },
  GBP: { pro: { monthly: 900, yearly: 9_000 }, business: { monthly: 2_400, yearly: 24_000 } },
  CAD: { pro: { monthly: 1_200, yearly: 12_000 }, business: { monthly: 3_200, yearly: 32_000 } },
  AUD: { pro: { monthly: 1_400, yearly: 14_000 }, business: { monthly: 3_600, yearly: 36_000 } },
  EUR: { pro: { monthly: 900, yearly: 9_000 }, business: { monthly: 2_400, yearly: 24_000 } },
  NZD: { pro: { monthly: 1_800, yearly: 18_000 }, business: { monthly: 4_800, yearly: 48_000 } },
  SGD: { pro: { monthly: 1_200, yearly: 12_000 }, business: { monthly: 3_200, yearly: 32_000 } },
  AED: { pro: { monthly: 3_500, yearly: 35_000 }, business: { monthly: 8_900, yearly: 89_000 } },
  INR: { pro: { monthly: 49_900, yearly: 499_000 }, business: { monthly: 129_900, yearly: 1_299_000 } },
  ZAR: { pro: { monthly: 12_900, yearly: 129_000 }, business: { monthly: 32_900, yearly: 329_000 } },
};

describe("plan pricing", () => {
  it("supports every agreed currency", () => {
    expect(billingCurrencies).toEqual([
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
    ]);
  });

  it("has the expected fixed local price for every plan and interval", () => {
    for (const currency of billingCurrencies) {
      for (const plan of ["pro", "business"] as const) {
        expect(getPlanPrice(plan, currency, "monthly")).toBe(
          expectedPrices[currency][plan].monthly,
        );
        expect(getPlanPrice(plan, currency, "yearly")).toBe(
          expectedPrices[currency][plan].yearly,
        );
      }
    }
  });

  it("makes every annual price exactly ten times the monthly price", () => {
    for (const currency of billingCurrencies) {
      for (const plan of ["pro", "business"] as const) {
        expect(getPlanPrice(plan, currency, "yearly")).toBe(
          getPlanPrice(plan, currency, "monthly") * 10,
        );
      }
    }
  });

  it("stores a complete, positive integer price set", () => {
    for (const interval of ["monthly", "yearly"] as const) {
      for (const plan of ["pro", "business"] as const) {
        const prices = planPricing[interval][plan];

        expect(Object.keys(prices).sort()).toEqual(
          [...billingCurrencies].sort(),
        );

        for (const price of Object.values(prices)) {
          expect(Number.isInteger(price)).toBe(true);
          expect(price).toBeGreaterThan(0);
        }
      }
    }
  });

  it("always reports the same 17% annual saving", () => {
    for (const currency of billingCurrencies) {
      for (const plan of ["pro", "business"] as const) {
        expect(getYearlySavingsPercent(plan, currency)).toBe(17);
      }
    }
  });
});

describe("formatPrice", () => {
  it("uses fixed symbols and local digit grouping", () => {
    expect(formatPrice(900, "USD")).toBe("$9");
    expect(formatPrice(49_900, "PHP")).toBe("₱499");
    expect(formatPrice(900, "GBP")).toBe("£9");
    expect(formatPrice(1_200, "CAD")).toBe("CA$12");
    expect(formatPrice(1_400, "AUD")).toBe("A$14");
    expect(formatPrice(900, "EUR")).toBe("€9");
    expect(formatPrice(1_800, "NZD")).toBe("NZ$18");
    expect(formatPrice(1_200, "SGD")).toBe("S$12");
    expect(formatPrice(3_500, "AED")).toBe("AED 35");
    expect(formatPrice(49_900, "INR")).toBe("₹499");
    expect(formatPrice(12_900, "ZAR")).toBe("R129");
    expect(formatPrice(129_900, "INR")).toBe("₹1,299");
    expect(formatPrice(129_000, "ZAR")).toBe("R1,290");
  });

  it("shows cents only when the amount is fractional", () => {
    expect(formatPrice(750, "USD")).toBe("$7.50");
    expect(formatPrice(41_583, "PHP")).toBe("₱415.83");
    expect(formatPrice(0, "USD")).toBe("$0");
    expect(formatPrice(0, "AED")).toBe("AED 0");
  });

  it("builds plan and monthly-equivalent labels", () => {
    expect(getPlanPriceLabel("pro", "USD", "monthly")).toBe("$9/mo");
    expect(getPlanPriceLabel("pro", "USD", "yearly")).toBe("$90/yr");
    expect(getPlanPriceLabel("business", "CAD", "monthly")).toBe("CA$32/mo");
    expect(getMonthlyEquivalentLabel("pro", "USD")).toBe("$7.50/mo");
    expect(getMonthlyEquivalentLabel("pro", "PHP")).toBe("₱415.83/mo");
  });

  it("exposes the display symbol without formatting", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("CAD")).toBe("CA$");
    expect(getCurrencySymbol("AED")).toBe("AED");
    expect(getCurrencySymbol("ZAR")).toBe("R");
  });
});

describe("billing currency normalization", () => {
  it("normalizes every supported Polar currency code", () => {
    for (const currency of billingCurrencies) {
      expect(normalizeBillingCurrency(currency.toLowerCase())).toBe(currency);
      expect(normalizeBillingCurrency(currency)).toBe(currency);
    }
  });

  it("defaults unsupported currencies to USD", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(normalizeBillingCurrency("jpy")).toBe("USD");
    expect(normalizeBillingCurrency(null)).toBe("USD");
    expect(normalizeBillingCurrency("")).toBe("USD");

    warn.mockRestore();
  });
});

describe("country pricing", () => {
  it("maps supported markets to their fixed pricing currency", () => {
    expect(getDisplayCurrencyForCountry("GB")).toBe("GBP");
    expect(getDisplayCurrencyForCountry("UK")).toBe("GBP");
    expect(getDisplayCurrencyForCountry("CA")).toBe("CAD");
    expect(getDisplayCurrencyForCountry("AU")).toBe("AUD");
    expect(getDisplayCurrencyForCountry("NZ")).toBe("NZD");
    expect(getDisplayCurrencyForCountry("SG")).toBe("SGD");
    expect(getDisplayCurrencyForCountry("AE")).toBe("AED");
    expect(getDisplayCurrencyForCountry("PH")).toBe("PHP");
    expect(getDisplayCurrencyForCountry("IN")).toBe("INR");
    expect(getDisplayCurrencyForCountry("ZA")).toBe("ZAR");
  });

  it("maps Ireland and eurozone countries to EUR", () => {
    for (const country of [
      "IE",
      "AT",
      "BE",
      "BG",
      "DE",
      "ES",
      "FR",
      "IT",
      "NL",
      "PT",
      "FI",
      "GR",
      "HR",
      "SK",
      "SI",
    ]) {
      expect(getDisplayCurrencyForCountry(country)).toBe("EUR");
    }
  });

  it("defaults unknown, empty, and non-country codes to USD", () => {
    expect(getDisplayCurrencyForCountry("US")).toBe("USD");
    expect(getDisplayCurrencyForCountry("JP")).toBe("USD");
    expect(getDisplayCurrencyForCountry("XX")).toBe("USD");
    expect(getDisplayCurrencyForCountry("")).toBe("USD");
    expect(getDisplayCurrencyForCountry(null)).toBe("USD");
    expect(getDisplayCurrencyForCountry(undefined)).toBe("USD");
  });

  it("only maps to currencies the billing enum supports", () => {
    const supported = new Set<BillingCurrency>(billingCurrencies);

    for (const currency of Object.values(countryToBillingCurrency)) {
      expect(supported.has(currency)).toBe(true);
    }
  });
});

describe("currency metadata", () => {
  it("marks the agreed tax-exclusive markets", () => {
    expect(billingCurrencyMeta.USD.taxInclusive).toBe(false);
    expect(billingCurrencyMeta.CAD.taxInclusive).toBe(false);
    expect(billingCurrencyMeta.INR.taxInclusive).toBe(false);
    expect(billingCurrencyMeta.GBP.taxInclusive).toBe(true);
    expect(billingCurrencyMeta.EUR.taxInclusive).toBe(true);
    expect(billingCurrencyMeta.PHP.taxInclusive).toBe(true);
  });
});
