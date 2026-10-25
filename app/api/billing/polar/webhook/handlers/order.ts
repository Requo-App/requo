import "server-only";

/**
 * Polar order webhook handlers.
 *
 * Handles `order.paid`, `order.updated`, and `order.refunded` events.
 * Polar orders represent a single paid charge — the initial purchase
 * or a recurring renewal — and are mirrored to `payment_attempts`
 * rows for billing-history UI, audit, and refund eligibility checks.
 *
 * Behaviour summary (Requirements 8.1–8.5):
 *
 *   - `order.paid`     -> upsert a `succeeded` `payment_attempts` row
 *                        keyed by `data.id` and the order amount.
 *   - `order.updated`  -> upsert a `failed` row only when the order
 *                        transitions into a failed status. Polar's
 *                        `OrderStatus` does not model `failed`
 *                        directly; the closest analog is `void`,
 *                        which we treat as the failed transition.
 *                        `refunded` / `partially_refunded` transitions
 *                        are no-ops here.
 *   - `order.refunded` -> recorded in `billing_events` with status
 *                        `ignored`. Requo does not model refunds as a
 *                        separate payment state yet; the event remains
 *                        visible for operator follow-up.
 *
 * Identity resolution follows the standard chain via
 * `resolvePolarBusinessId`: `customer.external_id` → providerCustomerId
 * lookup → providerSubscriptionId lookup → `metadata.businessId`.
 * When no source resolves, the handler still inserts a
 * `payment_attempts` row with a null business/owner (Requirement 8.4)
 * and marks the `billing_events` row `failed` for operator follow-up.
 *
 * Order events DO NOT mutate subscription state. Subscription state
 * is owned exclusively by `subscription.*` events (Requirement 8.5).
 *
 * Idempotency: these handlers call `recordWebhookEvent` /
 * `markEventProcessed` / `markEventFailed` directly (rather than
 * `withIdempotency`) because Requirement 8.4 needs the
 * `payment_attempts` row to be written even when no business can be
 * resolved.
 */

import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { models, webhooks } from "@polar-sh/sdk/2026-10";

import { normalizeBillingCurrency } from "@/lib/billing/currency";
import { getBusinessSubscription } from "@/lib/billing/subscription-service";
import {
  markEventFailed,
  markEventIgnored,
  markEventProcessed,
  recordPaymentAttempt,
  recordWebhookEvent,
} from "@/lib/billing/webhook-processor";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import type { BillingCurrency } from "@/lib/db/schema/subscriptions";
import { logError } from "@/lib/observability/logger";

import { resolvePolarBusinessId, type PolarEventPayload } from "../identity";

type OrderPayload =
  | webhooks.WebhookOrderPaidPayload
  | webhooks.WebhookOrderUpdatedPayload
  | webhooks.WebhookOrderRefundedPayload;

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function readCurrency(value: string | null | undefined): BillingCurrency {
  return normalizeBillingCurrency(value);
}

/**
 * Reads a string-typed `plan` from the Polar order metadata, if any.
 * Polar's metadata values can be `string | number | boolean`, so we
 * narrow defensively.
 */
function readPlanFromMetadata(order: models.Order): string | null {
  const metadata = order.metadata as
    | Record<string, string | number | boolean | undefined>
    | undefined;
  const plan = metadata?.plan;
  return typeof plan === "string" && plan.length > 0 ? plan : null;
}

/**
 * Resolves the plan to record on the `payment_attempts` row.
 *
 * Lookup order:
 *
 *   1. `data.metadata.plan` — set during checkout-session creation.
 *   2. The business's existing subscription plan — useful for recurring
 *      renewals where metadata may be absent.
 *   3. Fallback to `"pro"` — orders represent paid charges, and the
 *      `payment_attempts.plan` column is `notNull`.
 */
async function resolvePlan(
  order: models.Order,
  businessId: string | null,
): Promise<string> {
  const fromMetadata = readPlanFromMetadata(order);
  if (fromMetadata) return fromMetadata;

  if (businessId) {
    const subscription = await getBusinessSubscription(businessId);
    if (subscription?.plan && subscription.plan.length > 0) {
      return subscription.plan;
    }
  }

  return "pro";
}

async function resolveBusinessOwnerUserId(
  businessId: string | null,
): Promise<string | null> {
  if (!businessId) return null;

  const [owner] = await db
    .select({ userId: businesses.ownerUserId })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return owner?.userId ?? null;
}

/**
 * Adapts a typed Polar payload to the structural shape
 * `resolvePolarBusinessId` accepts.
 */
function toResolverPayload(payload: OrderPayload): PolarEventPayload {
  const data = payload.data;
  const customer = data.customer;
  const metadata = data.metadata as
    | Record<string, string | number | boolean | undefined>
    | undefined;
  const metadataBusinessId = metadata?.businessId;

  return {
    type: payload.type,
    data: {
      id: data.id,
      subscription_id: data.subscription_id ?? null,
      customer: {
        id: customer.id,
        external_id: customer.external_id ?? null,
      },
      metadata: {
        businessId:
          typeof metadataBusinessId === "string" && metadataBusinessId.length > 0
            ? metadataBusinessId
            : null,
      },
    },
  };
}

