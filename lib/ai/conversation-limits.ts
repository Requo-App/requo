/**
 * Conversation volume limits — separate metering buckets per surface.
 *
 * The Assistant (owner-facing) is limited by user messages per business per
 * day; the Agent (customer-facing) is limited by sessions per business per
 * month, sessions per business per day (abuse ceiling), and user messages per
 * session. Customer traffic never consumes the owner's allowance and vice
 * versa. The shared weighted monthly credit pool (`checkUsageLimit`) remains
 * as a hard token-spend ceiling behind both buckets.
 *
 * Plan allowances live in `lib/plans/usage-limits.ts`:
 *   assistantMessagesPerDay: free 25 / pro 250 / business 1000
 *   agentSessionsPerMonth:   free 0 (not available) / pro 100 / business 500
 *   assistantFileUploadsPerDay / agentFileUploadsPerDay: 5 / 20 / 50 —
 *   ephemeral chat attachments, counted per business per day via the
 *   `attachmentCount` message-metadata marker (no counter table).
 */

import "server-only";

import { and, eq, gte, sql, type SQLWrapper } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  aiAgentMessages,
  aiAgentSessions,
  ownerAssistantMessages,
  ownerAssistantSessions,
} from "@/lib/db/schema";
import { ATTACHMENT_METADATA_KEY } from "@/lib/ai/chat-attachments";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import type { BusinessPlan } from "@/lib/plans/plans";

/** Lifetime user-message cap per Agent session. */
export const AGENT_MESSAGES_PER_SESSION = 50;

/** Per-business daily session ceiling (abuse protection, distinct from plan allowance). */
const AGENT_SESSIONS_PER_BUSINESS_PER_DAY: Record<BusinessPlan, number> = {
  free: 0,
  pro: 10,
  business: 50,
};

export type ConversationLimitResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "daily_limit" | "monthly_limit" | "session_limit";
      message: string;
      requiredPlan: BusinessPlan | null;
    };

function startOfDayUtc(now = new Date()): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function startOfMonthUtc(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/**
 * Assistant bucket: user messages per business per day.
 * Available on every plan (including free) with plan-varying volume.
 */
export async function checkAssistantMessageLimit({
  businessId,
  plan,
}: {
  businessId: string;
  plan: BusinessPlan;
}): Promise<ConversationLimitResult> {
  const limit = getUsageLimit(plan, "assistantMessagesPerDay") ?? 25;
  const since = startOfDayUtc();

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ownerAssistantMessages)
    .innerJoin(
      ownerAssistantSessions,
      eq(ownerAssistantMessages.sessionId, ownerAssistantSessions.id),
    )
    .where(
      and(
        eq(ownerAssistantSessions.businessId, businessId),
        eq(ownerAssistantMessages.role, "user"),
        gte(ownerAssistantMessages.createdAt, since),
      ),
    );

  if (Number(count) >= limit) {
    return {
      allowed: false,
      reason: "daily_limit",
      message: `You've reached your daily Assistant message limit (${limit}). It resets tomorrow.`,
      requiredPlan: plan === "free" ? "pro" : plan === "pro" ? "business" : null,
    };
  }

  return { allowed: true };
}

/**
 * Agent bucket: sessions per business per month (plan allowance) plus a
 * per-business daily ceiling (abuse protection).
 */
export async function checkAgentSessionLimit({
  businessId,
  plan,
}: {
  businessId: string;
  plan: BusinessPlan;
}): Promise<ConversationLimitResult> {
  const monthlyLimit = getUsageLimit(plan, "agentSessionsPerMonth") ?? 0;
  if (monthlyLimit <= 0) {
    return {
      allowed: false,
      reason: "monthly_limit",
      message: "Public chat is available on Pro and above.",
      requiredPlan: "pro",
    };
  }

  const monthStart = startOfMonthUtc();
  // Only sessions that produced a message count. An empty session is a
  // caller that opened a chat and left: counting it let ten scripted
  // requests exhaust a Pro business's daily ceiling without a single
  // conversation ever happening.
  const [{ monthCount }] = await db
    .select({ monthCount: sql<number>`count(distinct ${aiAgentSessions.id})` })
    .from(aiAgentSessions)
    .innerJoin(
      aiAgentMessages,
      eq(aiAgentMessages.sessionId, aiAgentSessions.id),
    )
    .where(
      and(
        eq(aiAgentSessions.businessId, businessId),
        gte(aiAgentSessions.createdAt, monthStart),
      ),
    );

  if (Number(monthCount) >= monthlyLimit) {
    return {
      allowed: false,
      reason: "monthly_limit",
      message: `This business has reached its monthly public-chat session limit (${monthlyLimit}).`,
      requiredPlan: plan === "pro" ? "business" : null,
    };
  }

  const dailyCeiling = AGENT_SESSIONS_PER_BUSINESS_PER_DAY[plan];
  const [{ dayCount }] = await db
    .select({ dayCount: sql<number>`count(distinct ${aiAgentSessions.id})` })
    .from(aiAgentSessions)
    .innerJoin(
      aiAgentMessages,
      eq(aiAgentMessages.sessionId, aiAgentSessions.id),
    )
    .where(
      and(
        eq(aiAgentSessions.businessId, businessId),
        gte(aiAgentSessions.createdAt, startOfDayUtc()),
      ),
    );

  if (Number(dayCount) >= dailyCeiling) {
    return {
      allowed: false,
      reason: "daily_limit",
      message: "This business has reached its daily public-chat session ceiling. Please try again tomorrow.",
      requiredPlan: null,
    };
  }

  return { allowed: true };
}

