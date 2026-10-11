import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { assertBusinessActionRateLimit } from "@/lib/rate-limit/redis-rate-limiter";
import {
  ChatAttachmentError,
} from "@/lib/ai/chat-attachments";
import {
  decodeRequestAttachments,
  extractUiMessageText,
  uiMessageSchema,
} from "@/lib/ai/chat-request";
import { runOwnerAssistant } from "@/features/owner-assistant/orchestrator";
import { getBusinessSettingsForBusiness } from "@/features/settings/queries";

// Ephemeral chat attachments ride along as data URLs in the JSON body (never
// as chat message parts, so history never re-sends bytes). The orchestrator
// parses them to text for this turn only and discards the bytes.
const chatAttachmentSchema = z.object({
  filename: z.string().trim().min(1).max(160),
  mediaType: z.string().trim().max(160).default(""),
  dataUrl: z.string().min(1).max(4_000_000),
});

const ownerAssistantChatRequestSchema = z.object({
  businessSlug: z.string().min(1),
  sessionId: z.string().optional(),
  // AI SDK UI messages (sent by useChat) — the latest user turn is the input.
  messages: z.array(uiMessageSchema).min(1),
  attachments: z.array(chatAttachmentSchema).max(2).optional(),
  id: z.string().optional(),
  trigger: z.string().optional(),
  messageId: z.string().optional(),
});

function extractText(message: z.infer<typeof uiMessageSchema>): string {
  return extractUiMessageText(message, true);
}

/**
 * Owner Assistant Chat API Route
 *
 * POST /api/ai/owner-assistant/chat
 * Body: { businessSlug, sessionId?, messages: UIMessage[] }
 * Returns: UI message stream (tool calls/results as structured parts)
 *
 * Requires authentication and business membership. The server owns session
 * identity: the canonical session id is returned in `X-Session-Id`.
 */
export async function POST(request: Request) {
  try {
    // Authenticate user
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json().catch(() => null);
    const parsed = ownerAssistantChatRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            "Invalid request. Business slug and messages are required.",
        },
        { status: 400 },
      );
    }

    const { businessSlug, sessionId, messages, attachments } = parsed.data;

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
        "Images aren't supported in chat yet. Paste the key details as text instead.",
      );
    } catch (error) {
      if (error instanceof ChatAttachmentError) {
        return NextResponse.json(
          {
            error:
              error.code === "image"
                ? "Images aren't supported in chat yet. Paste the key details as text instead."
                : error.message,
          },
          { status: 400 },
        );
      }
      throw error;
    }

    // Validate business access (authoritative source of truth for identity)
    const result = await getBusinessActionContext({ businessSlug });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    const { business, role } = result.businessContext;

    // Burst backstop for this expensive AI endpoint (daily/monthly quotas are
    // enforced in the orchestrator; this per-minute bucket stops scripted
    // bursts from a compromised account).
    const burstAllowed = await assertBusinessActionRateLimit({
      action: "ai-file-import",
      scope: `owner-assistant:${business.id}:${session.user.id}`,
      limit: 20,
      windowMs: 60_000,
    });

    if (!burstAllowed) {
      return NextResponse.json(
        { error: "Too many requests. Slow down and try again shortly." },
        { status: 429 },
      );
    }

    // Business Instructions are owner-authored context shared with both AI
    // surfaces; they live on the business settings cache, not the membership
    // context, so read them here (already normalized and capped at 1k chars).
    const settings = await getBusinessSettingsForBusiness(business.id);

    // Run the owner assistant (handles all business logic, tool execution, streaming)
    const { response, sessionId: canonicalSessionId } = await runOwnerAssistant({
      businessId: business.id,
      businessName: business.name,
      businessSlug: business.slug,
      userId: session.user.id,
      userRole: role,
      plan: business.plan,
      businessTimezone: business.timezone,
      businessInstructions: settings?.aiAgentInstructions,
      sessionId,
      messages: messages.map((message) => ({
        role: message.role as "user" | "assistant",
        content: extractText(message),
      })),
      attachments: rawAttachments,
    });

    // Return streaming response with the canonical session id
    const headers = new Headers(response.headers);
    headers.set("X-Session-Id", canonicalSessionId);
    return new Response(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error("Owner assistant chat API error:", error);

    // Handle specific error types
    if (error instanceof Error) {
      if (error.message.startsWith("QUOTA_EXCEEDED:")) {
        const message = error.message
          .slice("QUOTA_EXCEEDED:".length)
          .trim();
        return NextResponse.json(
          {
            error:
              message ||
              "You've reached your Assistant usage limit for this month.",
            upgradeRequired: true,
          },
          { status: 429 },
        );
      }

      if (error.message.startsWith("ASSISTANT_LIMIT_EXCEEDED:")) {
        const message = error.message
          .slice("ASSISTANT_LIMIT_EXCEEDED:".length)
          .trim();
        return NextResponse.json(
          {
            error:
              message || "You've reached your daily Assistant message limit.",
            upgradeRequired: true,
          },
          { status: 429 },
        );
      }

      if (error.message.startsWith("INPUT_REJECTED:")) {
        const message = error.message.slice("INPUT_REJECTED:".length).trim();
        return NextResponse.json(
          { error: message || "That message can't be processed." },
          { status: 400 },
        );
      }

      if (error.message.startsWith("ATTACHMENT_REJECTED:")) {
        const message = error.message
          .slice("ATTACHMENT_REJECTED:".length)
          .trim();
        return NextResponse.json(
          {
            error:
              message === "IMAGE_NOT_SUPPORTED"
                ? "Images aren't supported in chat yet. Paste the key details as text instead."
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
              message || "You've reached your daily file-upload limit.",
            upgradeRequired: true,
          },
          { status: 429 },
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
              "AI service temporarily unavailable. Please try again in a moment.",
          },
          { status: 503 },
        );
      }
    }

    // Generic error
    return NextResponse.json(
      {
        error:
          "Something went wrong processing your message. Please try again.",
      },
      { status: 500 },
    );
  }
}
