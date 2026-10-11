import { NextResponse } from "next/server";
import { agentChatRequestSchema } from "@/features/ai-agent/schemas";
import { runAgent } from "@/features/ai-agent/orchestrator";
import {
  ChatAttachmentError,
} from "@/lib/ai/chat-attachments";
import {
  decodeRequestAttachments,
  extractUiMessageText,
  uiMessageSchema,
} from "@/lib/ai/chat-request";
import {
  assertPublicActionRateLimit,
  getPublicActionClientIpAddress,
} from "@/lib/public-action-rate-limit";
import { headers } from "next/headers";

/**
 * AI Agent Chat API Route
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
    let rawAttachments: Array<{
      fileName: string;
      mimeType: string;
      bytes: Buffer;
    }> = [];
    try {
      rawAttachments = decodeRequestAttachments(
        attachments,
        "Photos can't be read in chat yet. Describe what you need in words, or use the inquiry form.",
      );
    } catch (error) {
      if (error instanceof ChatAttachmentError) {
        return NextResponse.json(
          {
            error:
              error.code === "image"
                ? "Photos can't be read in chat yet. Describe what you need in words, or use the inquiry form."
                : error.message,
          },
          { status: 400 },
        );
      }
      throw error;
    }
    const uiMessages = Array.isArray(
      (body as { messages?: unknown }).messages,
    )
      ? uiMessageSchema.array().parse(
          (body as { messages?: unknown }).messages,
        )
      : undefined;
    const content =
      "content" in parsed.data && typeof parsed.data.content === "string"
        ? parsed.data.content
        : undefined;

    const headerStore = await headers();
    const clientIp = getPublicActionClientIpAddress(headerStore);

    // Rate limit: per-IP (100 messages per hour)
    const ipAllowed = await assertPublicActionRateLimit({
      action: "public-inquiry-submit",
      scope: `ai-agent-ip:${clientIp}`,
      limit: 100,
      windowMs: 60 * 60 * 1000,
    });

    if (!ipAllowed) {
      return NextResponse.json(
        { error: "Too many messages. Please wait a moment before continuing." },
        { status: 429 },
      );
    }

    // Rate limit: per-session (50 messages per hour)
    const sessionAllowed = await assertPublicActionRateLimit({
      action: "public-inquiry-submit",
      scope: `ai-agent-session:${sessionToken}`,
      limit: 50,
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

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.startsWith("QUOTA_EXCEEDED:")) {
        const message = error.message.slice("QUOTA_EXCEEDED:".length).trim();
        return NextResponse.json(
          { error: message || "This business has reached its monthly chat usage limit." },
          { status: 429 },
        );
      }

      if (error.message.startsWith("SESSION_LIMIT_EXCEEDED:")) {
        const message = error.message
          .slice("SESSION_LIMIT_EXCEEDED:".length)
          .trim();
        return NextResponse.json({ error: message }, { status: 429 });
      }

      if (error.message.startsWith("INPUT_REJECTED:")) {
        const message = error.message.slice("INPUT_REJECTED:".length).trim();
        return NextResponse.json({ error: message }, { status: 400 });
      }

      if (error.message.startsWith("ATTACHMENT_REJECTED:")) {
        const message = error.message
          .slice("ATTACHMENT_REJECTED:".length)
          .trim();
        return NextResponse.json(
          {
            error:
              message === "IMAGE_NOT_SUPPORTED"
                ? "Photos can't be read in chat yet. Describe what you need in words, or use the inquiry form."
                : message || "That file can't be attached.",
          },
          { status: 400 },
        );
      }

      if (error.message.startsWith("UPLOAD_LIMIT_EXCEEDED:")) {
        const message = error.message
          .slice("UPLOAD_LIMIT_EXCEEDED:".length)
          .trim();
        return NextResponse.json(
          {
            error:
              message ||
              "This business has reached its daily file-upload limit. Please describe what you need in words, or use the inquiry form.",
          },
          { status: 429 },
        );
      }

      if (
        error.message.includes("Invalid or expired session") ||
        error.message.includes("not enabled") ||
        error.message.includes("not available on this plan")
      ) {
        return NextResponse.json(
          { error: error.message },
          { status: 403 },
        );
      }

      if (error.message.includes("A user message is required")) {
        return NextResponse.json(
          { error: "Send a message to continue the conversation." },
          { status: 400 },
        );
      }

      if (error.message.includes("No suitable AI model")) {
        return NextResponse.json(
          {
            error:
              "AI service temporarily unavailable. Please try again in a moment or use the traditional inquiry form.",
          },
          { status: 503 },
        );
      }
    }

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
