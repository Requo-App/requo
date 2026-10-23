import {
  isBillingCurrency,
  type BillingCurrency,
} from "@/lib/billing/currencies";

/**
 * Polar reports ISO 4217 currency codes in lowercase (`usd`, `php`), while
 * Requo's billing enum is uppercase. Normalize case and validate against the
 * currencies the app supports.
 *
 * If Polar returns a currency Requo has not configured, log it explicitly and
 * fall back to USD rather than accepting an invalid enum value (which would
 * fail the whole webhook retry loop).
 */
export function normalizeBillingCurrency(
  value: string | null | undefined,
): BillingCurrency {
  const normalized = value?.trim().toUpperCase();

  if (normalized && isBillingCurrency(normalized)) {
    return normalized;
  }

  if (normalized) {
    console.warn(
      `[billing] Unsupported Polar currency "${value}"; recording as USD.`,
    );
  }

  return "USD";
}
