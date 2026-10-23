import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

/**
 * DB-backed regression tests for concurrent webhook-event recording.
 *
 * Two simultaneous deliveries of the same Polar event must not surface a
 * uniqueness violation: the atomic insert lets exactly one win and the
 * loser resolves to the winner without claiming processing.
 *
 * Requires a disposable integration Postgres (same target as the rest of
 * `tests/integration/`). Not runnable without `TEST_DATABASE_URL` /
 * `DATABASE_URL` pointing at a throwaway database.
 */

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");
  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { billingEvents, paymentAttempts } from "@/lib/db/schema/subscriptions";
import {
  markEventFailed,
  markEventProcessed,
  recordPaymentAttempt,
  recordWebhookEvent,
  STALE_PROCESSING_EVENT_MS,
} from "@/lib/billing/webhook-processor";
import { closeTestDb, testDb } from "@/tests/support/db";

const PREFIX = "test_webhook_idempotency";

async function eventRows(providerEventId: string) {
  return testDb
    .select()
    .from(billingEvents)
    .where(eq(billingEvents.providerEventId, providerEventId));
}

describe("recordWebhookEvent concurrency", () => {
  afterAll(async () => {
    await testDb
      .delete(billingEvents)
      .where(like(billingEvents.providerEventId, `${PREFIX}%`));
    await testDb
      .delete(paymentAttempts)
      .where(like(paymentAttempts.providerPaymentId, `${PREFIX}%`));
    await closeTestDb();
  });

  it("inserts a new event and reports it as new", async () => {
    const providerEventId = `${PREFIX}_new`;

    const result = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.created",
      businessId: null,
      payload: { id: providerEventId },
    });

    expect(result.isNew).toBe(true);
    expect(result.claimed).toBe(true);
    expect(result.eventId).toEqual(expect.any(String));

    const rows = await eventRows(providerEventId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("processing");
  });

  it("reports a sequential duplicate without a second row and keeps the original", async () => {
    const providerEventId = `${PREFIX}_sequential`;

    const first = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.created",
      businessId: null,
      payload: { id: providerEventId, attempt: 1 },
    });
    await markEventProcessed(first.eventId, first.claimToken!);

    const second = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.created",
      businessId: null,
      payload: { id: providerEventId, attempt: 2 },
    });

    expect(second.isNew).toBe(false);
    expect(second.claimed).toBe(false);
    expect(second.eventId).toBe(first.eventId);

    const rows = await eventRows(providerEventId);
    expect(rows).toHaveLength(1);
    // The duplicate neither overwrote the payload nor reset the status.
    expect(rows[0]?.payload).toEqual({ id: providerEventId, attempt: 1 });
    expect(rows[0]?.status).toBe("processed");
  });

  it("resolves two concurrent deliveries to one row without a uniqueness error", async () => {
    const providerEventId = `${PREFIX}_concurrent`;
    const params = {
      providerEventId,
      provider: "polar",
      eventType: "subscription.created",
      businessId: null,
      payload: { id: providerEventId },
    } as const;

    const [first, second] = await Promise.all([
      recordWebhookEvent({ ...params }),
      recordWebhookEvent({ ...params }),
    ]);

    const sorted = [first.isNew, second.isNew].sort();
    expect(sorted).toEqual([false, true]);
    expect([first.claimed, second.claimed].filter(Boolean)).toHaveLength(1);
    expect(first.eventId).toBe(second.eventId);

    const rows = await eventRows(providerEventId);
    expect(rows).toHaveLength(1);
  });

  it("does not let a late failure overwrite a processed event", async () => {
    const providerEventId = `${PREFIX}_late_failure`;

    const first = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.updated",
      businessId: null,
      payload: { id: providerEventId },
    });
    await markEventProcessed(first.eventId, first.claimToken!);
    await markEventFailed(first.eventId, first.claimToken!, "late failure");

    const rows = await eventRows(providerEventId);
    expect(rows[0]?.status).toBe("processed");
    expect(rows[0]?.errorMessage).toBeNull();
  });

  it("reclaims a failed event so Polar's retry can run the handler", async () => {
    const providerEventId = `${PREFIX}_failed`;

    const first = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.updated",
      businessId: null,
      payload: { id: providerEventId, attempt: 1 },
    });
    await markEventFailed(first.eventId, first.claimToken!, "database unavailable");

    const retry = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.updated",
      businessId: null,
      payload: { id: providerEventId, attempt: 2 },
    });

    expect(retry.isNew).toBe(false);
    expect(retry.claimed).toBe(true);
    expect(retry.status).toBe("processing");
    expect(retry.eventId).toBe(first.eventId);

    const rows = await eventRows(providerEventId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("processing");
    expect(rows[0]?.payload).toEqual({ id: providerEventId, attempt: 2 });
  });

  it("upserts a provider payment and leaves a succeeded row immutable", async () => {
    const providerPaymentId = `${PREFIX}_payment`;
    const base = {
      userId: null,
      businessId: null,
      plan: "pro",
      provider: "polar" as const,
      providerPaymentId,
      currency: "USD" as const,
    };

    const first = await recordPaymentAttempt({
      ...base,
      amount: 1_000,
      status: "succeeded",
    });
    const failedUpdate = await recordPaymentAttempt({
      ...base,
      amount: 900,
      status: "failed",
    });

    expect(failedUpdate).toBe(first);

    const [afterFailed] = await testDb
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.providerPaymentId, providerPaymentId));
    expect(afterFailed?.status).toBe("succeeded");
    expect(afterFailed?.amount).toBe(1_000);

    const succeededUpdate = await recordPaymentAttempt({
      ...base,
      amount: 1_200,
      status: "succeeded",
    });

    expect(succeededUpdate).toBe(first);

    const [afterSucceeded] = await testDb
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.providerPaymentId, providerPaymentId));
    expect(afterSucceeded?.status).toBe("succeeded");
    // A duplicate/late event cannot rewrite the amount on a proven success.
    expect(afterSucceeded?.amount).toBe(1_000);
  });

  it("reclaims a stale processing event left by a crashed request", async () => {
    const providerEventId = `${PREFIX}_stale`;

    const first = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.updated",
      businessId: null,
      payload: { id: providerEventId },
    });

    await testDb
      .update(billingEvents)
      .set({
        updatedAt: new Date(Date.now() - STALE_PROCESSING_EVENT_MS - 1_000),
      })
      .where(eq(billingEvents.id, first.eventId));

    const retry = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.updated",
      businessId: null,
      payload: { id: providerEventId },
    });

    expect(retry.claimed).toBe(true);
    expect(retry.status).toBe("processing");
  });

  it("does not let a stale claim overwrite a reclaimed event", async () => {
    const providerEventId = `${PREFIX}_claim_ownership`;

    const first = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.updated",
      businessId: null,
      payload: { id: providerEventId },
    });

    expect(first.claimToken).not.toBeNull();

    // Simulate the original handler taking longer than the stale window.
    await testDb
      .update(billingEvents)
      .set({
        updatedAt: new Date(Date.now() - STALE_PROCESSING_EVENT_MS - 1_000),
      })
      .where(eq(billingEvents.id, first.eventId));

    const retry = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.updated",
      businessId: null,
      payload: { id: providerEventId },
    });

    expect(retry.claimed).toBe(true);
    expect(retry.claimToken).not.toBeNull();

    // The original claim is no longer allowed to finish the event.
    await markEventFailed(first.eventId, first.claimToken!, "late failure");

    let [row] = await eventRows(providerEventId);
    expect(row?.status).toBe("processing");
    expect(row?.errorMessage).toBeNull();

    // The retry's claim can finish it.
    await markEventProcessed(retry.eventId, retry.claimToken!);

    [row] = await eventRows(providerEventId);
    expect(row?.status).toBe("processed");
  });
});
