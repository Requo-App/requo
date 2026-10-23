import "server-only";

/**
 * Idempotent webhook event processor.
 *
 * Every incoming provider webhook event is recorded in `billing_events`
 * before processing. Events with a duplicate `providerEventId` are
 * silently skipped to prevent double-processing on retries.
 *
 * The `status` column tracks the processing lifecycle:
 *   "processing" → "processed" | "failed" | "ignored"
 */

import { and, eq, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newEntityId } from "@/lib/ids";
import {
  billingEvents,
  paymentAttempts,
  type BillingCurrency,
  type BillingProvider,
} from "@/lib/db/schema/subscriptions";
import type { WebhookProcessResult } from "@/lib/billing/types";

/** A `processing` event older than this is assumed abandoned by a crashed request. */
export const STALE_PROCESSING_EVENT_MS = 5 * 60 * 1000;

export type WebhookEventStatus = "processing" | "processed" | "failed" | "ignored";

export type RecordWebhookEventResult = {
  /** True only when this delivery inserted the event row. */
  isNew: boolean;
  /** True when this delivery owns processing of the event. */
  claimed: boolean;
  eventId: string;
  status: WebhookEventStatus;
  /**
   * Timestamp of this delivery's claim. Terminal updates must present it so
   * a slow original request cannot overwrite a newer retry's result.
   * `null` when this delivery did not claim the event.
   */
  claimToken: Date | null;
};

/* ── Event recording ──────────────────────────────────────────────────────── */

/**
 * Records a webhook event and claims it for processing when appropriate.
 *
 * New rows are inserted with `status: "processing"`. Duplicate deliveries
 * normally skip processing, but two recoverable states can be claimed:
 *
 *   - `failed`: a previous delivery recorded an error and returned 5xx, or
 *     the adapter did not get a chance to retry. The next delivery retries.
 *   - stale `processing`: a previous request crashed before marking the row
 *     terminal. Only requests older than `STALE_PROCESSING_EVENT_MS` are
 *     reclaimable, so an in-flight delivery is never processed twice.
 *
 * `processed` and `ignored` rows are terminal and are never reclaimed.
 *
 * The insert and claim updates are atomic. Concurrent duplicate deliveries
 * race to claim; exactly one wins and the losers return `claimed: false`.
 */
