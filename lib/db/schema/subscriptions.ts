import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  integer,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/lib/db/schema/auth";
import { businesses } from "@/lib/db/schema/businesses";

/* ── Enums ────────────────────────────────────────────────────────────────── */

export const billingProviders = ["polar"] as const;
export type BillingProvider = (typeof billingProviders)[number];

export const billingProviderEnum = pgEnum("billing_provider", [
  ...billingProviders,
]);

export const subscriptionStatuses = [
  "free",
  "pending",
  "active",
  "past_due",
  "paused",
  "canceled",
  "expired",
  "incomplete",
] as const;
export type SubscriptionStatus = (typeof subscriptionStatuses)[number];

export const subscriptionStatusEnum = pgEnum("subscription_status", [
  ...subscriptionStatuses,
]);

export const billingCurrencies = ["USD", "PHP"] as const;
export type BillingCurrency = (typeof billingCurrencies)[number];

export const billingCurrencyEnum = pgEnum("billing_currency", [
  ...billingCurrencies,
]);

export const paymentAttemptStatuses = [
  "pending",
  "succeeded",
  "failed",
  "expired",
] as const;
export type PaymentAttemptStatus = (typeof paymentAttemptStatuses)[number];

export const paymentAttemptStatusEnum = pgEnum("payment_attempt_status", [
  ...paymentAttemptStatuses,
]);

export const refundStatuses = ["pending", "approved", "failed"] as const;
export type RefundStatus = (typeof refundStatuses)[number];

export const refundStatusEnum = pgEnum("refund_status", [...refundStatuses]);

/* ── account_subscriptions ──────────────────────────────────────────────── */

/**
 * Legacy account-level subscription records retained for historical data only.
 * No application code reads or writes this table; business entitlements and
 * admin billing surfaces resolve from `business_subscriptions`.
 */
export const accountSubscriptions = pgTable(
  "account_subscriptions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: subscriptionStatusEnum("status").notNull().default("free"),
    plan: text("plan").notNull(), // "pro" | "business"
    billingProvider: billingProviderEnum("billing_provider").notNull(),
    billingCurrency: billingCurrencyEnum("billing_currency").notNull(),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    providerCheckoutId: text("provider_checkout_id"),
    paymentMethod: text("payment_method"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("account_subscriptions_user_id_unique").on(table.userId),
    index("account_subscriptions_status_idx").on(table.status),
    index("account_subscriptions_provider_subscription_id_idx").on(
      table.providerSubscriptionId,
    ),
  ],
);

/* ── business_subscriptions ──────────────────────────────────────────────── */

/**
 * One row per business. The billing source of truth for business-scoped
 * subscription state.
 *
 * Businesses without a row are implicitly on the free plan.
 */
export const businessSubscriptions = pgTable(
  "business_subscriptions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    status: subscriptionStatusEnum("status").notNull().default("free"),
    plan: text("plan").notNull(), // "pro" | "business"
    billingProvider: billingProviderEnum("billing_provider").notNull(),
    billingCurrency: billingCurrencyEnum("billing_currency").notNull(),
    providerCustomerId: text("provider_customer_id"),
    providerSubscriptionId: text("provider_subscription_id"),
    providerCheckoutId: text("provider_checkout_id"),
    paymentMethod: text("payment_method"),
    currentPeriodStart: timestamp("current_period_start", {
      withTimezone: true,
    }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    canceledAt: timestamp("canceled_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    /**
     * Occurrence timestamp of the provider event that last wrote this row.
     * Used to reject stale/out-of-order webhook deliveries.
     */
    providerEventAt: timestamp("provider_event_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_subscriptions_business_id_unique").on(table.businessId),
    index("business_subscriptions_status_idx").on(table.status),
    index("business_subscriptions_provider_subscription_id_idx").on(
      table.providerSubscriptionId,
    ),
    index("business_subscriptions_provider_customer_id_idx").on(
      table.providerCustomerId,
    ),
  ],
);

/* ── billing_events ───────────────────────────────────────────────────────── */

/**
 * Idempotent webhook event log. Every incoming provider event is recorded
 * before processing. `status` tracks the processing lifecycle. `processedAt`
 * is set once the event produces a side-effect. Duplicate events (same
 * `providerEventId`) are skipped.
 *
 * `status` values: "processing" | "processed" | "failed" | "ignored".
 */
export const billingEvents = pgTable(
  "billing_events",
  {
    id: text("id").primaryKey(),
    providerEventId: text("provider_event_id").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    eventType: text("event_type").notNull(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    businessId: text("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload").notNull(),
    status: text("status").notNull().default("processing"),
    errorMessage: text("error_message"),
    processedAt: timestamp("processed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("billing_events_provider_event_id_unique").on(
      table.providerEventId,
    ),
    index("billing_events_user_id_idx").on(table.userId),
    index("billing_events_business_id_idx").on(table.businessId),
    index("billing_events_provider_idx").on(table.provider),
  ],
);

/* ── payment_attempts ─────────────────────────────────────────────────────── */

/**
 * Payment history for audit, customer support, and UI display.
 */
export const paymentAttempts = pgTable(
  "payment_attempts",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    businessId: text("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    plan: text("plan").notNull(),
    provider: billingProviderEnum("provider").notNull(),
    providerPaymentId: text("provider_payment_id").notNull(),
    amount: integer("amount").notNull(), // in smallest currency unit (centavos / cents)
    currency: billingCurrencyEnum("currency").notNull(),
    status: paymentAttemptStatusEnum("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("payment_attempts_provider_payment_id_unique").on(
      table.provider,
      table.providerPaymentId,
    ),
    index("payment_attempts_user_id_idx").on(table.userId),
    index("payment_attempts_business_id_idx").on(table.businessId),
    index("payment_attempts_provider_payment_id_idx").on(
      table.providerPaymentId,
    ),
  ],
);

/* ── refunds ─────────────────────────────────────────────────────────────── */

/**
 * Refund records.
 *
 * As of the canonical-Polar refactor, this table is **read-only** at the
 * application layer. Refunds are issued exclusively through the Polar
 * customer portal, and the Polar webhook route no longer reacts to
 * `refund.*` events — those events fall through to the catch-all
 * handler and are recorded in `billing_events` with status `ignored`.
 * Subscription state changes that follow a refund (e.g. cancellation
 * at period end, immediate revocation) are reflected via
 * `subscription.canceled` / `subscription.revoked` webhooks and the
 * subscription handlers, not via this table.
 *
 * Existing rows are historical: they were written by the previous
 * self-serve refund flow (`requestRefundForPayment` +
 * `app/api/billing/refund/route.ts`) and the previous `refund.*`
 * webhook handlers, both removed. The table is preserved so historical
 * refund context remains queryable by support and audit tooling, but
 * no application code path inserts new rows.
 */
export const refunds = pgTable(
  "refunds",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: billingProviderEnum("provider").notNull(),
    providerRefundId: text("provider_refund_id"),
    providerPaymentId: text("provider_payment_id").notNull(),
    amount: integer("amount").notNull(), // in smallest currency unit (centavos / cents)
    currency: billingCurrencyEnum("currency").notNull(),
    status: refundStatusEnum("status").notNull().default("pending"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("refunds_user_id_idx").on(table.userId),
    index("refunds_provider_payment_id_idx").on(table.providerPaymentId),
    index("refunds_status_idx").on(table.status),
  ],
);
