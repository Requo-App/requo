/**
 * AI Agent Session Service
 *
 * CRUD operations for agent sessions.
 */

import "server-only";

import { and, eq, isNull, lt } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { aiAgentSessions, businesses } from "@/lib/db/schema";
import { getOperationalBusinessCondition } from "@/features/businesses/lifecycle";
import { newEntityId } from "@/lib/ids";
import type {
  SessionCreateResult,
  QualificationState,
  SessionMetadata,
  AgentSession,
} from "@/features/ai-agent/types";

/**
 * Generate a random session token (64-character hex string).
 */
function generateSessionToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Create a new agent session.
 */
export async function createAgentSession({
  businessId,
  metadata = {},
}: {
  businessId: string;
  metadata?: SessionMetadata;
}): Promise<SessionCreateResult> {
  const sessionId = newEntityId();
  const publicToken = generateSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000); // 24 hours

  const initialState: QualificationState = {
    collected: {},
    values: {},
    missing: ["customerName", "customerContactMethod", "customerContactHandle", "serviceSlug", "details"],
  };

  await db.insert(aiAgentSessions).values({
    id: sessionId,
    businessId,
    publicToken,
    status: "active",
    state: initialState,
    metadata,
    createdAt: now,
    updatedAt: now,
    expiresAt,
  });

  return {
    sessionId,
    publicToken,
    expiresAt,
  };
}

/**
 * Load a session by its public token.
 * Returns null if not found or expired.
 */
export async function loadSessionByToken(
  publicToken: string,
): Promise<
  | (AgentSession & {
      business: {
        id: string;
        name: string;
        slug: string;
        plan: string;
        shortDescription: string | null;
        contactEmail: string | null;
        inquiryFormConfig: unknown;
        aiAgentEnabled: boolean;
        aiAgentConfig: unknown;
      };
    })
  | null
> {
  const result = await db
    .select({
      session: aiAgentSessions,
      business: {
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        plan: businesses.plan,
        businessType: businesses.businessType,
        shortDescription: businesses.shortDescription,
        contactEmail: businesses.contactEmail,
        inquiryFormConfig: businesses.inquiryFormConfig,
        aiAgentEnabled: businesses.aiAgentEnabled,
        aiAgentConfig: businesses.aiAgentConfig,
      },
    })
    .from(aiAgentSessions)
    .innerJoin(businesses, eq(aiAgentSessions.businessId, businesses.id))
    .where(
      and(
        eq(aiAgentSessions.publicToken, publicToken),
        getOperationalBusinessCondition(),
      ),
    )
    .limit(1);

  if (!result[0]) {
    return null;
  }

  const { session, business } = result[0];

  // Check if session is expired
  if (session.expiresAt < new Date()) {
    return null;
  }

  return {
    ...session,
    business,
  };
}

/**
 * Load a session by ID (for internal use).
 */
export async function loadSessionById(sessionId: string): Promise<AgentSession | null> {
  const [session] = await db
    .select()
    .from(aiAgentSessions)
    .where(eq(aiAgentSessions.id, sessionId))
    .limit(1);

  return session ?? null;
}

/**
 * Update session state.
 *
 * Accepts the full session state (Qualification plus the single staged
 * Proposed Inquiry). Older callers pass Qualification only — the proposal is
 * preserved when absent so partial updates never drop it.
 */
export async function updateSessionState({
  sessionId,
  state,
}: {
  sessionId: string;
  state: QualificationState | import("@/features/ai-agent/types").AgentSessionState;
}): Promise<void> {
  const incoming = state as import("@/features/ai-agent/types").AgentSessionState;
  if (incoming.proposedInquiry === undefined) {
    const [current] = await db
      .select({ state: aiAgentSessions.state })
      .from(aiAgentSessions)
      .where(eq(aiAgentSessions.id, sessionId))
      .limit(1);
    const existing = (current?.state as { proposedInquiry?: unknown } | null) ?? {};
    const merged = {
      ...(incoming as Record<string, unknown>),
      ...(existing.proposedInquiry !== undefined
        ? { proposedInquiry: existing.proposedInquiry }
        : {}),
    };
    await db
      .update(aiAgentSessions)
      .set({ state: merged, updatedAt: new Date() })
      .where(eq(aiAgentSessions.id, sessionId));
    return;
  }

  await db
    .update(aiAgentSessions)
    .set({
      state,
      updatedAt: new Date(),
    })
    .where(eq(aiAgentSessions.id, sessionId));
}

/**
 * Read the staged Proposed Inquiry for a session, if any.
 */
export async function getStagedProposal(
  sessionId: string,
): Promise<import("@/features/ai-agent/types").ProposedInquiry | null> {
  const [row] = await db
    .select({ state: aiAgentSessions.state })
    .from(aiAgentSessions)
    .where(eq(aiAgentSessions.id, sessionId))
    .limit(1);
  const state = (row?.state as {
    proposedInquiry?: import("@/features/ai-agent/types").ProposedInquiry | null;
  } | null) ?? {};
  return state.proposedInquiry ?? null;
}