export async function recordWebhookEvent(params: {
  providerEventId: string;
  provider: BillingProvider;
  eventType: string;
  userId?: string | null;
  businessId?: string | null;
  payload: unknown;
}): Promise<RecordWebhookEventResult> {
  const eventId = newEntityId();
  const now = new Date();
  const staleBefore = new Date(now.getTime() - STALE_PROCESSING_EVENT_MS);

  const [inserted] = await db
    .insert(billingEvents)
    .values({
      id: eventId,
      providerEventId: params.providerEventId,
      provider: params.provider,
      eventType: params.eventType,
      userId: params.userId ?? null,
      businessId: params.businessId ?? null,
      payload: params.payload as Record<string, unknown>,
      status: "processing",
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing({ target: billingEvents.providerEventId })
    .returning({ id: billingEvents.id });

  if (inserted) {
    return {
      isNew: true,
      claimed: true,
      eventId: inserted.id,
      status: "processing",
      claimToken: now,
    };
  }

  const [existing] = await db
    .select({
      id: billingEvents.id,
      status: billingEvents.status,
      updatedAt: billingEvents.updatedAt,
    })
    .from(billingEvents)
    .where(eq(billingEvents.providerEventId, params.providerEventId))
    .limit(1);

  if (!existing) {
    throw new Error("Billing event record could not be created.");
  }

  if (existing.status === "failed") {
    const [claimed] = await db
      .update(billingEvents)
      .set({
        status: "processing",
        errorMessage: null,
        processedAt: null,
        userId: params.userId ?? null,
        businessId: params.businessId ?? null,
        payload: params.payload as Record<string, unknown>,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingEvents.id, existing.id),
          eq(billingEvents.status, "failed"),
        ),
      )
      .returning({ id: billingEvents.id });

    return {
      isNew: false,
      claimed: !!claimed,
      eventId: existing.id,
      status: claimed
        ? "processing"
        : (existing.status as WebhookEventStatus),
      claimToken: claimed ? now : null,
    };
  }

  if (existing.status === "processing" && existing.updatedAt < staleBefore) {
    const [claimed] = await db
      .update(billingEvents)
      .set({
        errorMessage: null,
        processedAt: null,
        userId: params.userId ?? null,
        businessId: params.businessId ?? null,
        payload: params.payload as Record<string, unknown>,
        updatedAt: now,
      })
      .where(
        and(
          eq(billingEvents.id, existing.id),
          eq(billingEvents.status, "processing"),
          lt(billingEvents.updatedAt, staleBefore),
        ),
      )
      .returning({ id: billingEvents.id });

    return {
      isNew: false,
      claimed: !!claimed,
      eventId: existing.id,
      status: claimed
        ? "processing"
        : (existing.status as WebhookEventStatus),
      claimToken: claimed ? now : null,
    };
  }

  return {
    isNew: false,
    claimed: false,
    eventId: existing.id,
    status: existing.status as WebhookEventStatus,
    claimToken: null,
  };
}

/**
 * Marks a webhook event as successfully processed.
 *
 * `claimToken` is the timestamp returned by `recordWebhookEvent`. Requiring
 * it prevents a slow original delivery from finishing an event that a newer
 * retry has since reclaimed.
 */
export async function markEventProcessed(
  eventId: string,
  claimToken: Date,
): Promise<void> {
  const now = new Date();

  await db
    .update(billingEvents)
    .set({
      status: "processed",
      processedAt: now,
      errorMessage: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(billingEvents.id, eventId),
        eq(billingEvents.status, "processing"),
        eq(billingEvents.updatedAt, claimToken),
      ),
    );
}

/**
 * Marks a webhook event as failed and records the error message.
 */
export async function markEventFailed(
  eventId: string,
  claimToken: Date,
  errorMessage: string,
): Promise<void> {
  const now = new Date();

  await db
    .update(billingEvents)
    .set({
      status: "failed",
      errorMessage,
      processedAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(billingEvents.id, eventId),
        eq(billingEvents.status, "processing"),
        eq(billingEvents.updatedAt, claimToken),
      ),
    );
}

/**
 * Marks a webhook event as ignored. Used when the event type is not
 * relevant to subscription state (e.g., informational events).
 */
export async function markEventIgnored(
  eventId: string,
  claimToken: Date,
): Promise<void> {
  const now = new Date();

  await db
    .update(billingEvents)
    .set({ status: "ignored", updatedAt: now })
    .where(
      and(
        eq(billingEvents.id, eventId),
        eq(billingEvents.status, "processing"),
        eq(billingEvents.updatedAt, claimToken),
      ),
    );
}

/* ── Payment attempt recording ────────────────────────────────────────────── */

type RecordPaymentAttemptParams = {
  /**
   * The Requo `user.id`, or `null` when the originating webhook event
   * could not be resolved to a Requo user. The DB column is nullable
   * (`onDelete: "set null"`) to accommodate operator-reconcilable
   * payment rows. See Requirement 8.4.
   */
  userId: string | null;
  businessId?: string | null;
  plan: string;
  provider: BillingProvider;
  providerPaymentId: string;
  amount: number;
  currency: BillingCurrency;
  status: "pending" | "succeeded" | "failed" | "expired";
};

/**
 * Records or updates the mirror of a provider payment (order).
 *
 * `(provider, providerPaymentId)` is unique. A duplicate `order.paid`
 * delivery must not create a second row, and a later failed update must not
 * overwrite a row that already proved the payment succeeded.
 */
export async function recordPaymentAttempt(
  params: RecordPaymentAttemptParams,
): Promise<string> {
  const id = newEntityId();

  const [upserted] = await db
    .insert(paymentAttempts)
    .values({
      id,
      userId: params.userId ?? null,
      businessId: params.businessId ?? null,
      plan: params.plan,
      provider: params.provider,
      providerPaymentId: params.providerPaymentId,
      amount: params.amount,
      currency: params.currency,
      status: params.status,
      createdAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [paymentAttempts.provider, paymentAttempts.providerPaymentId],
      set: {
        userId: params.userId ?? null,
        businessId: params.businessId ?? null,
        plan: params.plan,
        amount: params.amount,
        currency: params.currency,
        status: params.status,
      },
      setWhere: sql`${paymentAttempts.status} <> 'succeeded'`,
    })
    .returning({ id: paymentAttempts.id });

  if (upserted) {
    return upserted.id;
  }

  const [existing] = await db
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(
      and(
        eq(paymentAttempts.provider, params.provider),
        eq(paymentAttempts.providerPaymentId, params.providerPaymentId),
      ),
    )
    .limit(1);

  if (!existing) {
    throw new Error("Payment attempt record could not be created.");
  }

  return existing.id;
}

/**
 * Standard webhook response helper.
 */
export function webhookSuccess(
  message: string,
  businessId?: string,
): WebhookProcessResult {
  return { success: true, message, businessId };
}

export function webhookError(message: string): WebhookProcessResult {
  return { success: false, message };
}
