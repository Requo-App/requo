/**
 * Owner Assistant Session Service
 *
 * Handles session and message persistence for owner assistant conversations.
 */

import "server-only";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import { db } from "@/lib/db/client";
import {
  ownerAssistantMessages,
  ownerAssistantSessions,
} from "@/lib/db/schema/owner-assistant";
import type { OwnerAssistantSession } from "@/features/owner-assistant/types";

/** Derive a sidebar title from the opening message (single line, truncated). */
export function generateAssistantTitle(firstMessage: string): string {
  const singleLine = firstMessage.replace(/\s+/g, " ").trim();
  if (singleLine.length <= 60) return singleLine || "New conversation";
  return `${singleLine.slice(0, 57).trimEnd()}…`;
}

/**
 * Load or create an owner assistant session.
 * If sessionId is provided and exists, loads it. Otherwise creates a new session.
 */
export async function loadOrCreateSession({
  businessId,
  userId,
  userRole,
  plan,
  sessionId,
}: {
  businessId: string;
  userId: string;
  userRole: string;
  plan: string;
  sessionId?: string;
}): Promise<OwnerAssistantSession> {
  // Try to load existing session if sessionId provided
  if (sessionId) {
    const existing = await db.query.ownerAssistantSessions.findFirst({
      where: and(
        eq(ownerAssistantSessions.id, sessionId),
        eq(ownerAssistantSessions.businessId, businessId),
        eq(ownerAssistantSessions.userId, userId),
      ),
      with: {
        messages: {
          // (createdAt, id) keeps same-millisecond tool rows in a stable order.
          orderBy: [
            desc(ownerAssistantMessages.createdAt),
            desc(ownerAssistantMessages.id),
          ],
          limit: 50, // Last 50 messages for context
        },
      },
    });

    if (existing) {
      return {
        sessionId: existing.id,
        businessId: existing.businessId,
        userId: existing.userId,
        userRole,
        plan,
        title: existing.title,
        state: {
          lastMentioned:
            (existing.state as { lastMentioned?: Record<string, unknown> } | null)
              ?.lastMentioned || {},
        },
        messages: existing.messages
          .reverse()
          .map(
            (m: {
              role: string;
              content: string;
              toolName?: string | null;
              toolCallId?: string | null;
              id?: string;
            }) => ({
              role: m.role,
              content: m.content,
              toolName: m.toolName ?? null,
              toolCallId: m.toolCallId ?? null,
              id: m.id,
            }),
          ),
        createdAt: existing.createdAt,
        updatedAt: existing.updatedAt,
      };
    }
  }

  // Create new session
  const newSessionId = `oas_${nanoid(24)}`;

  await db.insert(ownerAssistantSessions).values({
    id: newSessionId,
    businessId,
    userId,
    state: { lastMentioned: {} },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
    lastMessageAt: new Date(),
  });

  return {
    sessionId: newSessionId,
    businessId,
    userId,
    userRole,
    plan,
    title: null,
    state: { lastMentioned: {} },
    messages: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Create a new Assistant Session owned by the server.
 *
 * The server mints the identifier (`oas_*`); the client must never mint one.
 * Optionally persists the opening user message and derives the title from it,
 * so a session exists only once a real conversation starts.
 */
export async function createAssistantSession({
  businessId,
  userId,
  initialMessage,
}: {
  businessId: string;
  userId: string;
  initialMessage?: string;
}): Promise<{ sessionId: string; title: string | null }> {
  const sessionId = `oas_${nanoid(24)}`;
  const now = new Date();
  const title = initialMessage?.trim()
    ? generateAssistantTitle(initialMessage)
    : null;

  await db.insert(ownerAssistantSessions).values({
    id: sessionId,
    businessId,
    userId,
    title,
    state: { lastMentioned: {} },
    metadata: {},
    createdAt: now,
    updatedAt: now,
    lastMessageAt: now,
  });

  if (initialMessage?.trim()) {
    await db.insert(ownerAssistantMessages).values({
      id: `oam_${nanoid(24)}`,
      sessionId,
      role: "user",
      content: initialMessage.trim(),
      metadata: {},
      createdAt: now,
    });
  }

  return { sessionId, title };
}

/**
 * Read-only session load. Returns null when the session does not belong to
 * the member — never creates a row (safe for GET / prefetch).
 */
export async function loadAssistantSession({
  businessId,
  userId,
  sessionId,
  messageLimit = 50,
}: {
  businessId: string;
  userId: string;
  sessionId: string;
  messageLimit?: number;
}): Promise<OwnerAssistantSession | null> {
  const existing = await db.query.ownerAssistantSessions.findFirst({
    where: and(
      eq(ownerAssistantSessions.id, sessionId),
      eq(ownerAssistantSessions.businessId, businessId),
      eq(ownerAssistantSessions.userId, userId),
    ),
    with: {
      messages: {
        // (createdAt, id) keeps same-millisecond tool rows in a stable order.
        orderBy: [
          desc(ownerAssistantMessages.createdAt),
          desc(ownerAssistantMessages.id),
        ],
        limit: messageLimit,
      },
    },
  });

  if (!existing) return null;

  return {
    sessionId: existing.id,
    businessId: existing.businessId,
    userId: existing.userId,
    userRole: "",
    plan: "",
    title: existing.title,
    state: {
      lastMentioned:
        (existing.state as { lastMentioned?: Record<string, unknown> } | null)
          ?.lastMentioned || {},
    },
    messages: existing.messages
      .reverse()
      .map(
        (m: {
          role: string;
          content: string;
          toolName?: string | null;
          toolCallId?: string | null;
          id?: string;
          createdAt?: Date;
        }) => ({
          role: m.role,
          content: m.content,
          toolName: m.toolName ?? null,
          toolCallId: m.toolCallId ?? null,
          id: m.id,
          createdAt: m.createdAt,
        }),
      ),
    createdAt: existing.createdAt,
    updatedAt: existing.updatedAt,
  };
}

export type AssistantTranscriptRow = {
  id: string;
  role: string;
  content: string;
  toolName: string | null;
  toolCallId: string | null;
};

/**
 * Server-rendered transcript for one conversation.
 *
 * Returns null when the id does not belong to this member — a stale link or a
 * deleted conversation. Callers treat that as "start a new chat" rather than a
 * 404, because conversation identity now travels in `?session=`, which the
 * client rewrites as it mints.
 */
export async function loadAssistantTranscript({
  businessId,
  userId,
  sessionId,
  limit = 100,
}: {
  businessId: string;
  userId: string;
  sessionId: string;
  limit?: number;
}): Promise<{
  sessionId: string;
  title: string | null;
  rows: AssistantTranscriptRow[];
} | null> {
  const session = await loadAssistantSession({
    businessId,
    userId,
    sessionId,
    messageLimit: limit,
  });

  if (!session) return null;

  return {
    sessionId: session.sessionId,
    title: session.title,
    // Rows arrive oldest-first from `loadAssistantSession`. Ids are only
    // missing for rows written before the column existed; a positional
    // fallback keeps React keys stable for those.
    rows: session.messages.map((message, index) => ({
      id: message.id ?? `${session.sessionId}-${index}`,
      role: message.role,
      content: message.content,
      toolName: message.toolName ?? null,
      toolCallId: message.toolCallId ?? null,
    })),
  };
}

/** Rename a session (member-scoped). Returns false when not found. */
export async function renameAssistantSession({
  businessId,
  userId,
  sessionId,
  title,
}: {
  businessId: string;
  userId: string;
  sessionId: string;
  title: string;
}): Promise<boolean> {
  const clean = title.replace(/\s+/g, " ").trim().slice(0, 80);
  if (!clean) return false;

  const updated = await db
    .update(ownerAssistantSessions)
    .set({ title: clean, updatedAt: new Date() })
    .where(
      and(
        eq(ownerAssistantSessions.id, sessionId),
        eq(ownerAssistantSessions.businessId, businessId),
        eq(ownerAssistantSessions.userId, userId),
      ),
    )
    .returning({ id: ownerAssistantSessions.id });

  return updated.length > 0;
}

/** Delete a session and its messages (member-scoped, cascade). */
export async function deleteAssistantSession({
  businessId,
  userId,
  sessionId,
}: {
  businessId: string;
  userId: string;
  sessionId: string;
}): Promise<boolean> {
  const deleted = await db
    .delete(ownerAssistantSessions)
    .where(
      and(
        eq(ownerAssistantSessions.id, sessionId),
        eq(ownerAssistantSessions.businessId, businessId),
        eq(ownerAssistantSessions.userId, userId),
      ),
    )
    .returning({ id: ownerAssistantSessions.id });

  return deleted.length > 0;
}

export type AssistantSessionListItem = {
  id: string;
  title: string | null;
  lastMessageAt: Date;
  createdAt: Date;
};

/** Paginated member-scoped history, most recent first. */
export async function listAssistantSessions({
  businessId,
  userId,
  limit = 20,
  offset = 0,
}: {
  businessId: string;
  userId: string;
  limit?: number;
  offset?: number;
}): Promise<{ sessions: AssistantSessionListItem[]; total: number }> {
  const where = and(
    eq(ownerAssistantSessions.businessId, businessId),
    eq(ownerAssistantSessions.userId, userId),
  );

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: ownerAssistantSessions.id,
        title: ownerAssistantSessions.title,
        lastMessageAt: ownerAssistantSessions.lastMessageAt,
        createdAt: ownerAssistantSessions.createdAt,
      })
      .from(ownerAssistantSessions)
      .where(where)
      .orderBy(desc(ownerAssistantSessions.lastMessageAt))
      .limit(Math.min(Math.max(limit, 1), 50))
      .offset(Math.max(offset, 0)),
    db
      .select({ count: sql<number>`count(*)` })
      .from(ownerAssistantSessions)
      .where(where),
  ]);

  const total = Number(count);
  return { sessions: rows, total };
}

