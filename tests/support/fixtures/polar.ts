/**
 * Polar webhook payload fixtures.
 *
 * Each fixture returns a raw JSON-serialisable object matching the
 * snake_case shape that Polar sends over HTTP via Standard-Webhooks.
 * The `@polar-sh/sdk` `validateEvent` helper parses and preserves that
 * shape for the versioned typed payloads our route handlers consume —
 * so the fixtures are validated end-to-end when tests post them through
 * the actual `Webhooks` adapter (combined with the signing helper in
 * `tests/support/polar-webhook-signing.ts`).
 *
 * The fixtures intentionally only cover the subset of events the
 * Polar webhook route reacts to (`subscription.created`,
 * `subscription.updated`, `subscription.revoked`, `order.paid`)
 * plus a duplicate-delivery payload (a stable `subscription.created`
 * fixture posted twice) and an unresolvable-business payload (every
 * identity source is absent). Other event types are not exercised
 * by the integration tests this slice adds.
 *
 * Field defaults are deterministic so fixtures are diffable across
 * runs. Override only the fields a particular test cares about — the
 * builders fill in the rest with plausible values.
 */

/* ── Deterministic anchors ────────────────────────────────────────────────── */

/**
 * Anchor timestamp shared across every Polar fixture so generated
 * payloads diff cleanly across test runs. Mirrors the `FIXTURE_NOW`
 * constant in `tests/support/fixtures/billing.ts`.
 */
const FIXTURE_NOW = "2026-04-20T00:00:00.000Z";
const FIXTURE_PERIOD_START = "2026-04-01T00:00:00.000Z";
const FIXTURE_PERIOD_END_FUTURE = "2099-05-20T00:00:00.000Z";
const FIXTURE_PERIOD_END_PAST = "2026-04-10T00:00:00.000Z";
const FIXTURE_ORG_ID = "org_polar_fixture";

/* ── Public override types ────────────────────────────────────────────────── */

/**
 * Fields a caller can override on any Polar payload fixture. Each
 * override threads onto the underlying raw payload at the documented
 * snake_case key. Anything not listed here keeps its deterministic
 * default.
 */
export type PolarFixtureOverrides = {
  /** Polar event timestamp (top-level `payload.timestamp`). */
  eventTimestamp?: string;
  /** Requo `user.id` to thread onto `data.customer.external_id`. */
  externalId?: string | null;
  /** Polar customer id (`data.customer.id`). */
  customerId?: string;
  /** Customer email (`data.customer.email`). */
  customerEmail?: string;
  /** Polar product id (`data.product_id`). */
  productId?: string;
  /** Polar subscription id (`data.id` for subscription events). */
  subscriptionId?: string;
  /** Polar order id (`data.id` for order events; `data.order_id` for refund events). */
  orderId?: string;
  /** Polar refund id (`data.id` for refund events). */
  refundId?: string;
  /** Order/refund/subscription `currency` (lowercase ISO 4217 per Polar). */
  currency?: string;
  /** Order amount in cents (`data.total_amount` for orders). */
  amount?: number;
  /** Subscription period start ISO timestamp. */
  currentPeriodStart?: string;
  /** Subscription period end ISO timestamp. */
  currentPeriodEnd?: string;
  /** Polar `metadata.userId` fallback on subscription/order payloads. */
  metadataUserId?: string;
  /** Plan label propagated through `data.metadata.plan`. */
  metadataPlan?: "pro" | "business";
};

/* ── Internal builders ────────────────────────────────────────────────────── */

/**
 * Reusable Standard-Webhooks event envelope. Polar wraps every event
 * payload under `{ type, timestamp, data }` with the timestamp echoed
 * separately as the `webhook-timestamp` HTTP header.
 */
type EventEnvelope<TType extends string, TData> = {
  type: TType;
  timestamp: string;
  data: TData;
};

function defaultEventTimestamp(overrides: PolarFixtureOverrides): string {
  return overrides.eventTimestamp ?? FIXTURE_NOW;
}

function buildSubscriptionCustomer(
  overrides: PolarFixtureOverrides,
): Record<string, unknown> {
  const externalIdOverride = "externalId" in overrides
    ? overrides.externalId
    : "user_polar_fixture";
  return {
    id: overrides.customerId ?? "cus_polar_fixture",
    created_at: FIXTURE_NOW,
    modified_at: null,
    metadata: {},
    external_id: externalIdOverride,
    email: overrides.customerEmail ?? "fixture@example.com",
    email_verified: true,
    type: "individual",
    name: "Fixture Customer",
    billing_address: null,
    tax_id: null,
    locale: null,
    organization_id: FIXTURE_ORG_ID,
    deleted_at: null,
    avatar_url: "https://avatars.example.com/fixture.png",
  };
}

function buildOrderCustomer(
  overrides: PolarFixtureOverrides,
): Record<string, unknown> {
  // Order customer carries the same shape as subscription customer.
  return buildSubscriptionCustomer(overrides);
}

