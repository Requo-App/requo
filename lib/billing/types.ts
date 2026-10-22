/**
 * Central billing type definitions.
 *
 * Re-exports the DB-level enums for convenience and adds domain types
 * for region detection, checkout creation, and webhook processing.
 */

import type { PlanTier } from "@/lib/plans/plans";

export type {
  BillingProvider,
  BillingCurrency,
  SubscriptionStatus,
  PaymentAttemptStatus,
} from "@/lib/db/schema/subscriptions";

export type BillingInterval = "monthly" | "yearly";

export type PaidPlan = Exclude<PlanTier, "free">;

export type PlanPricing = {
  USD: number; // cents
  /**
   * Optional PHP approximation in centavos. Display-only — the
   * authoritative billing currency is USD and Polar handles any
   * local-currency conversion at checkout. Populated by display
   * helpers, never used as a base price.
   */
  PHP?: number;
};

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
