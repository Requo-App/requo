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

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newEntityId } from "@/lib/ids";
import {
  billingEvents,
  paymentAttempts,
  type BillingCurrency,
  type BillingProvider,
} from "@/lib/db/schema/subscriptions";
import type { WebhookProcessResult } from "@/lib/billing/types";

/* ── Event recording ──────────────────────────────────────────────────────── */

/**
 * Records a webhook event and returns whether it should be processed.
 * Returns `isNew: false` if the event has already been recorded (duplicate).
 *
 * New rows are inserted with `status: "processing"`. Callers should
 * transition the row to `"processed"`, `"failed"`, or `"ignored"` via
 * the corresponding helpers below once the event is handled.
 *
 * The insert is atomic (`onConflictDoNothing` on the provider-event unique
 * index): concurrent duplicate deliveries race to insert, exactly one wins,
 * and losers resolve to the winner via the follow-up select instead of
 * surfacing a uniqueness violation. The winner's payload and status are
 * never overwritten by a duplicate.
 */
export async function recordWebhookEvent(params: {
  providerEventId: string;
  provider: BillingProvider;
  eventType: string;
  userId?: string | null;
  businessId?: string | null;
  payload: unknown;
}): Promise<{ isNew: boolean; eventId: string }> {
  const eventId = newEntityId();

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
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: billingEvents.providerEventId })
    .returning({ id: billingEvents.id });

  if (inserted) {
    return { isNew: true, eventId: inserted.id };
  }

  // Conflict: this event was already recorded (possibly by a concurrent
  // delivery that won the race). Resolve to the existing row without
  // touching its payload or status.
  const [existing] = await db
    .select({ id: billingEvents.id })
    .from(billingEvents)
    .where(eq(billingEvents.providerEventId, params.providerEventId))
    .limit(1);

  if (!existing) {
    throw new Error("Billing event record could not be created.");
  }

  return { isNew: false, eventId: existing.id };
}

/**
 * Marks a webhook event as successfully processed.
 */
export async function markEventProcessed(eventId: string): Promise<void> {
  await db
    .update(billingEvents)
    .set({ status: "processed", processedAt: new Date() })
    .where(eq(billingEvents.id, eventId));
}

/**
 * Marks a webhook event as failed and records the error message.
 */
export async function markEventFailed(
  eventId: string,
  errorMessage: string,
): Promise<void> {
  await db
    .update(billingEvents)
    .set({ status: "failed", errorMessage })
    .where(eq(billingEvents.id, eventId));
}

/**
 * Marks a webhook event as ignored. Used when the event type is not
 * relevant to subscription state (e.g., informational events).
 */
export async function markEventIgnored(eventId: string): Promise<void> {
  await db
    .update(billingEvents)
    .set({ status: "ignored" })
    .where(eq(billingEvents.id, eventId));
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
 * Records a payment attempt for audit purposes.
 */
export async function recordPaymentAttempt(
  params: RecordPaymentAttemptParams,
): Promise<string> {
  const id = newEntityId();

  await db.insert(paymentAttempts).values({
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
  });

  return id;
}

/**
 * Updates a payment attempt status.
 */
export async function updatePaymentAttemptStatus(
  providerPaymentId: string,
  status: "pending" | "succeeded" | "failed" | "expired",
): Promise<boolean> {
  const updated = await db
    .update(paymentAttempts)
    .set({ status })
    .where(eq(paymentAttempts.providerPaymentId, providerPaymentId))
    .returning({ id: paymentAttempts.id });

  return updated.length > 0;
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
