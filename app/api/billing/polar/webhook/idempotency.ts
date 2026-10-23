import "server-only";

/**
 * Idempotent webhook event wrapper for the Polar webhook route.
 *
 * Composes a stable `providerEventId` from the event type and the
 * payload's identifier, records the event in `billing_events`, and
 * routes the lifecycle of that row through the standard
 * `processing -> processed | failed` transitions.
 *
 * Behaviour summary (mirrors the design's `withIdempotency` shape
 * section, Requirements 5.3, 5.5, 6.1–6.5, 11.4):
 *
 *  1. `providerEventId = `${eventType}:${stableId}:${occurrence}`` where
 *     `stableId` is `payload.id ?? payload.data.id` and `occurrence` is the
 *     event's top-level `timestamp`. Repeated `subscription.updated` events
 *     for the same subscription at different times are therefore distinct,
 *     while redelivery of the same occurrence deduplicates.
 *  2. `recordWebhookEvent(...)` claims new, failed, or stale events.
 *  3. `businessId === null` -> mark `failed("Business not found")` and
 *     return without throwing. Polar receives 200 and stops retrying an
 *     unfixable data problem.
 *  4. Run `handler(businessId, eventId)`. Mark `processed` on success;
 *     mark `failed(error.message)` and re-throw on error so the
 *     adapter returns 5xx and Polar retries.
 */

import { randomUUID } from "node:crypto";

import {
  markEventFailed,
  markEventProcessed,
  recordWebhookEvent,
} from "@/lib/billing/webhook-processor";

type IdempotencyPayload = {
  id?: unknown;
  timestamp?: unknown;
  data?: { id?: unknown; modified_at?: unknown } | unknown;
};

type ResolveBusinessId<TPayload> = (
  payload: TPayload,
) => Promise<string | null> | string | null;

type IdempotencyHandler = (
  businessId: string,
  eventId: string,
) => Promise<void>;

function readId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function deriveStableId(payload: IdempotencyPayload): string {
  const topLevel = readId(payload.id);
  if (topLevel) return topLevel;

  const data = payload.data;
  if (data && typeof data === "object" && "id" in data) {
    const nested = readId((data as { id?: unknown }).id);
    if (nested) return nested;
  }

  return randomUUID();
}

function deriveOccurrence(payload: IdempotencyPayload): string | undefined {
  const timestamp = readId(payload.timestamp);
  if (timestamp) return timestamp;

  const data = payload.data;
  if (data && typeof data === "object" && "modified_at" in data) {
    return readId((data as { modified_at?: unknown }).modified_at);
  }

  return undefined;
}

/**
 * Wraps a Polar webhook handler with idempotent event recording.
 *
 * @param payload      The verified Polar webhook payload.
 * @param eventType    The Polar event type string (e.g. `subscription.active`).
 * @param resolveBusinessId Resolves the Requo `business.id` for this event, or
 *                     `null` when no business can be resolved.
 * @param handler      Per-event handler invoked with the resolved
 *                     `businessId` and the `billing_events.id` row id.
 */
export async function withIdempotency<TPayload extends IdempotencyPayload>(
  payload: TPayload,
  eventType: string,
  resolveBusinessId: ResolveBusinessId<TPayload>,
  handler: IdempotencyHandler,
): Promise<void> {
  const stableId = deriveStableId(payload);
  const occurrence = deriveOccurrence(payload);
  const providerEventId = occurrence
    ? `${eventType}:${stableId}:${occurrence}`
    : `${eventType}:${stableId}`;

  const businessId = await resolveBusinessId(payload);

  const recordResult = await recordWebhookEvent({
    providerEventId,
    provider: "polar",
    eventType,
    businessId,
    payload,
  });

  if (!recordResult.claimed || !recordResult.claimToken) {
    // Duplicate delivery already processed, ignored, or currently in flight.
    return;
  }

  const eventId = recordResult.eventId;
  const claimToken = recordResult.claimToken;

  if (businessId === null) {
    await markEventFailed(eventId, claimToken, "Business not found");
    return;
  }

  try {
    await handler(businessId, eventId);
    await markEventProcessed(eventId, claimToken);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unexpected webhook error.";
    console.error("[polar webhook] processing error", message, { eventType });
    await markEventFailed(eventId, claimToken, message);
    throw error;
  }
}
