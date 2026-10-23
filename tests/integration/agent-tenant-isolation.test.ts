import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();

  return {
    ...actual,
    cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
  };
});

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("@/features/knowledge/retrieval", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/features/knowledge/retrieval")>();

  return {
    ...actual,
    retrieveBusinessKnowledge: vi.fn(),
  };
});

import { services } from "@/lib/db/schema";
import { businessSubscriptions } from "@/lib/db/schema/subscriptions";
import { getPublicAgentBusiness } from "@/features/agent/queries";
import { loadSessionByToken } from "@/features/agent/session-service";
import { retrieveBusinessKnowledge } from "@/features/knowledge/retrieval";
import {
  UNTRUSTED_KNOWLEDGE_CLOSE,
  UNTRUSTED_KNOWLEDGE_OPEN,
} from "@/features/knowledge/retrieval";
import { getBusinessInfoTool } from "@/features/agent/tools/get-business-info";
import { getServicesTool } from "@/features/agent/tools/get-services";
import { searchKnowledgeTool } from "@/features/agent/tools/search-knowledge";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  createActiveAgentSession,
  createAgentToolContext,
  runAgentTool,
} from "@/tests/support/agent";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "test_ai_agent_isolation";
let ids: WorkflowFixtureIds;

describe("agent tenant isolation", () => {
  beforeAll(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("resolves sessions to their own business context only", async () => {
    const businessA = await createActiveAgentSession(ids.businessId);
    const businessB = await createActiveAgentSession(ids.otherBusinessId);

    const a = await loadSessionByToken(businessA.publicToken);
    const b = await loadSessionByToken(businessB.publicToken);

    expect(a?.businessId).toBe(ids.businessId);
    expect(a?.business.name).toBe("Workflow Business");
    expect(b?.businessId).toBe(ids.otherBusinessId);
    expect(b?.business.name).toBe("Other Workflow Business");

    // A token from one business must never resolve to another business's session.
    expect(businessA.publicToken).not.toBe(businessB.publicToken);
    expect(a?.business.plan).toBe("pro");
    expect(b?.business.plan).toBe("free");
  });

  it("resolves the public agent plan from the subscription, not the denormalized cache", async () => {
    const now = new Date();

    await testDb.insert(businessSubscriptions).values({
      id: `${prefix}_past_due_subscription`,
      businessId: ids.businessId,
      plan: "pro",
      status: "past_due",
      billingProvider: "polar",
      billingCurrency: "USD",
      currentPeriodStart: new Date(now.getTime() - 60_000),
      // Grace is seven days past the period end; this is well outside it.
      currentPeriodEnd: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      createdAt: now,
      updatedAt: now,
    });

    try {
      const business = await getPublicAgentBusiness(ids.businessSlug);

      // `businesses.plan` is still "pro"; the effective plan is free.
      expect(business?.plan).toBe("free");
    } finally {
      await testDb
        .delete(businessSubscriptions)
        .where(eq(businessSubscriptions.businessId, ids.businessId));
    }
  });

  it("returns only public business info from the session's own business", async () => {
    const sessionA = await createActiveAgentSession(ids.businessId);
    const contextA = await createAgentToolContext(sessionA.publicToken);

    const result = await runAgentTool<{
      name: string;
      description: string | null;
      contact: string | null;
    }>(
      getBusinessInfoTool,
      {},
      { experimental_context: contextA },
    );

    expect(result).toEqual({
      name: "Workflow Business",
      description: null,
      contact: null,
    });
    // No internal fields may leak (owner, plan, enabled flags, etc.).
    expect(Object.keys(result).sort()).toEqual(["contact", "description", "name"]);
  });

  it("returns no services when services are disabled for public inquiry", async () => {
    await testDb
      .update(services)
      .set({ publicInquiryEnabled: false })
      .where(eq(services.businessId, ids.businessId));

    const session = await createActiveAgentSession(ids.businessId);
    const context = await createAgentToolContext(session.publicToken);

    const result = await runAgentTool<{ services: Array<{ value: string; label: string }> }>(
      getServicesTool,
      {},
      { experimental_context: context },
    );

    expect(result.services).toEqual([]);
  });

  it("returns live services scoped to the session business only", async () => {
    await testDb
      .update(services)
      .set({ publicInquiryEnabled: true })
      .where(eq(services.businessId, ids.businessId));

    const session = await createActiveAgentSession(ids.businessId);
    const context = await createAgentToolContext(session.publicToken);

    const result = await runAgentTool<{ services: Array<{ value: string; label: string }> }>(
      getServicesTool,
      {},
      { experimental_context: context },
    );

    expect(result.services.map((s) => s.label)).toEqual(["Workflow Service"]);
    expect(result.services.map((s) => s.value)).toEqual(["workflow-form"]);

    // The other business never sees business A's services.
    const otherSession = await createActiveAgentSession(ids.otherBusinessId);
    const otherContext = await createAgentToolContext(otherSession.publicToken);
    const otherResult = await runAgentTool<{ services: Array<{ value: string; label: string }> }>(
      getServicesTool,
      {},
      { experimental_context: otherContext },
    );

    expect(otherResult.services.map((s) => s.label)).toEqual(["Other Workflow Service"]);
  });

  it("forwards the session business id to the knowledge retriever", async () => {
    const sessionA = await createActiveAgentSession(ids.businessId);
    const contextA = await createAgentToolContext(sessionA.publicToken);

    vi.mocked(retrieveBusinessKnowledge).mockResolvedValueOnce({
      evidence: [
        {
          sourceType: "manual_entry",
          sourceId: "mem_1",
          chunkId: "chunk_1",
          title: "Pricing guide",
          content: "Signage starts at $400.",
          score: 0.92,
          confidence: "high",
        },
      ],
      usedRag: true,
    });

    const result = await runAgentTool<{
      found: boolean;
      results?: Array<{ content: string; relevance: number; source: string }>;
      message?: string;
    }>(
      searchKnowledgeTool,
      { query: "How much is signage?" },
      { experimental_context: contextA },
    );

    expect(retrieveBusinessKnowledge).toHaveBeenCalledWith({
      businessId: ids.businessId,
      queryText: "How much is signage?",
      topK: 5,
      tokenBudget: 1500,
    });
    expect(result).toEqual({
      found: true,
      results: [
        {
          content: [
            UNTRUSTED_KNOWLEDGE_OPEN,
            "Signage starts at $400.",
            UNTRUSTED_KNOWLEDGE_CLOSE,
          ].join("\n"),
          relevance: 0.92,
          source: "Pricing guide",
        },
      ],
    });

    const sessionB = await createActiveAgentSession(ids.otherBusinessId);
    const contextB = await createAgentToolContext(sessionB.publicToken);

    vi.mocked(retrieveBusinessKnowledge).mockResolvedValueOnce({
      evidence: [],
      usedRag: false,
    });

    const otherResult = await runAgentTool<{
      found: boolean;
      message?: string;
    }>(
      searchKnowledgeTool,
      { query: "How much is signage?" },
      { experimental_context: contextB },
    );

    expect(retrieveBusinessKnowledge).toHaveBeenLastCalledWith({
      businessId: ids.otherBusinessId,
      queryText: "How much is signage?",
      topK: 5,
      tokenBudget: 1500,
    });
    expect(otherResult).toEqual({
      found: false,
      message: "No relevant information found in the business knowledge base.",
    });
  });

  it("degrades gracefully when the knowledge retriever fails", async () => {
    const session = await createActiveAgentSession(ids.businessId);
    const context = await createAgentToolContext(session.publicToken);

    vi.mocked(retrieveBusinessKnowledge).mockRejectedValueOnce(new Error("embeddings down"));

    const result = await runAgentTool<{ found: boolean; message: string }>(
      searchKnowledgeTool,
      { query: "anything" },
      { experimental_context: context },
    );

    expect(result).toEqual({
      found: false,
      message: "Failed to search knowledge base. Please try asking in a different way.",
    });
  });
});
