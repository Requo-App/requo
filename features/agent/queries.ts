import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { cache } from "react";

import { getOperationalBusinessCondition } from "@/features/businesses/lifecycle";
import { db } from "@/lib/db/client";
import {
  agentSessions,
  agentMessages,
  businesses,
  services,
  inquiries,
} from "@/lib/db/schema";
import type { PlanTier } from "@/lib/plans/plans";

export type PublicAgentBusiness = {
  id: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  /** Public logo endpoint, cache-busted by the business's last update. */
  logoUrl: string | null;
  agentEnabled: boolean;
  plan: PlanTier;
};

/**
 * Load the minimum business fields needed for the public agent chat page.
 * Returns null when the business doesn't exist, is not operational (archived,
 * locked, or in the trash), or the agent is disabled.
 */
export const getPublicAgentBusiness = cache(
  async (slug: string): Promise<PublicAgentBusiness | null> => {
    const [row] = await db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        shortDescription: businesses.shortDescription,
        logoStoragePath: businesses.logoStoragePath,
        updatedAt: businesses.updatedAt,
        agentEnabled: businesses.agentEnabled,
        plan: businesses.plan,
      })
      .from(businesses)
      .where(and(eq(businesses.slug, slug), getOperationalBusinessCondition()))
      .limit(1);

    if (!row) return null;

    const { logoStoragePath, updatedAt, ...business } = row;
    return {
      ...business,
      logoUrl: logoStoragePath
        ? `/api/public/businesses/${row.slug}/logo?v=${updatedAt.getTime()}`
        : null,
    };
  },
);

export type PublicAgentStarterService = {
  name: string;
  slug: string;
};

/**
 * Active public services for starter recommendations. Public data only:
 * non-archived services with public inquiry enabled, default first.
 */
export const getPublicAgentStarterServices = cache(
  async (businessId: string): Promise<PublicAgentStarterService[]> => {
    const rows = await db
      .select({
        name: services.name,
        slug: services.slug,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          isNull(services.archivedAt),
          eq(services.publicInquiryEnabled, true),
        ),
      )
      .orderBy(
        desc(services.isDefault),
        asc(services.name),
      )
      .limit(4);
    return rows;
  },
);

/**
 * Starter prompts derived from what the business actually offers: its
 * public services, plus a services question answered from its profile.
 */
export function buildAgentRecommendations({
  businessName,
  services,
}: {
  businessName: string;
  services: PublicAgentStarterService[];
}): string[] {
  const recommendations = [`What services does ${businessName} offer?`];
  for (const service of services.slice(0, 3)) {
    recommendations.push(`Start a ${service.name} request`);
  }
  if (recommendations.length === 1) {
    recommendations.push("How do I get a quote?");
  }
  return recommendations.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Inquiry-scoped transcript
// ---------------------------------------------------------------------------
//
// Privacy boundary: an Agent Session becomes visible to the business only
// through an Inquiry it produced. There is no browse or search over Agent
// Sessions — the transcript below is the only path, attached read-only to
// the Inquiry it produced, and scoped to that Inquiry's business.

export type AgentTranscriptMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
};

/**
 * Load the originating public-chat transcript for an inquiry, if the inquiry
 * was produced by the Agent (created or escalated). Business-scoped through
 * the inquiry itself. Returns null when there is no linked session.
 */
export const getAgentTranscriptForInquiry = cache(
  async (
    businessId: string,
    inquiryId: string,
  ): Promise<AgentTranscriptMessage[] | null> => {
    const [inquiry] = await db
      .select({ id: inquiries.id })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.id, inquiryId),
          eq(inquiries.businessId, businessId),
        ),
      )
      .limit(1);

    if (!inquiry) return null;

    // A session can produce more than one inquiry. The session row keeps the
    // newest one in `inquiry_id` and every one it produced in
    // `metadata.createdInquiryIds`, so an earlier inquiry must still resolve
    // to its transcript.
    const [session] = await db
      .select({ id: agentSessions.id })
      .from(agentSessions)
      .where(
        and(
          eq(agentSessions.businessId, businessId),
          or(
            eq(agentSessions.inquiryId, inquiryId),
            sql`${agentSessions.metadata} -> 'createdInquiryIds' @> ${JSON.stringify(
              [inquiryId],
            )}::jsonb`,
          ),
        ),
      )
      .limit(1);

    if (!session) return null;

    const rows = await db
      .select({
        id: agentMessages.id,
        role: agentMessages.role,
        content: agentMessages.content,
        createdAt: agentMessages.createdAt,
      })
      .from(agentMessages)
      .where(
        and(
          eq(agentMessages.sessionId, session.id),
          inArray(agentMessages.role, ["user", "assistant"]),
        ),
      )
      // Newest first, so the limit keeps the turns that carry the inquiry
      // details rather than the oldest ones. The array is reversed below.
      .orderBy(desc(agentMessages.createdAt))
      .limit(100);

    return rows
      .reverse()
      .map((row) => ({
        id: row.id,
        role: row.role as "user" | "assistant",
        content: row.content,
        createdAt: row.createdAt,
      }));
  },
);
