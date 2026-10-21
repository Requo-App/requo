import { connection, NextResponse } from "next/server";
import { z } from "zod";

import {
  getBusinessKnowledgeSummary,
  listBusinessKnowledgeFiles,
  listBusinessMemories,
} from "@/features/memory/queries";
import { getBusinessActionContext } from "@/lib/db/business-access";

const querySchema = z.object({
  businessSlug: z.string().min(1).max(120),
});

/**
 * The knowledge base for one business.
 *
 * The knowledge tab used to be rendered with the rest of the assistant
 * settings page, so its three queries ran on every visit — even for owners
 * who only ever looked at the Assistant tab. The tab now loads its data when
 * it is opened.
 *
 * Read-only: every write goes through the bound server actions.
 */
export async function GET(request: Request) {
  // The response depends on the caller's membership, so it has to wait for a
  // real request rather than being prerendered.
  await connection();

  try {
    const url = new URL(request.url);
    const parsed = querySchema.safeParse({
      businessSlug: url.searchParams.get("businessSlug") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request." },
        { status: 400 },
      );
    }

    const access = await getBusinessActionContext({
      businessSlug: parsed.data.businessSlug,
      minimumRole: "staff",
      requireActiveBusiness: true,
      unauthorizedMessage: "You do not have access to that business.",
    });

    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: 403 });
    }

    const businessId = access.businessContext.business.id;
    const plan = access.businessContext.business.plan;

    const [memories, knowledgeFiles, summary] = await Promise.all([
      listBusinessMemories(businessId),
      listBusinessKnowledgeFiles(businessId),
      getBusinessKnowledgeSummary(businessId, plan),
    ]);

    return NextResponse.json(
      {
        memories,
        knowledgeFiles,
        sourceCount: summary.sourceCount,
        sourceLimit: summary.sourceLimit,
      },
      {
        headers: {
          "cache-control": "private, no-store, max-age=0",
        },
      },
    );
  } catch (error) {
    console.error("Knowledge load error:", error);

    return NextResponse.json(
      { error: "Could not load the knowledge base." },
      { status: 500 },
    );
  }
}
