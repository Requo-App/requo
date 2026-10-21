/**
 * AI Agent Message Service
 *
 * Operations for persisting and retrieving agent messages.
 */

import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiAgentMessages } from "@/lib/db/schema";
import type { AgentMessage, MessageRole, MessageMetadata } from "@/features/ai-agent/types";
import { newEntityId } from "@/lib/ids";

/**
 * Whether a turn with this client-side message id was already persisted.
 *
 * A retry reuses the id, so the orchestrator can skip the write and the
 * second bill for the same turn.
 */
export async function hasAgentMessageWithClientId({
  sessionId,
  clientMessageId,
}: {
  sessionId: string;
  clientMessageId: string;
}): Promise<boolean> {
  const [row] = await db
    .select({ id: aiAgentMessages.id })
    .from(aiAgentMessages)
    .where(
      and(
        eq(aiAgentMessages.sessionId, sessionId),
        eq(aiAgentMessages.role, "user"),
        sql`${aiAgentMessages.metadata} ->> 'clientMessageId' = ${clientMessageId}`,
      ),
    )
    .limit(1);

  return Boolean(row);
}

/**
 * Add a message to a session.
 *
 * Empty user/assistant rows are dropped: they render as blank turns and, on
 * the owner surface, poison the next turn at the provider. Tool rows may
 * legitimately hold `"{}"`, so they are exempt.
 */
export async function addAgentMessage({
  sessionId,
  role,
  content,
  toolName,
  toolCallId,
  provider,
  model,
  metadata = {},
}: {
  sessionId: string;
  role: MessageRole;
  content: string;
  toolName?: string;
  toolCallId?: string;
  provider?: string;
  model?: string;
  metadata?: MessageMetadata;
}): Promise<AgentMessage> {
  if ((role === "user" || role === "assistant") && !content.trim()) {
    // Return a lightweight placeholder without a DB write so callers that
    // chain on the result keep working. The row must never exist.
    return {
      id: `skipped-empty-${Date.now()}`,
      sessionId,
      role,
      content: "",
      toolName: toolName ?? null,
      toolCallId: toolCallId ?? null,
      provider: provider ?? null,
      model: model ?? null,
      metadata,
      createdAt: new Date(),
    } as AgentMessage;
  }

  const messageId = newEntityId();
  const now = new Date();

  const [message] = await db
    .insert(aiAgentMessages)
    .values({
      id: messageId,
      sessionId,
      role,
      content,
      toolName: toolName ?? null,
      toolCallId: toolCallId ?? null,
      provider: provider ?? null,
      model: model ?? null,
      metadata,
      createdAt: now,
    })
    .returning();

  return message;
}

/**
 * Load conversation history for a session.
 * Returns messages in chronological order (oldest first).
 */
export async function loadConversationHistory(
  sessionId: string,
  options?: {
    limit?: number;
    offset?: number;
  },
): Promise<AgentMessage[]> {
  const query = db
    .select()
    .from(aiAgentMessages)
    .where(eq(aiAgentMessages.sessionId, sessionId))
    // (createdAt, id) keeps same-millisecond rows in a stable order.
    .orderBy(asc(aiAgentMessages.createdAt), asc(aiAgentMessages.id));

  if (options?.limit) {
    query.limit(options.limit);
  }

  if (options?.offset) {
    query.offset(options.offset);
  }

  return await query;
}

/**
 * Load most recent messages for a session.
 * Returns messages in reverse chronological order (newest first).
 */
export async function loadRecentMessages(
  sessionId: string,
  limit: number = 10,
): Promise<AgentMessage[]> {
  const messages = await db
    .select()
    .from(aiAgentMessages)
    .where(eq(aiAgentMessages.sessionId, sessionId))
    // (createdAt, id) keeps same-millisecond rows in a stable order.
    .orderBy(desc(aiAgentMessages.createdAt), desc(aiAgentMessages.id))
    .limit(limit);

  // Reverse to get chronological order
  return messages.reverse();
}

/**
 * Count messages in a session.
 */
export async function countSessionMessages(sessionId: string): Promise<number> {
  const result = await db
    .select({ count: aiAgentMessages.id })
    .from(aiAgentMessages)
    .where(eq(aiAgentMessages.sessionId, sessionId));

  return result.length;
}

/**
 * Count messages by role in a session.
 */
export async function countSessionMessagesByRole(
  sessionId: string,
  role: MessageRole,
): Promise<number> {
  const result = await db
    .select({ count: aiAgentMessages.id })
    .from(aiAgentMessages)
    .where(and(eq(aiAgentMessages.sessionId, sessionId), eq(aiAgentMessages.role, role)));

  return result.length;
}

/**
 * Build conversation history for the AI SDK.
 * Filters to user and assistant messages only, formats for the SDK.
 * Windowed to the most recent `limit` messages so a long session cannot grow
 * the prompt without bound. Empty rows (from before the empty-content guard)
 * are dropped: the Google provider rejects messages with no parts.
 */
export async function buildAiSdkMessages(
  sessionId: string,
  limit = 30,
): Promise<Array<{ role: "user" | "assistant"; content: string }>> {
  const messages = await loadRecentMessages(sessionId, limit);

  // Filter to user and assistant messages only
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .filter((m) => m.content.trim().length > 0)
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));
}
