import { connection, NextResponse } from "next/server";
import { z } from "zod";
import { loadSessionByToken } from "@/features/ai-agent/session-service";
import { loadRecentMessages } from "@/features/ai-agent/message-service";

const sessionTokenSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Agent transcript rehydration (customer-owned).
 *
 * GET /api/ai/agent/session?token=<publicToken>
 * Prefer `Authorization: Bearer <token>` (keeps tokens out of URLs/logs);
 * `?token=` remains for backward compatibility. Returns the business name
 * plus the customer's own user/assistant transcript so a reload restores the
 * conversation. Authorized by possession of the token, which only the
 * customer holds — the business gains no visibility from this route.
 */
export async function GET(request: Request) {
  await connection();

  try {
    const url = new URL(request.url);
    const authHeader = request.headers.get("authorization") ?? "";
    const bearer = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : "";
    const token = bearer || (url.searchParams.get("token") ?? "");

    if (!sessionTokenSchema.safeParse(token).success) {
      return NextResponse.json(
        { error: "Invalid session token." },
        { status: 400 },
      );
    }

    const sessionData = await loadSessionByToken(token);
    if (!sessionData) {
      return NextResponse.json(
        { error: "Conversation not found or expired." },
        { status: 404 },
      );
    }

    const rows = await loadRecentMessages(sessionData.id, 50);

    // Server state is authoritative: after a reload the staged proposal comes
    // back alongside the transcript it already returns. Pending renders as an
    // editable card, approved as the submitted receipt. Nothing extra when no
    // proposal is staged (discarded/cleared or never proposed).
    const state = (sessionData.state ?? {}) as {
      proposedInquiry?: {
        id: string;
        values: Record<string, unknown>;
        proposedAt: string;
        status: "pending" | "approved" | "discarded";
        inquiryId?: string;
      } | null;
    };
    const staged = state.proposedInquiry;
    const proposedInquiry =
      staged && (staged.status === "pending" || staged.status === "approved")
        ? staged
        : null;

    return NextResponse.json(
      {
        businessName: sessionData.business.name,
        status: sessionData.status,
        messages: rows
          .filter((row) => row.role === "user" || row.role === "assistant")
          .map((row) => ({
            id: row.id,
            role: row.role,
            content: row.content,
            createdAt: row.createdAt.toISOString(),
          })),
        proposedInquiry,
      },
      {
        headers: {
          "cache-control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("Agent session load error:", error);
    return NextResponse.json(
      { error: "Could not load the conversation." },
      { status: 500 },
    );
  }
}
