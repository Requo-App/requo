/**
 * Central billing type definitions.
 *
 * Re-exports the DB-level enums for convenience and adds domain types
 * for region detection, checkout creation, and webhook processing.
 */

import type { BillingCurrency } from "@/lib/billing/currencies";
import type { PlanTier } from "@/lib/plans/plans";

export type { BillingCurrency } from "@/lib/billing/currencies";
export type {
  BillingProvider,
  SubscriptionStatus,
  PaymentAttemptStatus,
} from "@/lib/db/schema/subscriptions";

export type BillingInterval = "monthly" | "yearly";

export type PaidPlan = Exclude<PlanTier, "free">;

/**
 * A complete set of fixed local prices, in each currency's smallest unit
 * (for example cents, centavos, pence, paise, and fils).
 */
export type PlanPricing = Record<BillingCurrency, number>;

export type CheckoutResult =
  | {
      type: "redirect";
      url: string;
    }
  | {
      type: "error";
      message: string;
    };

export type WebhookProcessResult = {
  success: boolean;
  message: string;
  businessId?: string;
};