/**
 * Stage (or supersede) the single Proposed Inquiry on a session. A revision
 * supersedes rather than versions — the session holds at most one.
 */
export async function stageProposedInquiry({
  sessionId,
  proposal,
}: {
  sessionId: string;
  proposal: import("@/features/ai-agent/types").ProposedInquiry;
}): Promise<void> {
  const [row] = await db
    .select({ state: aiAgentSessions.state })
    .from(aiAgentSessions)
    .where(eq(aiAgentSessions.id, sessionId))
    .limit(1);
  const current = (row?.state as Record<string, unknown> | null) ?? {};
  await db
    .update(aiAgentSessions)
    .set({
      state: { ...current, proposedInquiry: proposal },
      updatedAt: new Date(),
    })
    .where(eq(aiAgentSessions.id, sessionId));
}

/**
 * Persist card edits riding along on a chat send before the model runs.
 * Merges the posted values into the pending proposal so chat revision and
 * manual editing compose instead of clobbering each other. No-op when no
 * pending proposal is staged.
 */
export async function persistProposalValuesFromCard({
  sessionId,
  values,
}: {
  sessionId: string;
  values: Record<string, unknown>;
}): Promise<void> {
  const [row] = await db
    .select({ state: aiAgentSessions.state })
    .from(aiAgentSessions)
    .where(eq(aiAgentSessions.id, sessionId))
    .limit(1);
  const current = (row?.state as {
    proposedInquiry?: import("@/features/ai-agent/types").ProposedInquiry | null;
  } & Record<string, unknown>) ?? {};
  const pending = current.proposedInquiry;
  if (!pending || pending.status !== "pending") return;

  const mergedValues = { ...pending.values, ...values };
  // Drop undefined so partial posts never blank a field with undefined.
  for (const key of Object.keys(mergedValues)) {
    if ((mergedValues as Record<string, unknown>)[key] === undefined) {
      delete (mergedValues as Record<string, unknown>)[key];
    }
  }

  await db
    .update(aiAgentSessions)
    .set({
      state: {
        ...current,
        proposedInquiry: { ...pending, values: mergedValues },
      },
      updatedAt: new Date(),
    })
    .where(eq(aiAgentSessions.id, sessionId));
}

/**
 * Clear the staged proposal (discard). Leaves the session usable and creates
 * nothing. The discard is recorded in the transcript by the caller.
 */
export async function clearStagedProposal({
  sessionId,
}: {
  sessionId: string;
}): Promise<void> {
  const [row] = await db
    .select({ state: aiAgentSessions.state })
    .from(aiAgentSessions)
    .where(eq(aiAgentSessions.id, sessionId))
    .limit(1);
  const current = (row?.state as Record<string, unknown> | null) ?? {};
  if (!("proposedInquiry" in current)) return;
  const { proposedInquiry: _removed, ...rest } = current as {
    proposedInquiry?: unknown;
  } & Record<string, unknown>;
  await db
    .update(aiAgentSessions)
    .set({ state: rest, updatedAt: new Date() })
    .where(eq(aiAgentSessions.id, sessionId));
}

/**
 * Fields the Agent must collect before it can file an inquiry.
 */
export const REQUIRED_QUALIFICATION_FIELDS = [
  "customerName",
  "customerContactMethod",
  "customerContactHandle",
  "serviceSlug",
  "details",
] as const;

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE_PATTERN = /(\+?\d[\d\s().-]{7,}\d)/;
const NAME_PATTERNS = [
  /\bmy name is\s+([a-zA-Z'’-]+(?:\s+[a-zA-Z'’-]+){0,2})/i,
  /\bi['’]m\s+([a-zA-Z'’-]+(?:\s+[a-zA-Z'’-]+){0,2})/i,
  /\bthis is\s+([a-zA-Z'’-]+(?:\s+[a-zA-Z'’-]+){0,2})/i,
  /\bcall me\s+([a-zA-Z'’-]+(?:\s+[a-zA-Z'’-]+){0,2})/i,
];

/**
 * Advance qualification state from a customer message.
 *
 * Conservative extraction only: contact details matching well-known shapes
 * and substantive free text for project details. Anything ambiguous is left
 * for the model to ask about — never guessed.
 */
