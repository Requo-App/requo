import type { BillingCurrency } from "@/lib/db/schema/subscriptions";

const supportedBillingCurrencies = new Set<BillingCurrency>(["USD", "PHP"]);

/**
 * Polar reports ISO 4217 currency codes in lowercase (`usd`, `php`), while
 * Requo's billing enum is uppercase. Normalize case instead of silently
 * treating every non-PHP value as USD.
 *
 * Requo currently supports USD and PHP. If Polar returns another currency,
 * log it explicitly and fall back to USD rather than accepting an invalid
 * enum value (which would fail the whole webhook retry loop).
 */
export function normalizeBillingCurrency(
  value: string | null | undefined,
): BillingCurrency {
  const normalized = value?.trim().toUpperCase();

  if (normalized && supportedBillingCurrencies.has(normalized as BillingCurrency)) {
    return normalized as BillingCurrency;
  }

  if (normalized) {
    console.warn(
      `[billing] Unsupported Polar currency "${value}"; recording as USD.`,
    );
  }

  return "USD";
}