/**
 * File-upload bucket, shared shape for both surfaces: user messages carrying
 * the attachment marker, per business per day. Only turns that actually
 * attach files consume it — text-only turns are unaffected.
 */
async function checkFileUploadLimit({
  businessId,
  plan,
  limitKey,
  copy,
}: {
  businessId: string;
  plan: BusinessPlan;
  limitKey: "assistantFileUploadsPerDay" | "agentFileUploadsPerDay";
  copy: { noun: string; limitMessage: (limit: number) => string };
}): Promise<ConversationLimitResult> {
  const limit = getUsageLimit(plan, limitKey) ?? 5;
  const since = startOfDayUtc();

  const hasAttachment = (metadataColumn: SQLWrapper) =>
    sql`(${metadataColumn} ->> ${ATTACHMENT_METADATA_KEY}) IS NOT NULL`;

  const [{ count }] =
    limitKey === "assistantFileUploadsPerDay"
      ? await db
          .select({ count: sql<number>`count(*)` })
          .from(ownerAssistantMessages)
          .innerJoin(
            ownerAssistantSessions,
            eq(ownerAssistantMessages.sessionId, ownerAssistantSessions.id),
          )
          .where(
            and(
              eq(ownerAssistantSessions.businessId, businessId),
              eq(ownerAssistantMessages.role, "user"),
              gte(ownerAssistantMessages.createdAt, since),
              hasAttachment(ownerAssistantMessages.metadata),
            ),
          )
      : await db
          .select({ count: sql<number>`count(*)` })
          .from(aiAgentMessages)
          .innerJoin(
            aiAgentSessions,
            eq(aiAgentMessages.sessionId, aiAgentSessions.id),
          )
          .where(
            and(
              eq(aiAgentSessions.businessId, businessId),
              eq(aiAgentMessages.role, "user"),
              gte(aiAgentMessages.createdAt, since),
              hasAttachment(aiAgentMessages.metadata),
            ),
          );

  if (Number(count) >= limit) {
    return {
      allowed: false,
      reason: "daily_limit",
      message: copy.limitMessage(limit),
      requiredPlan: plan === "free" ? "pro" : plan === "pro" ? "business" : null,
    };
  }

  return { allowed: true };
}

/** Owner surface: file uploads per business per day (across members). */
export async function checkAssistantFileUploadLimit({
  businessId,
  plan,
}: {
  businessId: string;
  plan: BusinessPlan;
}): Promise<ConversationLimitResult> {
  return checkFileUploadLimit({
    businessId,
    plan,
    limitKey: "assistantFileUploadsPerDay",
    copy: {
      noun: "Assistant",
      limitMessage: (limit) =>
        `You've reached your daily file-upload limit (${limit} files). It resets tomorrow — or paste the key details as text.`,
    },
  });
}

/** Public surface: file uploads per business per day (across visitors). */
export async function checkAgentFileUploadLimit({
  businessId,
  plan,
}: {
  businessId: string;
  plan: BusinessPlan;
}): Promise<ConversationLimitResult> {
  return checkFileUploadLimit({
    businessId,
    plan,
    limitKey: "agentFileUploadsPerDay",
    copy: {
      noun: "Agent",
      limitMessage: (limit) =>
        `This business has reached its daily file-upload limit (${limit} files). Please describe what you need in words, or use the inquiry form.`,
    },
  });
}

/** Agent bucket: lifetime user messages per session. */
export async function checkAgentMessageLimit({
  sessionId,
}: {
  sessionId: string;
}): Promise<ConversationLimitResult> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(aiAgentMessages)
    .where(
      and(
        eq(aiAgentMessages.sessionId, sessionId),
        eq(aiAgentMessages.role, "user"),
      ),
    );

  if (Number(count) >= AGENT_MESSAGES_PER_SESSION) {
    return {
      allowed: false,
      reason: "session_limit",
      message: `This conversation has reached its message limit (${AGENT_MESSAGES_PER_SESSION}). Please start a new chat or use the inquiry form.`,
      requiredPlan: null,
    };
  }

  return { allowed: true };
}
