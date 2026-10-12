import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { assertBusinessActionRateLimit } from "@/lib/rate-limit/redis-rate-limiter";
import {
  decodeChatAttachmentsOrResponse,
  mapChatError,
} from "@/lib/ai/chat-route-errors";
import {
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
    const decoded = decodeChatAttachmentsOrResponse(
      attachments,
      "Images aren't supported in chat yet. Paste the key details as text instead.",
    );
    if (!decoded.ok) return decoded.response;
    const rawAttachments = decoded.rawAttachments;

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

    const mapped = mapChatError(
      error,
      "Images aren't supported in chat yet. Paste the key details as text instead.",
    );
    if (mapped) {
      // Preserve the upgrade flag for quota errors.
      if (
        error instanceof Error &&
        (error.message.startsWith("QUOTA_EXCEEDED:") ||
          error.message.startsWith("ASSISTANT_LIMIT_EXCEEDED:") ||
          error.message.startsWith("UPLOAD_LIMIT_EXCEEDED:"))
      ) {
        const body = (await mapped.json().catch(() => ({}))) as {
          error?: string;
        };
        return NextResponse.json(
          { error: body.error, upgradeRequired: true },
          { status: mapped.status },
        );
      }
      return mapped;
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
