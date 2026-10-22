import { NextResponse } from "next/server";
import { agentChatRequestSchema } from "@/features/agent/schemas";
import { runAgent } from "@/features/agent/orchestrator";
import {
  decodeChatAttachmentsOrResponse,
  mapChatError,
} from "@/lib/ai/chat-route-errors";
import {
  extractUiMessageText,
  uiMessageSchema,
} from "@/lib/ai/chat-request";
import {
  assertPublicActionRateLimit,
  getPublicActionClientIpAddress,
} from "@/lib/public-action-rate-limit";
import { headers } from "next/headers";

/**
 * Agent Chat API Route
 *
 * POST /api/ai/agent/chat
 * Body (UI transport): { sessionToken, messages: UIMessage[] }
 * Body (legacy): { sessionToken, content }
 * Returns: UI message stream
 *
 * Anonymous surface: rate limited per-IP and per-session, with a
 * per-business daily ceiling and a per-session lifetime message cap
 * enforced in the orchestrator. Always offers the inquiry form fallback.
 */
export async function POST(request: Request) {
  try {
    // Parse and validate request body
    const body = await request.json().catch(() => null);
    const parsed = agentChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request. Session token and message content are required." },
        { status: 400 },
      );
    }

    const { sessionToken, proposedInquiryValues, attachments } = parsed.data;

    // Decode attachment data URLs to bytes (cheap). Validation, extraction,
    // and the daily plan limit are enforced in the orchestrator before any
    // model call, so a rejected file costs no tokens.
    const decoded = decodeChatAttachmentsOrResponse(
      attachments,
      "Photos can't be read in chat yet. Describe what you need in words, or use the inquiry form.",
    );
    if (!decoded.ok) return decoded.response;
    const rawAttachments = decoded.rawAttachments;
    // A malformed `messages` array is a client error, not a server fault:
    // parsing it outside a guarded branch turned a bad payload into a 500.
    const uiMessagesResult = Array.isArray(
      (body as { messages?: unknown }).messages,
    )
      ? uiMessageSchema.array().safeParse(
          (body as { messages?: unknown }).messages,
        )
      : null;

    if (uiMessagesResult && !uiMessagesResult.success) {
      return NextResponse.json(
        { error: "Invalid request. Session token and message content are required." },
        { status: 400 },
      );
    }

    const uiMessages = uiMessagesResult?.data;
    const content =
      "content" in parsed.data && typeof parsed.data.content === "string"
        ? parsed.data.content
        : undefined;

    // The client message id makes a retry idempotent: the same turn is not
    // persisted (and not billed) twice.
    const latestUserMessage = uiMessages
      ? [...uiMessages].reverse().find((message) => message.role === "user")
      : undefined;
    const clientMessageId = latestUserMessage?.id ?? null;

    const headerStore = await headers();
    const clientIp = getPublicActionClientIpAddress(headerStore);

    // Rate limit: per-IP (100 messages per hour).
    //
    // The User-Agent is client-controlled, so the fingerprint bucket alone
    // does not bound a sender that rotates it. `ipLimit` is the bucket that
    // actually bounds one, and `scopeLimit` is the flood backstop.
    const ipAllowed = await assertPublicActionRateLimit({
      action: "public-inquiry-submit",
      scope: `agent-ip:${clientIp}`,
      limit: 100,
      ipLimit: 100,
      scopeLimit: 1000,
      windowMs: 60 * 60 * 1000,
    });

    if (!ipAllowed) {
      return NextResponse.json(
        { error: "Too many messages. Please wait a moment before continuing." },
        { status: 429 },
      );
    }

    // Rate limit: per-session (50 messages per hour). The session token is
    // server-issued and not client-controlled, so this bucket cannot be
    // rotated.
    const sessionAllowed = await assertPublicActionRateLimit({
      action: "public-inquiry-submit",
      scope: `agent-session:${sessionToken}`,
      limit: 50,
      ipLimit: 50,
      windowMs: 60 * 60 * 1000,
    });

    if (!sessionAllowed) {
      return NextResponse.json(
        { error: "This conversation has reached its hourly message limit. Please try again later." },
        { status: 429 },
      );
    }

    // Run the agent (handles all business logic, tool execution, streaming)
    const response = await runAgent({
      sessionToken,
      attachments: rawAttachments,
      userMessage: content,
      clientMessageId,
      // The request's signal reaches the provider call, so a visitor who
      // stops generating actually cancels the turn.
      abortSignal: request.signal,
      uiMessages: uiMessages?.map((message) => ({
        role: message.role,
        content: extractUiMessageText(message),
      })),
      proposedInquiryValues: proposedInquiryValues as
        | Record<string, unknown>
        | undefined,
    });

    return response;
  } catch (error) {
    console.error("Agent chat API error:", error);

    if (
      error instanceof Error &&
      (error.message.includes("Invalid or expired session") ||
        error.message.includes("not enabled") ||
        error.message.includes("not available on this plan"))
    ) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }

    const mapped = mapChatError(
      error,
      "Photos can't be read in chat yet. Describe what you need in words, or use the inquiry form.",
    );
    if (mapped) return mapped;

    // Generic error
    return NextResponse.json(
      {
        error:
          "Something went wrong processing your message. Please try again or use the traditional inquiry form.",
      },
      { status: 500 },
    );
  }
}
