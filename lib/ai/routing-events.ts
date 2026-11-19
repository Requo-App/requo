import "server-only";

import { getCorrelationId, newCorrelationId } from "@/lib/observability/correlation";
import { logError } from "@/lib/observability/logger";
import { newEntityId } from "@/lib/ids";

/**
 * AI routing telemetry writer.
 *
 * Persists fallback attempts and the model that served after a fallback. The
 * payload deliberately carries no prompts, responses, message text, or raw
 * provider error bodies — only stable failure kinds, model identity, timing,
 * and an opaque correlation ID. Writes are best-effort: telemetry must never
 * fail the turn it is observing.
 */

export type AiRoutingEventType = "attempt_failed" | "fallback_selected";

export type LogAiRoutingEventParams = {
  eventType: AiRoutingEventType;
  /** Explicit correlation ID from the request scope; minted when absent. */
  correlationId?: string | null;
  taskType: string;
  userId?: string | null;
  businessId?: string | null;
  provider: string;
  model: string;
  /** Classifier kind (e.g. `rate_limit`, `timeout`), never a raw message. */
  reason?: string | null;
  statusCode?: number | null;
  latencyMs?: number | null;
  attempt?: number;
};

export async function logAiRoutingEvent(
  params: LogAiRoutingEventParams,
): Promise<void> {
  try {
    // Loaded lazily so importing this module (for example from a unit test
    // that only exercises event emission) never opens a database connection.
    const [{ db }, { aiRoutingEvents }] = await Promise.all([
      import("@/lib/db/client"),
      import("@/lib/db/schema"),
    ]);

    await db.insert(aiRoutingEvents).values({
      id: newEntityId(),
      correlationId:
        params.correlationId?.trim() || getCorrelationId() || newCorrelationId("ai"),
      eventType: params.eventType,
      taskType: params.taskType,
      userId: params.userId ?? null,
      businessId: params.businessId ?? null,
      provider: params.provider,
      model: params.model,
      reason: params.reason ?? null,
      statusCode: params.statusCode ?? null,
      latencyMs: params.latencyMs ?? null,
      attempt: params.attempt ?? 0,
    });
  } catch (error) {
    logError("ai.routing_event.persist_failed", error, {
      eventType: params.eventType,
      taskType: params.taskType,
      provider: params.provider,
      model: params.model,
    });
  }
}