export function advanceQualificationFromMessage(
  state: QualificationState,
  userMessage: string,
): QualificationState {
  const collected = { ...state.collected };
  const values = { ...state.values };
  const text = userMessage.trim();

  const emailMatch = text.match(EMAIL_PATTERN);
  const email = emailMatch?.[0].replace(/[.,;:!?]+$/, "");
  if (email && !values.customerEmail) {
    values.customerEmail = email;
    collected.customerEmail = true;
  }
  if (email && !values.customerContactHandle) {
    if (!values.customerContactMethod) {
      values.customerContactMethod = "email";
      collected.customerContactMethod = true;
    }
    if (values.customerContactMethod === "email") {
      values.customerContactHandle = email;
      collected.customerContactHandle = true;
    }
  }

  if (!values.customerContactHandle) {
    const phoneMatch = text.match(PHONE_PATTERN);
    if (phoneMatch) {
      if (!values.customerContactMethod) {
        values.customerContactMethod = "phone";
        collected.customerContactMethod = true;
      }
      values.customerContactHandle = phoneMatch[0].trim();
      collected.customerContactHandle = true;
    }
  }

  if (!values.customerName) {
    for (const pattern of NAME_PATTERNS) {
      const match = text.match(pattern);
      if (match?.[1]) {
        const name = match[1].trim().replace(/\s+/g, " ");
        if (name.length >= 2 && name.length <= 80) {
          values.customerName = name;
          collected.customerName = true;
          break;
        }
      }
    }
  }

  if (!values.details && text.length >= 30) {
    values.details = text.slice(0, 500);
    collected.details = true;
  }

  const missing = REQUIRED_QUALIFICATION_FIELDS.filter(
    (field) => !collected[field],
  );

  return { collected, values, missing };
}

/**
 * Update session metadata.
 */
export async function updateSessionMetadata({
  sessionId,
  metadata,
}: {
  sessionId: string;
  metadata: SessionMetadata;
}): Promise<void> {
  await db
    .update(aiAgentSessions)
    .set({
      metadata,
      updatedAt: new Date(),
    })
    .where(eq(aiAgentSessions.id, sessionId));
}

/**
 * Complete a session by linking it to an inquiry.
 */
export async function completeSession({
  sessionId,
  inquiryId,
}: {
  sessionId: string;
  inquiryId: string;
}): Promise<void> {
  const now = new Date();

  await db
    .update(aiAgentSessions)
    .set({
      status: "completed",
      inquiryId,
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(aiAgentSessions.id, sessionId));
}

/**
 * Mark a session as requiring human handoff.
 */
export async function requestSessionHandoff({
  sessionId,
  reason,
  recommendation,
}: {
  sessionId: string;
  reason: string;
  recommendation?: string;
}): Promise<void> {
  const now = new Date();
  const [session] = await db
    .select()
    .from(aiAgentSessions)
    .where(eq(aiAgentSessions.id, sessionId))
    .limit(1);

  if (!session) {
    throw new Error("Session not found");
  }

  const metadata = session.metadata as SessionMetadata;

  await db
    .update(aiAgentSessions)
    .set({
      status: "human_handoff",
      metadata: {
        ...metadata,
        handoffReason: reason,
        handoffRecommendation: recommendation,
      },
      completedAt: now,
      updatedAt: now,
    })
    .where(eq(aiAgentSessions.id, sessionId));
}

/**
 * Expire abandoned sessions (called by background job).
 */
export async function expireAbandonedSessions(): Promise<number> {
  const now = new Date();

  // Use returning() to count updated rows — Drizzle/postgres-js RowList
  // doesn't expose a reliable cross-driver rowCount property.
  const updated = await db
    .update(aiAgentSessions)
    .set({
      status: "abandoned",
      updatedAt: now,
    })
    .where(
      and(
        eq(aiAgentSessions.status, "active"),
        lt(aiAgentSessions.expiresAt, now),
      ),
    )
    .returning({ id: aiAgentSessions.id });

  return updated.length;
}

/**
 * Get session count for a business (for observability).
 */
export async function getSessionCountForBusiness({
  businessId,
  status,
}: {
  businessId: string;
  status?: "active" | "completed" | "human_handoff" | "abandoned";
}): Promise<number> {
  const conditions = [eq(aiAgentSessions.businessId, businessId)];

  if (status) {
    conditions.push(eq(aiAgentSessions.status, status));
  }

  const result = await db
    .select({ count: aiAgentSessions.id })
    .from(aiAgentSessions)
    .where(and(...conditions));

  return result.length;
}

/**
 * Purge Agent transcripts that never produced an inquiry.
 *
 * Privacy boundary: an Agent Session becomes visible to the business only
 * through an Inquiry it produced. Conversations older than `olderThanDays`
 * with no linked inquiry are deleted (messages and runs cascade).
 * Assistant history is retained indefinitely and is unaffected.
 */
export async function purgeOrphanAgentTranscripts(
  olderThanDays = 30,
): Promise<number> {
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  );

  const deleted = await db
    .delete(aiAgentSessions)
    .where(
      and(
        lt(aiAgentSessions.createdAt, cutoff),
        isNull(aiAgentSessions.inquiryId),
      ),
    )
    .returning({ id: aiAgentSessions.id });

  return deleted.length;
}
