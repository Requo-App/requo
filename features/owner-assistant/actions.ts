"use server";

import { getSession } from "@/lib/auth/session";
import { getBusinessActionContext } from "@/lib/db/business-access";
import {
  consumeToolConfirmation,
  createAssistantSession,
  deleteAssistantSession,
  listAssistantSessions,
  renameAssistantSession,
  addMessage,
} from "@/features/owner-assistant/session-service";
import { executeUpdateInquiryStatus } from "@/features/owner-assistant/tools/update-inquiry-status";
import { executeSendQuote } from "@/features/owner-assistant/tools/send-quote";
import { updateInquiryStatusSchema, sendQuoteSchema } from "@/features/owner-assistant/schemas";
import type { ToolExecutionContext } from "@/features/owner-assistant/types";

async function requireMember(businessSlug: string) {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: "Unauthorized" as const };
  }

  const userId: string = session.user.id;
  // The Assistant performs operational writes (create inquiries, create and
  // send quotes), so a plan-locked or archived business must not reach them.
  const result = await getBusinessActionContext({
    businessSlug,
    requireActiveBusiness: true,
  });
  if (!result.ok) {
    return { error: result.error };
  }

  const { business, role } = result.businessContext;
  return {
    business,
    role,
    userId,
  };
}

/**
 * Create an Assistant Session on the server and optionally persist the first
 * user message. The server owns the identifier — the client navigates to it.
 */
export async function createAssistantSessionAction({
  businessSlug,
  initialMessage,
}: {
  businessSlug: string;
  initialMessage?: string;
}): Promise<{ sessionId: string } | { error: string }> {
  const member = await requireMember(businessSlug);
  if ("error" in member)
    return { error: member.error ?? "Something went wrong." };

  const { sessionId } = await createAssistantSession({
    businessId: member.business.id,
    userId: member.userId,
    initialMessage: initialMessage?.trim() ? initialMessage.trim() : undefined,
  });

  return { sessionId };
}

export async function renameAssistantSessionAction({
  businessSlug,
  sessionId,
  title,
}: {
  businessSlug: string;
  sessionId: string;
  title: string;
}): Promise<{ ok: true } | { error: string }> {
  const member = await requireMember(businessSlug);
  if ("error" in member) return { error: member.error ?? "Something went wrong." };

  const renamed = await renameAssistantSession({
    businessId: member.business.id,
    userId: member.userId,
    sessionId,
    title,
  });

  return renamed ? { ok: true } : { error: "Conversation not found." };
}

export async function deleteAssistantSessionAction({
  businessSlug,
  sessionId,
}: {
  businessSlug: string;
  sessionId: string;
}): Promise<{ ok: true } | { error: string }> {
  const member = await requireMember(businessSlug);
  if ("error" in member) return { error: member.error ?? "Something went wrong." };

  const deleted = await deleteAssistantSession({
    businessId: member.business.id,
    userId: member.userId,
    sessionId,
  });

  return deleted ? { ok: true } : { error: "Conversation not found." };
}

export async function listAssistantSessionsAction({
  businessSlug,
  limit = 20,
  offset = 0,
}: {
  businessSlug: string;
  limit?: number;
  offset?: number;
}): Promise<
  | {
      sessions: Array<{
        id: string;
        title: string | null;
        lastMessageAt: string;
        createdAt: string;
      }>;
      total: number;
      hasMore: boolean;
    }
  | { error: string }
> {
  const member = await requireMember(businessSlug);
  if ("error" in member) return { error: member.error ?? "Something went wrong." };

  const { sessions, total } = await listAssistantSessions({
    businessId: member.business.id,
    userId: member.userId,
    limit,
    offset,
  });

  return {
    sessions: sessions.map((s) => ({
      id: s.id,
      title: s.title,
      lastMessageAt: s.lastMessageAt.toISOString(),
      createdAt: s.createdAt.toISOString(),
    })),
    total,
    hasMore: offset + sessions.length < total,
  };
}

/**
 * Approve or reject a staged high-risk operation. Approval executes the real
 * operation exactly once (the staged confirmation is consumed) and persists
 * the outcome to the session so a reload shows what happened.
 */
export async function confirmAssistantToolAction({
  businessSlug,
  sessionId,
  confirmationId,
  decision,
}: {
  businessSlug: string;
  sessionId: string;
  confirmationId: string;
  decision: "approved" | "rejected";
}): Promise<
  | { ok: true; summary: string }
  | { ok: false; error: string; summary: string }
  | { error: string }
> {
  const member = await requireMember(businessSlug);
  if ("error" in member) return { error: member.error ?? "Something went wrong." };

  const pending = await consumeToolConfirmation({
    businessId: member.business.id,
    userId: member.userId,
    sessionId,
    confirmationId,
  });
  if (!pending) {
    return { error: "That confirmation has expired or was already handled." };
  }

  if (decision === "rejected") {
    await addMessage({
      sessionId,
      role: "assistant",
      content: "Cancelled — nothing was changed.",
    });
    return { ok: true, summary: "Cancelled — nothing was changed." };
  }

  const toolContext: ToolExecutionContext = {
    businessId: member.business.id,
    userId: member.userId,
    userRole: member.role,
    plan: member.business.plan,
    session: {
      sessionId,
      businessId: member.business.id,
      userId: member.userId,
      userRole: member.role,
      plan: member.business.plan,
      title: null,
      state: { lastMentioned: {} },
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };

  let outcome: { summary: string; output: unknown; toolName: string };
  let failed = false;
  if (pending.operation === "update_inquiry_status") {
    const parsed = updateInquiryStatusSchema.safeParse(pending.parameters);
    if (!parsed.success) {
      return { error: "The confirmed details were invalid." };
    }
    const result = await executeUpdateInquiryStatus(toolContext, parsed.data);
    failed = result.type === "error";
    outcome = {
      summary: result.summary,
      output: result,
      toolName: "update_inquiry_status",
    };
  } else if (pending.operation === "send_quote") {
    const parsed = sendQuoteSchema.safeParse(pending.parameters);
    if (!parsed.success) {
      return { error: "The confirmed details were invalid." };
    }
    const result = await executeSendQuote(toolContext, parsed.data);
    failed = result.type === "error";
    outcome = {
      summary: result.summary,
      output: result,
      toolName: "send_quote",
    };
  } else {
    return { error: "Unknown operation." };
  }

  await addMessage({
    sessionId,
    role: "tool",
    content: JSON.stringify(outcome.output),
    toolName: outcome.toolName,
    toolCallId: `confirmed-${confirmationId}`,
  });
  await addMessage({ sessionId, role: "assistant", content: outcome.summary });

  // A refused operation is not a success. Reporting it as one left every
  // programmatic caller unable to tell the two apart.
  if (failed) {
    return {
      ok: false,
      error: outcome.summary,
      summary: outcome.summary,
    };
  }

  return { ok: true, summary: outcome.summary };
}
