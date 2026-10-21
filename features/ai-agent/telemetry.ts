/**
 * AI Agent Telemetry Service
 *
 * Agent run logging for observability and cost tracking.
 */

import "server-only";

import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiAgentRuns } from "@/lib/db/schema";
import type { AgentRun, RunStatus, RunMetadata } from "@/features/ai-agent/types";
import { newEntityId } from "@/lib/ids";

/**
 * Start a new agent run.
 */
export async function startAgentRun({
  businessId,
  sessionId,
  model,
  provider,
  metadata = {},
}: {
  businessId: string;
  sessionId: string;
  model: string;
  provider: string;
  metadata?: RunMetadata;
}): Promise<AgentRun> {
  const runId = newEntityId();
  const now = new Date();

  const [run] = await db
    .insert(aiAgentRuns)
    .values({
      id: runId,
      businessId,
      sessionId,
      model,
      provider,
      status: "running",
      startedAt: now,
      inputTokens: 0,
      outputTokens: 0,
      metadata,
    })
    .returning();

  return run;
}

/**
 * Update an agent run with completion data.
 */
export async function updateAgentRun({
  runId,
  status,
  inputTokens,
  outputTokens,
  estimatedCostCents,
  error,
  completedAt,
  metadata,
  model,
  provider,
}: {
  runId: string;
  status?: RunStatus;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostCents?: number;
  /** Pass null to clear a previously recorded error (e.g. a retried step recovered). */
  error?: string | null;
  completedAt?: Date;
  metadata?: RunMetadata;
  /** Serving model/provider — the run starts with the first candidate. */
  model?: string;
  provider?: string;
}): Promise<void> {
  const updates: Partial<AgentRun> = {};

  if (status !== undefined) {
    updates.status = status;
  }

  if (inputTokens !== undefined) {
    updates.inputTokens = inputTokens;
  }

  if (outputTokens !== undefined) {
    updates.outputTokens = outputTokens;
  }

  if (estimatedCostCents !== undefined) {
    updates.estimatedCostCents = String(estimatedCostCents);
  }

  if (error !== undefined) {
    updates.error = error;
  }

  if (model !== undefined) {
    updates.model = model;
  }

  if (provider !== undefined) {
    updates.provider = provider;
  }

  if (completedAt !== undefined) {
    updates.completedAt = completedAt;
  }

  if (metadata !== undefined) {
    const [existingRun] = await db
      .select()
      .from(aiAgentRuns)
      .where(eq(aiAgentRuns.id, runId))
      .limit(1);

    if (existingRun) {
      updates.metadata = {
        ...(existingRun.metadata as RunMetadata),
        ...metadata,
      };
    } else {
      updates.metadata = metadata;
    }
  }

  await db.update(aiAgentRuns).set(updates).where(eq(aiAgentRuns.id, runId));
}

/**
 * Mark a run as failed.
 */
export async function failAgentRun({
  runId,
  error,
}: {
  runId: string;
  error: string;
}): Promise<void> {
  await db
    .update(aiAgentRuns)
    .set({
      status: "failed",
      error,
      completedAt: new Date(),
    })
    .where(eq(aiAgentRuns.id, runId));
}

/**
 * Load a run by ID.
 */
export async function loadAgentRun(runId: string): Promise<AgentRun | null> {
  const [run] = await db
    .select()
    .from(aiAgentRuns)
    .where(eq(aiAgentRuns.id, runId))
    .limit(1);

  return run ?? null;
}

/**
 * Load all runs for a session.
 */
export async function loadSessionRuns(sessionId: string): Promise<AgentRun[]> {
  return await db
    .select()
    .from(aiAgentRuns)
    .where(eq(aiAgentRuns.sessionId, sessionId))
    .orderBy(aiAgentRuns.startedAt);
}

/**
 * Load runs for a business.
 */
export async function loadBusinessRuns(
  businessId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
): Promise<AgentRun[]> {
  const query = db
    .select()
    .from(aiAgentRuns)
    .where(eq(aiAgentRuns.businessId, businessId))
    .orderBy(aiAgentRuns.startedAt);

  if (options?.limit) {
    query.limit(options.limit);
  }

  if (options?.offset) {
    query.offset(options.offset);
  }

  return await query;
}

import { computeEstimatedCostCents as sharedEstimate } from "@/lib/ai/token-logger";

/**
 * Compute estimated cost in cents from token counts.
 * Uses the shared catalog-priced estimator so every run is priced from the
 * real catalog rather than a default rate.
 */
export function computeEstimatedCostCents({
  inputTokens,
  outputTokens,
  model,
  provider = "",
}: {
  inputTokens: number;
  outputTokens: number;
  model: string;
  provider?: string;
}): number {
  let resolvedProvider = provider;
  let resolvedModel = model;
  if (!resolvedProvider && model.includes(":")) {
    const idx = model.indexOf(":");
    resolvedProvider = model.slice(0, idx);
    resolvedModel = model.slice(idx + 1);
  }
  if (!resolvedProvider) {
    const lower = model.toLowerCase();
    if (lower.includes("gemini")) resolvedProvider = "google";
    else resolvedProvider = "groq";
  }
  const cost = sharedEstimate(resolvedProvider, resolvedModel, inputTokens, outputTokens);
  if (cost !== null) return Math.round(cost * 100) / 100;
  return 0;
}