/**
 * Add a message to an owner assistant session.
 *
 * Empty user/assistant rows are dropped: persisting `{role: "assistant",
 * content: ""}` poisons the next turn (the Google provider rejects messages
 * with no parts, and the UI renders a blank turn). Tool rows may legitimately
 * hold `"{}"`, so they are exempt.
 */
export async function addMessage({
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
  role: "user" | "assistant" | "tool" | "system";
  content: string;
  toolName?: string;
  toolCallId?: string;
  provider?: string;
  model?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  if ((role === "user" || role === "assistant") && !content.trim()) {
    return;
  }

  const messageId = `oam_${nanoid(24)}`;

  await db.insert(ownerAssistantMessages).values({
    id: messageId,
    sessionId,
    role,
    content,
    toolName,
    toolCallId,
    provider,
    model,
    metadata,
    createdAt: new Date(),
  });

  // Update session's last_message_at timestamp
  await db
    .update(ownerAssistantSessions)
    .set({ lastMessageAt: new Date(), updatedAt: new Date() })
    .where(eq(ownerAssistantSessions.id, sessionId));

  // Derive the sidebar title from the opening user message (only while unset,
  // so an explicit rename is never overwritten).
  if (role === "user" && content.trim()) {
    await db
      .update(ownerAssistantSessions)
      .set({
        title: generateAssistantTitle(content),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ownerAssistantSessions.id, sessionId),
          isNull(ownerAssistantSessions.title),
        ),
      );
  }
}

