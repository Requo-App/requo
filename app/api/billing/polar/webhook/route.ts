import "server-only";

/**
 * Polar webhook route.
 *
 * Wires the per-event handlers in `./handlers/*` into the
 * `@polar-sh/nextjs` `Webhooks` adapter. The adapter owns:
 *
 *   - Standard-Webhooks signature verification (`POLAR_WEBHOOK_SECRET`)
 *   - JSON parsing and per-event payload typing (via `validateEvent`)
 *   - Per-event dispatch to the typed `on*` handler we provide
 *
 * Every typed handler wraps its body with `withIdempotency`
 * (`./idempotency.ts`) — or, for order events, the equivalent direct
 * `recordWebhookEvent` flow that preserves the unresolvable-user
 * payment-row insert per Requirement 8.4. This file does not re-wrap
 * the imported handlers.
 *
 * Behaviour summary (Requirements 5.1, 5.2, 5.4, 5.5):
 *
 *   - 5.1 Signature verification + payload validation are owned by
 *         the adapter, configured with `POLAR_WEBHOOK_SECRET`.
 *   - 5.2 Failed-signature requests are rejected by the adapter
 *         before our handlers run.
 *   - 5.4 Event types we do not act on flow through
 *         `handleUnhandledPayload`, which records them in
 *         `billing_events` with status `ignored`.
 *   - 5.5 When a typed handler throws, the adapter surfaces a 5xx
 *         to Polar so the delivery is retried; the
 *         `withIdempotency` wrapper has already marked the event
 *         row `failed` with the error message.
 */

import { randomUUID } from "node:crypto";
import { Webhooks } from "@polar-sh/nextjs";
import type { NextRequest } from "next/server";
import type { validateEvent } from "@polar-sh/sdk/webhooks";

import {
  markEventIgnored,
  recordWebhookEvent,
} from "@/lib/billing/webhook-processor";
import { env } from "@/lib/env";

import { resolvePolarBusinessId, type PolarEventPayload } from "./identity";
import {
  handleOrderPaid,
  handleOrderRefunded,
  handleOrderUpdated,
} from "./handlers/order";
import {
  handleSubscriptionActive,
  handleSubscriptionCanceled,
  handleSubscriptionCreated,
  handleSubscriptionRevoked,
  handleSubscriptionUncanceled,
  handleSubscriptionUpdated,
} from "./handlers/subscription";

/* ── Types ────────────────────────────────────────────────────────────────── */

/**
 * Discriminated union of every Polar webhook payload type the SDK
 * recognises. Sourced from `validateEvent`'s return type so this stays
 * in sync with future SDK upgrades.
 */
type PolarWebhookPayload = ReturnType<typeof validateEvent>;

/**
 * Event types covered by the typed `on*` handlers below. The catch-all
 * `handleUnhandledPayload` short-circuits for these so events are not
 * double-recorded — the typed handlers already insert the canonical
 * `billing_events` row via `withIdempotency`.
 */
const HANDLED_EVENT_TYPES: ReadonlySet<string> = new Set([
  "subscription.created",
  "subscription.active",
  "subscription.updated",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.revoked",
  "order.paid",
  "order.updated",
  "order.refunded",
]);

/* ── Catch-all payload handler ────────────────────────────────────────────── */

/**
 * Adapts the SDK's camelCase payload shape to the snake_case-keyed
 * structural type that `resolvePolarUserId` was written against.
 * Matches the per-handler adapter in `./handlers/order.ts` so unhandled
 * events resolve identity through the same chain.
 */
function toResolverPayload(payload: PolarWebhookPayload): PolarEventPayload {
  const data = (payload as { data?: unknown }).data as
    | Record<string, unknown>
    | undefined;
  if (!data) return { type: payload.type };

  const customerRaw = data.customer as
    | { id?: unknown; externalId?: unknown }
    | undefined
    | null;

  const metadataRaw = data.metadata as
    | Record<string, unknown>
    | undefined
    | null;

  const subscriptionId =
    typeof data.subscriptionId === "string" ? data.subscriptionId : null;

  return {
    type: payload.type,
    data: {
      id: typeof data.id === "string" ? data.id : null,
      subscription_id: subscriptionId,
      customer: customerRaw
        ? {
            id: typeof customerRaw.id === "string" ? customerRaw.id : null,
            external_id:
              typeof customerRaw.externalId === "string"
                ? customerRaw.externalId
                : null,
          }
        : null,
      metadata: metadataRaw
        ? { businessId: metadataRaw.businessId }
        : null,
    },
  };
}

/**
 * Reads a stable id from the verified payload for use in the
 * composed `providerEventId`. Mirrors the rule used by
 * `withIdempotency`: prefer `payload.id`, fall back to
 * `payload.data.id`, otherwise generate a fresh UUID so the event is
 * still recorded once.
 */
function readStableId(payload: PolarWebhookPayload): string {
  const topLevel = (payload as { id?: unknown }).id;
  if (typeof topLevel === "string" && topLevel.length > 0) return topLevel;

  const data = (payload as { data?: { id?: unknown } }).data;
  const nested = data?.id;
  if (typeof nested === "string" && nested.length > 0) return nested;

  return randomUUID();
}

/**
 * Catch-all handler for event types we do not act on. Records the
 * event in `billing_events` with status `ignored` so the raw payload
 * is preserved for operator inspection (Requirement 5.4).
 *
 * Skips events handled by typed `on*` handlers — the adapter invokes
 * `onPayload` for every delivery, so without this guard we'd
 * double-record handled events under a different status.
 */
async function handleUnhandledPayload(
  payload: PolarWebhookPayload,
): Promise<void> {
  if (HANDLED_EVENT_TYPES.has(payload.type)) {
    return;
  }

  const providerEventId = `${payload.type}:${readStableId(payload)}`;

  // Best-effort identity resolution: the resolver returns null when
  // no source matches, and a thrown DB error must not surface as a
  // 5xx for a payload we'd otherwise ignore.
  let businessId: string | null = null;
  try {
    businessId = await resolvePolarBusinessId(toResolverPayload(payload));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "identity resolution failed";
    console.warn(
      "[polar webhook] identity resolution failed for unhandled event",
      message,
      { eventType: payload.type },
    );
    businessId = null;
  }

  const result = await recordWebhookEvent({
    providerEventId,
    provider: "polar",
    eventType: payload.type,
    businessId,
    payload,
  });

  if (result.isNew) {
    await markEventIgnored(result.eventId);
  }
}

/* ── Adapter wiring ───────────────────────────────────────────────────────── */

const adapter = Webhooks({
  webhookSecret: env.POLAR_WEBHOOK_SECRET ?? "",
  onSubscriptionCreated: handleSubscriptionCreated,
  onSubscriptionActive: handleSubscriptionActive,
  onSubscriptionUpdated: handleSubscriptionUpdated,
  onSubscriptionCanceled: handleSubscriptionCanceled,
  onSubscriptionUncanceled: handleSubscriptionUncanceled,
  onSubscriptionRevoked: handleSubscriptionRevoked,
  onOrderPaid: handleOrderPaid,
  onOrderUpdated: handleOrderUpdated,
  onOrderRefunded: handleOrderRefunded,
  onPayload: handleUnhandledPayload,
});

// Fail-closed when the webhook secret is unconfigured (adapter would verify
// against "" otherwise).
export async function POST(request: NextRequest): Promise<Response> {
  if (!env.POLAR_WEBHOOK_SECRET) {
    return new Response("Webhook not configured.", { status: 503 });
  }
  return adapter(request);
}
