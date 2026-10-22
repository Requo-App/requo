import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { loadAssistantSession } from "@/features/assistant/session-service";

const sessionParamsSchema = z.object({
  sessionId: z.string().trim().min(1).max(128),
});
const sessionQuerySchema = z.object({
  businessSlug: z.string().trim().min(1).max(120),
});

type RouteParams = {
  params: Promise<{ sessionId: string }>;
};

/**
 * Assistant Session Load API Route
 *
 * GET /api/ai/assistant/session/[sessionId]
 * Returns: Session metadata + messages (user, assistant, and tool rows so
 * structured tool results rehydrate after a reload).
 *
 * Read-only: never creates a session. Requires authentication and business
 * membership. Sessions are scoped to businessId + userId.
 */
export async function GET(request: Request, { params }: RouteParams) {
  try {
    // Authenticate user
    const session = await getSession();

    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsedParams = sessionParamsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return NextResponse.json({ error: "Not found." }, { status: 404 });
    }
    const { sessionId } = parsedParams.data;

    // Get business context from URL (session record contains businessId, but we need to validate membership)
    const url = new URL(request.url);
    const parsedQuery = sessionQuerySchema.safeParse(
      Object.fromEntries(url.searchParams.entries()),
    );

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "businessSlug query parameter required" },
        { status: 400 },
      );
    }

    // Validate business access
    const result = await getBusinessActionContext({
      businessSlug: parsedQuery.data.businessSlug,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 403 });
    }

    const { business } = result.businessContext;

    // Load session read-only (enforces businessId + userId scoping;
    // messages come from features/assistant/session-service).
    const sessionData = await loadAssistantSession({
      businessId: business.id,
      userId: session.user.id,
      sessionId,
      messageLimit: 100,
    });

    if (!sessionData) {
      return NextResponse.json(
        { error: "Conversation not found." },
        { status: 404 },
      );
    }

    // Return session data
    return NextResponse.json({
      sessionId: sessionData.sessionId,
      title: sessionData.title,
      messages: sessionData.messages.map((row, index) => ({
        id: row.id ?? `${sessionData.sessionId}-${index}`,
        role: row.role,
        content: row.content,
        toolName: row.toolName ?? null,
        toolCallId: row.toolCallId ?? null,
        createdAt: row.createdAt?.toISOString(),
      })),
      state: sessionData.state,
      createdAt: sessionData.createdAt,
      updatedAt: sessionData.updatedAt,
    });
  } catch (error) {
    console.error("Owner assistant session load error:", error);

    return NextResponse.json(
      { error: "Failed to load session" },
      { status: 500 },
    );
  }
}