function buildProductPrice(productId: string): Record<string, unknown> {
  return {
    created_at: FIXTURE_NOW,
    modified_at: null,
    id: "price_polar_fixture",
    source: "catalog",
    amount_type: "fixed",
    price_currency: "usd",
    tax_behavior: null,
    is_archived: false,
    product_id: productId,
    price_amount: 1900,
  };
}

function buildProduct(productId: string): Record<string, unknown> {
  return {
    id: productId,
    created_at: FIXTURE_NOW,
    modified_at: null,
    trial_interval: null,
    trial_interval_count: null,
    name: "Fixture Product",
    description: null,
    visibility: "public",
    recurring_interval: "month",
    recurring_interval_count: 1,
    is_recurring: true,
    is_archived: false,
    organization_id: FIXTURE_ORG_ID,
    metadata: {},
    prices: [buildProductPrice(productId)],
    benefits: [],
    medias: [],
    attached_custom_fields: [],
  };
}

/**
 * Builds the snake_case `data` object for any subscription event. The
 * `status`, `canceled_at`, and `current_period_end` fields can be
 * overridden by per-event helpers below to model active vs canceled
 * vs revoked transitions.
 */
function buildSubscriptionData(
  overrides: PolarFixtureOverrides,
  status: string,
  extras: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const productId = overrides.productId ?? "prod_polar_fixture_pro_monthly";
  const subscriptionId = overrides.subscriptionId ?? "sub_polar_fixture";

  const metadata: Record<string, unknown> = {};
  const metadataUserId =
    "metadataUserId" in overrides
      ? overrides.metadataUserId
      : overrides.externalId ?? "user_polar_fixture";
  if (typeof metadataUserId === "string" && metadataUserId.length > 0) {
    metadata.userId = metadataUserId;
  }
  if (overrides.metadataPlan) {
    metadata.plan = overrides.metadataPlan;
  }

  return {
    created_at: FIXTURE_NOW,
    modified_at: null,
    id: subscriptionId,
    amount: overrides.amount ?? 1900,
    currency: overrides.currency ?? "usd",
    recurring_interval: "month",
    recurring_interval_count: 1,
    status,
    current_period_start:
      overrides.currentPeriodStart ?? FIXTURE_PERIOD_START,
    current_period_end:
      overrides.currentPeriodEnd ?? FIXTURE_PERIOD_END_FUTURE,
    trial_start: null,
    trial_end: null,
    cancel_at_period_end: false,
    canceled_at: null,
    started_at: FIXTURE_PERIOD_START,
    ends_at: null,
    ended_at: null,
    customer_id: overrides.customerId ?? "cus_polar_fixture",
    product_id: productId,
    discount_id: null,
    checkout_id: null,
    customer_cancellation_reason: null,
    customer_cancellation_comment: null,
    metadata,
    customer: buildSubscriptionCustomer(overrides),
    product: buildProduct(productId),
    discount: null,
    prices: [buildProductPrice(productId)],
    meters: [],
    pending_update: null,
    ...extras,
  };
}

function buildOrderData(
  overrides: PolarFixtureOverrides,
  status: string,
  extras: Partial<Record<string, unknown>> = {},
): Record<string, unknown> {
  const orderId = overrides.orderId ?? "order_polar_fixture";
  const subscriptionId = overrides.subscriptionId ?? "sub_polar_fixture";
  const totalAmount = overrides.amount ?? 1900;

  const metadata: Record<string, unknown> = {};
  const metadataUserId =
    "metadataUserId" in overrides
      ? overrides.metadataUserId
      : overrides.externalId ?? "user_polar_fixture";
  if (typeof metadataUserId === "string" && metadataUserId.length > 0) {
    metadata.userId = metadataUserId;
  }
  if (overrides.metadataPlan) {
    metadata.plan = overrides.metadataPlan;
  }

  return {
    id: orderId,
    created_at: FIXTURE_NOW,
    modified_at: null,
    status,
    paid: status === "paid",
    subtotal_amount: totalAmount,
    discount_amount: 0,
    net_amount: totalAmount,
    tax_amount: 0,
    total_amount: totalAmount,
    applied_balance_amount: 0,
    due_amount: 0,
    refunded_amount: 0,
    refunded_tax_amount: 0,
    currency: overrides.currency ?? "usd",
    billing_reason: "subscription_cycle",
    billing_name: "Fixture Customer",
    billing_address: null,
    invoice_number: "INV-FIXTURE-001",
    is_invoice_generated: true,
    customer_id: overrides.customerId ?? "cus_polar_fixture",
    product_id: overrides.productId ?? "prod_polar_fixture_pro_monthly",
    discount_id: null,
    subscription_id: subscriptionId,
    checkout_id: null,
    metadata,
    platform_fee_amount: 0,
    platform_fee_currency: null,
    customer: buildOrderCustomer(overrides),
    product: null,
    discount: null,
    subscription: null,
    items: [
      {
        created_at: FIXTURE_NOW,
        modified_at: null,
        id: "item_polar_fixture",
        label: "Fixture line item",
        amount: totalAmount,
        tax_amount: 0,
        proration: false,
        product_price_id: "price_polar_fixture",
      },
    ],
    description: "Fixture order",
    ...extras,
  };
}

