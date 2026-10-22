import "server-only";

import { env } from "@/lib/env";
import type { BillingInterval, PaidPlan } from "@/lib/billing/types";

/**
 * Pure helpers for resolving Requo `(plan, interval)` pairs to Polar
 * product ids and back. The mapping is sourced from `POLAR_*_PRODUCT_ID`
 * env vars — there is no I/O and no module state beyond the env read.
 *
 * Used by both the redirect route in
 * `app/api/billing/checkout/route.ts` (forward lookup, picks
 * the product id to hand to the canonical `Checkout` adapter) and the
 * subscription webhook handler (reverse lookup, recovers the plan
 * from a `subscription.*` event payload).
 *
 * Legacy product ids (`POLAR_LEGACY_*_PRODUCT_ID`) exist so subscriptions
 * created under the previous pricing keep resolving on the webhook after
 * the product ids are swapped for the new prices. New checkouts always
 * use the current product ids.
 */

export type PolarProductIdMap = {
  proMonthly?: string;
  proYearly?: string;
  businessMonthly?: string;
  businessYearly?: string;
  legacyProMonthly?: string;
  legacyProYearly?: string;
  legacyBusinessMonthly?: string;
  legacyBusinessYearly?: string;
};

const PRODUCT_KEYS = {
  "pro:monthly": "proMonthly",
  "pro:yearly": "proYearly",
  "business:monthly": "businessMonthly",
  "business:yearly": "businessYearly",
} as const;

/**
 * Returns the product id map sourced from the current env. Reads env
 * on every call — env is parsed once at process start, so the call
 * cost is just eight object property reads.
 */
export function getPolarProductIds(): PolarProductIdMap {
  return {
    proMonthly: env.POLAR_PRO_PRODUCT_ID,
    proYearly: env.POLAR_PRO_YEARLY_PRODUCT_ID,
    businessMonthly: env.POLAR_BUSINESS_PRODUCT_ID,
    businessYearly: env.POLAR_BUSINESS_YEARLY_PRODUCT_ID,
    legacyProMonthly: env.POLAR_LEGACY_PRO_PRODUCT_ID,
    legacyProYearly: env.POLAR_LEGACY_PRO_YEARLY_PRODUCT_ID,
    legacyBusinessMonthly: env.POLAR_LEGACY_BUSINESS_PRODUCT_ID,
    legacyBusinessYearly: env.POLAR_LEGACY_BUSINESS_YEARLY_PRODUCT_ID,
  };
}

/**
 * Resolves a `(plan, interval)` pair to the configured Polar product
 * id, or `undefined` when no product id is configured for that pair.
 * New checkouts always use the current (non-legacy) product ids.
 */
export function getPolarProductId(
  plan: PaidPlan,
  interval: BillingInterval,
  productIds: PolarProductIdMap = getPolarProductIds(),
): string | undefined {
  const key = `${plan}:${interval}` as keyof typeof PRODUCT_KEYS;
  const productKey = PRODUCT_KEYS[key];
  return productIds[productKey];
}

/**
 * Reverse-maps a Polar product id to the Requo `(plan, interval)`
 * pair. Current product ids are checked first, then the optional
 * legacy ids, so active subscriptions created under the previous
 * pricing continue to resolve. Pure lookup over the eight entries
 * in the supplied map — exported for the webhook subscription handler.
 */
export function reversePolarProductId(
  productId: string,
  productIds: PolarProductIdMap = getPolarProductIds(),
): { plan: PaidPlan; interval: BillingInterval } | undefined {
  if (!productId) return undefined;

  if (productId === productIds.proMonthly) {
    return { plan: "pro", interval: "monthly" };
  }
  if (productId === productIds.proYearly) {
    return { plan: "pro", interval: "yearly" };
  }
  if (productId === productIds.businessMonthly) {
    return { plan: "business", interval: "monthly" };
  }
  if (productId === productIds.businessYearly) {
    return { plan: "business", interval: "yearly" };
  }

  if (productId === productIds.legacyProMonthly) {
    return { plan: "pro", interval: "monthly" };
  }
  if (productId === productIds.legacyProYearly) {
    return { plan: "pro", interval: "yearly" };
  }
  if (productId === productIds.legacyBusinessMonthly) {
    return { plan: "business", interval: "monthly" };
  }
  if (productId === productIds.legacyBusinessYearly) {
    return { plan: "business", interval: "yearly" };
  }

  return undefined;
}
