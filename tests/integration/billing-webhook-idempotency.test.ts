import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

/**
 * DB-backed regression tests for concurrent webhook-event recording.
 *
 * Two simultaneous deliveries of the same Polar event must not surface a
 * uniqueness violation: the atomic insert lets exactly one win and the
 * loser resolves to the winner with `isNew: false`.
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

import { billingEvents } from "@/lib/db/schema/subscriptions";
import {
  markEventProcessed,
  recordWebhookEvent,
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
    await markEventProcessed(first.eventId);

    const second = await recordWebhookEvent({
      providerEventId,
      provider: "polar",
      eventType: "subscription.created",
      businessId: null,
      payload: { id: providerEventId, attempt: 2 },
    });

    expect(second.isNew).toBe(false);
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
    expect(first.eventId).toBe(second.eventId);

    const rows = await eventRows(providerEventId);
    expect(rows).toHaveLength(1);
  });
});