/* ── Subscription payloads ────────────────────────────────────────────────── */

/**
 * `subscription.created` payload. Status defaults to `active` so the
 * happy-path integration test can assert the row activates without
 * an additional `subscription.active` delivery. Overrides let callers
 * pin the customer / subscription / product ids and metadata.
 */
export function polarSubscriptionCreatedPayload(
  overrides: PolarFixtureOverrides = {},
): EventEnvelope<"subscription.created", Record<string, unknown>> {
  return {
    type: "subscription.created",
    timestamp: defaultEventTimestamp(overrides),
    data: buildSubscriptionData(overrides, "active"),
  };
}

/**
 * `subscription.updated` payload modelling a "canceled with future
 * period end" transition: Polar marks `status = canceled` but
 * `current_period_end` is still in the future, so Requo flips the
 * row to `canceled` (grace period) without dropping access yet.
 */
export function polarSubscriptionCanceledFuturePayload(
  overrides: PolarFixtureOverrides = {},
): EventEnvelope<"subscription.updated", Record<string, unknown>> {
  const periodEnd = overrides.currentPeriodEnd ?? FIXTURE_PERIOD_END_FUTURE;
  return {
    type: "subscription.updated",
    timestamp: defaultEventTimestamp(overrides),
    data: buildSubscriptionData(overrides, "canceled", {
      cancel_at_period_end: true,
      canceled_at: FIXTURE_NOW,
      current_period_end: periodEnd,
    }),
  };
}

/**
 * `subscription.revoked` payload — Polar's signal that paid access
 * is gone immediately (retries exhausted or explicit revoke). The
 * Requo handler downgrades the row to `expired` and resets the
 * denormalised `businesses.plan` cache to `"free"`.
 */
export function polarSubscriptionRevokedPayload(
  overrides: PolarFixtureOverrides = {},
): EventEnvelope<"subscription.revoked", Record<string, unknown>> {
  return {
    type: "subscription.revoked",
    timestamp: defaultEventTimestamp(overrides),
    data: buildSubscriptionData(overrides, "canceled", {
      cancel_at_period_end: false,
      canceled_at: FIXTURE_NOW,
      ended_at: FIXTURE_NOW,
      current_period_end: overrides.currentPeriodEnd ?? FIXTURE_PERIOD_END_PAST,
    }),
  };
}

/* ── Order payload ────────────────────────────────────────────────────────── */

/**
 * `order.paid` payload — a successful collection that should produce
 * a `payment_attempts` row keyed by `data.id` with status
 * `succeeded`. Subscription state must remain unchanged.
 */
export function polarOrderPaidPayload(
  overrides: PolarFixtureOverrides = {},
): EventEnvelope<"order.paid", Record<string, unknown>> {
  return {
    type: "order.paid",
    timestamp: defaultEventTimestamp(overrides),
    data: buildOrderData(overrides, "paid"),
  };
}

/* ── Refund payload ───────────────────────────────────────────────────────── */

/* Refund fixtures intentionally omitted: refunds are issued exclusively
 * through the Polar customer portal post-refactor, so the webhook route
 * no longer reacts to refund.* events. */

/* ── Specialty payloads ───────────────────────────────────────────────────── */

/**
 * Stable `subscription.created` payload designed for posting twice
 * to exercise idempotent-dedup. Fixed timestamp and stable ids so two
 * deliveries produce the same `providerEventId`.
 */
export function polarDuplicateDeliveryPayload(
  overrides: PolarFixtureOverrides = {},
): EventEnvelope<"subscription.created", Record<string, unknown>> {
  return polarSubscriptionCreatedPayload({
    eventTimestamp: FIXTURE_NOW,
    subscriptionId: "sub_polar_dup_fixture",
    ...overrides,
  });
}

/**
 * Subscription payload with no resolvable identity. Every priority
 * source (`customer.external_id`, `customer.id` matching a row,
 * `subscription_id` matching a row, `metadata.businessId`) is absent or
 * intentionally not present in the DB. Tests should NOT seed any
 * `business_subscriptions` row keyed by these ids.
 *
 * The base shape is `subscription.created` because the resolver's
 * priority chain is documented against subscription-shaped payloads.
 */
export function polarUnresolvableUserSubscriptionPayload(
  overrides: PolarFixtureOverrides = {},
): EventEnvelope<"subscription.created", Record<string, unknown>> {
  return polarSubscriptionCreatedPayload({
    ...overrides,
    externalId: null,
    customerId: overrides.customerId ?? "cus_polar_unresolvable_fixture",
    subscriptionId:
      overrides.subscriptionId ?? "sub_polar_unresolvable_fixture",
    metadataUserId: "",
  });
}