/**
 * Update session state (e.g., lastMentioned entities).
 */
export async function updateSessionState({
  sessionId,
  state,
}: {
  sessionId: string;
  state: Record<string, unknown>;
}): Promise<void> {
  await db
    .update(ownerAssistantSessions)
    .set({ state, updatedAt: new Date() })
    .where(eq(ownerAssistantSessions.id, sessionId));
}

/**
 * List recent sessions for a user in a business.
 */
export async function listRecentSessions({
  businessId,
  userId,
  limit = 10,
}: {
  businessId: string;
  userId: string;
  limit?: number;
}) {
  return await db.query.ownerAssistantSessions.findMany({
    where: and(
      eq(ownerAssistantSessions.businessId, businessId),
      eq(ownerAssistantSessions.userId, userId),
    ),
    orderBy: [desc(ownerAssistantSessions.lastMessageAt)],
    limit,
  });
}

export type PendingToolConfirmation = {
  confirmationId: string;
  operation: string;
  parameters: Record<string, unknown>;
  confirmationPrompt: string;
  createdAt: string;
};

type AssistantSessionState = {
  lastMentioned?: Record<string, unknown>;
  pendingConfirmations?: Record<string, PendingToolConfirmation>;
  [key: string]: unknown;
};

async function readSessionState(
  sessionId: string,
  scope?: { businessId: string; userId: string },
): Promise<AssistantSessionState> {
  const where = scope
    ? and(
        eq(ownerAssistantSessions.id, sessionId),
        eq(ownerAssistantSessions.businessId, scope.businessId),
        eq(ownerAssistantSessions.userId, scope.userId),
      )
    : eq(ownerAssistantSessions.id, sessionId);
  const [row] = await db
    .select({ state: ownerAssistantSessions.state })
    .from(ownerAssistantSessions)
    .where(where)
    .limit(1);
  return ((row?.state as AssistantSessionState | null) ?? {}) as AssistantSessionState;
}