/**
 * Builds the stable provider event id used for idempotent dedup.
 *
 * The order id alone is not enough: `order.updated` can fire for the same
 * order more than once. The event occurrence timestamp distinguishes those
 * updates while still deduplicating a redelivery of the same occurrence.
 */
function buildProviderEventId(payload: OrderPayload): string {
  const stable = payload.data?.id ?? randomUUID();
  const occurrence = payload.timestamp ?? payload.data?.modified_at;
  return occurrence
    ? `${payload.type}:${stable}:${occurrence}`
    : `${payload.type}:${stable}`;
}

/* ── Order event implementation ───────────────────────────────────────────── */

/**
 * Upserts a `payment_attempts` row for the given order outcome.
 * Accepts a nullable user id so unresolvable orders still produce a
 * row for later operator reconciliation (Requirement 8.4).
 */
async function recordOrderPaymentAttempt(params: {
  order: models.Order;
  ownerUserId: string | null;
  businessId: string | null;
  status: "succeeded" | "failed";
}): Promise<void> {
  const { order, ownerUserId, businessId, status } = params;
  const plan = await resolvePlan(order, businessId);

  await recordPaymentAttempt({
    userId: ownerUserId,
    businessId,
    plan,
    provider: "polar",
    providerPaymentId: order.id,
    // Polar order amounts are denominated in cents. `total_amount`
    // includes discounts and taxes — the same end-customer-charged
    // amount we want to display in billing history.
    amount: order.total_amount,
    currency: readCurrency(order.currency),
    status,
  });
}

/**
 * Detects whether an `order.updated` event represents a failed
 * collection attempt. Polar's `OrderStatus` does not model `failed`;
 * the closest analog is `void`.
 */
function isFailedOrderTransition(order: models.Order): boolean {
  return String(order.status) === "void";
}

/**
 * Wraps an order handler with idempotent event recording. Ownership of
 * a failed or stale event is required before the handler runs.
 */
async function processOrderEvent(params: {
  payload: OrderPayload;
  handler: (
    businessId: string | null,
    ownerUserId: string | null,
    eventId: string,
  ) => Promise<void>;
}): Promise<void> {
  const { payload, handler } = params;
  const providerEventId = buildProviderEventId(payload);
  const businessId = await resolvePolarBusinessId(toResolverPayload(payload));
  const ownerUserId = await resolveBusinessOwnerUserId(businessId);

  const recordResult = await recordWebhookEvent({
    providerEventId,
    provider: "polar",
    eventType: payload.type,
    userId: ownerUserId,
    businessId,
    payload,
  });

  if (!recordResult.claimed || !recordResult.claimToken) {
    // Duplicate delivery already processed, ignored, or in flight.
    return;
  }

  const eventId = recordResult.eventId;
  const claimToken = recordResult.claimToken;

  try {
    await handler(businessId, ownerUserId, eventId);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected webhook error.";
    logError("polar.webhook.order.failed", error, {
      eventType: payload.type,
    });
    await markEventFailed(eventId, claimToken, message);
    throw error;
  }

  if (businessId === null) {
    // Row inserted (if applicable), but no Requo business could be
    // resolved. Flag for operator follow-up.
    await markEventFailed(eventId, claimToken, "Business not found");
    return;
  }

  await markEventProcessed(eventId, claimToken);
}

/* ── Exported handlers ────────────────────────────────────────────────────── */

/**
 * `order.paid` — upsert a `succeeded` `payment_attempts` row.
 * Subscription state is not mutated here; subscription lifecycle
 * is owned by `subscription.*` events (Requirement 8.5).
 */
export async function handleOrderPaid(
  payload: webhooks.WebhookOrderPaidPayload,
): Promise<void> {
  await processOrderEvent({
    payload,
    handler: async (businessId, ownerUserId) => {
      await recordOrderPaymentAttempt({
        order: payload.data,
        ownerUserId,
        businessId,
        status: "succeeded",
      });
    },
  });
}

/**
 * `order.updated` — upsert a `failed` `payment_attempts` row only
 * when the order transitions into a failed status (Polar `void`).
 * Refunded / partially-refunded transitions are no-ops here.
 */
export async function handleOrderUpdated(
  payload: webhooks.WebhookOrderUpdatedPayload,
): Promise<void> {
  await processOrderEvent({
    payload,
    handler: async (businessId, ownerUserId) => {
      if (!isFailedOrderTransition(payload.data)) {
        return;
      }
      await recordOrderPaymentAttempt({
        order: payload.data,
        ownerUserId,
        businessId,
        status: "failed",
      });
    },
  });
}

/**
 * `order.refunded` — Requo does not yet model refunds as a payment state.
 * Record the event in `billing_events` with status `ignored` for
 * traceability and do not touch `payment_attempts`.
 */
export async function handleOrderRefunded(
  payload: webhooks.WebhookOrderRefundedPayload,
): Promise<void> {
  const providerEventId = buildProviderEventId(payload);
  const businessId = await resolvePolarBusinessId(toResolverPayload(payload));
  const ownerUserId = await resolveBusinessOwnerUserId(businessId);

  const recordResult = await recordWebhookEvent({
    providerEventId,
    provider: "polar",
    eventType: payload.type,
    userId: ownerUserId,
    businessId,
    payload,
  });

  if (!recordResult.claimed || !recordResult.claimToken) {
    return;
  }

  await markEventIgnored(recordResult.eventId, recordResult.claimToken);
}
