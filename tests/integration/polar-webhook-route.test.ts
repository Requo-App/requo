import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { like } from "drizzle-orm";

/**
 * End-to-end tests for the Polar webhook route.
 *
 * These post signed Standard-Webhooks payloads through the actual
 * `@polar-sh/nextjs` adapter, so signature verification, payload
 * parsing, event dispatch, and `billing_events` idempotency all run.
 *
 * Requires a disposable integration Postgres (same target as the rest of
 * `tests/integration/`).
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

import { NextRequest } from "next/server";

import { billingEvents } from "@/lib/db/schema/subscriptions";
import { closeTestDb, testDb } from "@/tests/support/db";
import { polarUnresolvableUserSubscriptionPayload } from "@/tests/support/fixtures/polar";
import { signPolarPayload } from "@/tests/support/polar-webhook-signing";

const PREFIX = "polar_route_test";
const WEBHOOK_SECRET = "polar-test-secret";

let POST: typeof import("@/app/api/billing/polar/webhook/route").POST;

function webhookRequest(
  body: string,
  headers: Record<string, string>,
): NextRequest {
  return new NextRequest("http://localhost/api/billing/polar/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    body,
  });
}

function eventRows(providerEventId: string) {
  return testDb
    .select()
    .from(billingEvents)
    .where(like(billingEvents.providerEventId, providerEventId));
}

beforeAll(async () => {
  // Set the secret before the route (and its `@/lib/env` import) loads.
  vi.stubEnv("POLAR_WEBHOOK_SECRET", WEBHOOK_SECRET);
  ({ POST } = await import("@/app/api/billing/polar/webhook/route"));
});

afterAll(async () => {
  await testDb
    .delete(billingEvents)
    .where(like(billingEvents.providerEventId, `%${PREFIX}%`));
  vi.unstubAllEnvs();
  await closeTestDb();
});

describe("Polar webhook route", () => {
  it("rejects a payload whose signature does not match", async () => {
    const payload = polarUnresolvableUserSubscriptionPayload({
      eventTimestamp: new Date().toISOString(),
      subscriptionId: `${PREFIX}_invalid_signature`,
    });
    const body = JSON.stringify(payload);
    const signed = signPolarPayload("wrong-secret", body);

    const response = await POST(webhookRequest(body, signed.headers));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ received: false });

    const rows = await eventRows(
      `%${PREFIX}_invalid_signature%`,
    );
    expect(rows).toHaveLength(0);
  });

  it("accepts a signed payload and records an unresolvable event as failed", async () => {
    const payload = polarUnresolvableUserSubscriptionPayload({
      eventTimestamp: new Date().toISOString(),
      subscriptionId: `${PREFIX}_unresolvable`,
    });
    const body = JSON.stringify(payload);
    const signed = signPolarPayload(WEBHOOK_SECRET, body);

    const response = await POST(webhookRequest(body, signed.headers));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ received: true });

    const rows = await eventRows(`%${PREFIX}_unresolvable%`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      businessId: null,
      status: "failed",
      errorMessage: "Business not found",
    });
  });

  it("deduplicates redelivery of the same signed event", async () => {
    const payload = polarUnresolvableUserSubscriptionPayload({
      eventTimestamp: new Date().toISOString(),
      subscriptionId: `${PREFIX}_duplicate`,
    });
    const body = JSON.stringify(payload);

    const first = signPolarPayload(WEBHOOK_SECRET, body);
    const firstResponse = await POST(webhookRequest(body, first.headers));
    expect(firstResponse.status).toBe(200);

    // Polar retries with a fresh webhook id/signature but the same event
    // envelope. The route must not create a second billing_events row.
    const retry = signPolarPayload(WEBHOOK_SECRET, body);
    const retryResponse = await POST(webhookRequest(body, retry.headers));
    expect(retryResponse.status).toBe(200);

    const rows = await eventRows(`%${PREFIX}_duplicate%`);
    expect(rows).toHaveLength(1);
  });
});