/**
 * Stage a high-risk operation for explicit confirmation. The Tool itself must
 * not execute until `consumeToolConfirmation` returns the pending operation
 * with an approval decision.
 */
export async function requestToolConfirmation({
  sessionId,
  operation,
  parameters,
  confirmationPrompt,
}: {
  sessionId: string;
  operation: string;
  parameters: Record<string, unknown>;
  confirmationPrompt: string;
}): Promise<string> {
  const confirmationId = `confirm_${nanoid(16)}`;
  const state = await readSessionState(sessionId);
  const pendingConfirmations = {
    ...(state.pendingConfirmations ?? {}),
    [confirmationId]: {
      confirmationId,
      operation,
      parameters,
      confirmationPrompt,
      createdAt: new Date().toISOString(),
    },
  };

  await db
    .update(ownerAssistantSessions)
    .set({ state: { ...state, pendingConfirmations }, updatedAt: new Date() })
    .where(eq(ownerAssistantSessions.id, sessionId));

  return confirmationId;
}

/**
 * Consume a staged confirmation exactly once. Returns the pending operation
 * (or null when unknown / already consumed).
 */
export async function consumeToolConfirmation({
  businessId,
  userId,
  sessionId,
  confirmationId,
}: {
  businessId: string;
  userId: string;
  sessionId: string;
  confirmationId: string;
}): Promise<PendingToolConfirmation | null> {
  return db.transaction(async (tx) => {
    // Lock the scoped session while reading and removing the confirmation so
    // concurrent approvals cannot both execute the same operation.
    const [row] = await tx
      .select({ state: ownerAssistantSessions.state })
      .from(ownerAssistantSessions)
      .where(
        and(
          eq(ownerAssistantSessions.id, sessionId),
          eq(ownerAssistantSessions.businessId, businessId),
          eq(ownerAssistantSessions.userId, userId),
        ),
      )
      .for("update")
      .limit(1);

    const state = ((row?.state as AssistantSessionState | null) ?? {}) as AssistantSessionState;
    const pending = state.pendingConfirmations?.[confirmationId] ?? null;
    if (!pending) return null;

    const { [confirmationId]: _consumed, ...rest } = state.pendingConfirmations ?? {};
    await tx
      .update(ownerAssistantSessions)
      .set({
        state: { ...state, pendingConfirmations: rest },
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(ownerAssistantSessions.id, sessionId),
          eq(ownerAssistantSessions.businessId, businessId),
          eq(ownerAssistantSessions.userId, userId),
        ),
      );

    return pending;
  });
}
