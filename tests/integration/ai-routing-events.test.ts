import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

import { cleanupTokenLogs } from "@/lib/ai/token-log-cleanup";
import { logAiRoutingEvent } from "@/lib/ai/routing-events";
import { aiRoutingEvents } from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

import { closeTestDb, testDb } from "@/tests/support/db";

const taskType = "test_ai_routing_events";

async function cleanup() {
  await testDb
    .delete(aiRoutingEvents)
    .where(eq(aiRoutingEvents.taskType, taskType));
}

describe("AI routing event persistence", () => {
  afterAll(async () => {
    await cleanup();
    await closeTestDb();
  });

  it("persists an explicit correlation ID and stable diagnostics", async () => {
    const correlationId = "test_ai_routing_events_explicit";

    await logAiRoutingEvent({
      eventType: "attempt_failed",
      correlationId,
      taskType,
      userId: "test_ai_routing_events_user",
      businessId: "test_ai_routing_events_business",
      provider: "groq",
      model: "llama-test",
      reason: "rate_limit",
      statusCode: 429,
      latencyMs: 812,
      attempt: 1,
    });

    const [persisted] = await testDb
      .select()
      .from(aiRoutingEvents)
      .where(eq(aiRoutingEvents.correlationId, correlationId))
      .limit(1);

    expect(persisted).toMatchObject({
      correlationId,
      eventType: "attempt_failed",
      taskType,
      userId: "test_ai_routing_events_user",
      businessId: "test_ai_routing_events_business",
      provider: "groq",
      model: "llama-test",
      reason: "rate_limit",
      statusCode: 429,
      latencyMs: 812,
      attempt: 1,
    });
    expect(persisted?.id).toBeTruthy();
    expect(persisted?.createdAt).toBeInstanceOf(Date);
  });

  it("mints an opaque correlation ID when the request has none", async () => {
    await logAiRoutingEvent({
      eventType: "fallback_selected",
      taskType,
      provider: "openrouter",
      model: "fallback-test",
      attempt: 2,
    });

    const [persisted] = await testDb
      .select({
        correlationId: aiRoutingEvents.correlationId,
        eventType: aiRoutingEvents.eventType,
      })
      .from(aiRoutingEvents)
      .where(
        and(
          eq(aiRoutingEvents.taskType, taskType),
          eq(aiRoutingEvents.provider, "openrouter"),
        ),
      )
      .limit(1);

    expect(persisted?.eventType).toBe("fallback_selected");
    expect(persisted?.correlationId).toMatch(/^ai_[A-Za-z0-9_-]+$/);
  });

  it("deletes routing events older than the retention window only", async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    await testDb.insert(aiRoutingEvents).values([
      {
        id: newEntityId(),
        correlationId: "test_ai_routing_events_cleanup_old_a",
        eventType: "attempt_failed",
        taskType,
        provider: "groq",
        model: "old-a",
        attempt: 1,
        createdAt: old,
      },
      {
        id: newEntityId(),
        correlationId: "test_ai_routing_events_cleanup_old_b",
        eventType: "fallback_selected",
        taskType,
        provider: "openrouter",
        model: "old-b",
        attempt: 2,
        createdAt: old,
      },
      {
        id: newEntityId(),
        correlationId: "test_ai_routing_events_cleanup_recent",
        eventType: "fallback_selected",
        taskType,
        provider: "openrouter",
        model: "recent",
        attempt: 0,
        createdAt: recent,
      },
    ]);

    const result = await cleanupTokenLogs();
    expect(result.deletedRoutingEvents).toBeGreaterThanOrEqual(2);

    const remaining = await testDb
      .select({ correlationId: aiRoutingEvents.correlationId })
      .from(aiRoutingEvents)
      .where(eq(aiRoutingEvents.taskType, taskType));
    const correlationIds = remaining.map((row) => row.correlationId);

    expect(correlationIds).toContain("test_ai_routing_events_cleanup_recent");
    expect(correlationIds).not.toContain("test_ai_routing_events_cleanup_old_a");
    expect(correlationIds).not.toContain("test_ai_routing_events_cleanup_old_b");
  }, 30_000);
});
