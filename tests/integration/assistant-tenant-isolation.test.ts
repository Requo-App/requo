import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/server", () => ({ after: vi.fn() }));

import { createQuoteTool } from "@/features/assistant/tools/create-quote";
import { searchInquiriesTool } from "@/features/assistant/tools/search-inquiries";
import { searchQuotesTool } from "@/features/assistant/tools/search-quotes";
import { sendQuoteTool } from "@/features/assistant/tools/send-quote";
import { updateInquiryStatusTool } from "@/features/assistant/tools/update-inquiry-status";
import type { ToolExecutionContext } from "@/features/assistant/types";
import type { QuoteEditorInput } from "@/features/quotes/schemas";
import { createQuoteForBusiness } from "@/features/quotes/mutations";
import { inquiries, quotes } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

function quoteInput(overrides: Partial<QuoteEditorInput> = {}): QuoteEditorInput {
  return {
    title: "Assistant isolation quote",
    customerName: "Nina Duarte",
    customerEmail: "nina@example.com",
    customerContactMethod: "email",
    customerContactHandle: "nina@example.com",
    validUntil: "2099-12-31",
    discountInCents: 0,
    taxInCents: 0,
    items: [{ id: "line-1", description: "Sign", quantity: 1, unitPriceInCents: 12000 }],
    ...overrides,
  };
}

async function createQuote(businessId: string, userId: string, inquiryId: string, title: string) {
  const created = await createQuoteForBusiness({
    businessId,
    actorUserId: userId,
    currency: "USD",
    inquiryId,
    quote: quoteInput({ title }),
  });

  if (!created) throw new Error("Quote fixture was not created");

  return created;
}

function assistantContext(
  businessId: string,
  userId: string,
  role = "owner",
): ToolExecutionContext {
  return {
    businessId,
    userId,
    userRole: role,
    plan: "pro",
    session: {
      sessionId: `${prefix}_session`,
      businessId,
      userId,
      userRole: role,
      plan: "pro",
      title: null,
      state: { lastMentioned: {} },
      messages: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

async function runTool<TOutput>(
  assistantTool: { execute?: (input: never, options: never) => unknown },
  input: unknown,
  context: ToolExecutionContext,
): Promise<TOutput> {
  if (!assistantTool.execute) {
    throw new Error("Tool does not expose an execute handler.");
  }

  const result = await (
    assistantTool.execute as (input: unknown, options: unknown) => unknown
  )(input, { experimental_context: context });

  if (
    result !== null &&
    typeof result === "object" &&
    Symbol.asyncIterator in result
  ) {
    throw new Error("Unexpected streaming tool result in test.");
  }

  return result as TOutput;
}

/**
 * The owner-facing Assistant tools query and mutate the same tables as the
 * dashboard. Their business id comes from the authenticated tool context, so
 * a tool must never accept a foreign record id from the model.
 */
describe("assistant tool tenant isolation", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("searches only the context business's inquiries and quotes", async () => {
    const ownQuote = await createQuote(
      ids.businessId,
      ids.ownerUserId,
      ids.inquiryId,
      "Own business quote",
    );
    const foreignQuote = await createQuote(
      ids.otherBusinessId,
      ids.outsiderUserId,
      ids.otherInquiryId,
      "Foreign business quote",
    );

    const context = assistantContext(ids.businessId, ids.ownerUserId);

    const inquiryResult = await runTool<{
      type: string;
      data: { results: Array<{ id: string; customerName: string }> };
    }>(searchInquiriesTool, { limit: 20, offset: 0, sortBy: "createdAt", sortOrder: "desc" }, context);

    expect(inquiryResult.type).toBe("inquiry_list");
    const inquiryIds = inquiryResult.data.results.map((row) => row.id);
    expect(inquiryIds).toContain(ids.inquiryId);
    expect(inquiryIds).not.toContain(ids.otherInquiryId);

    const quoteResult = await runTool<{
      type: string;
      data: { results: Array<{ id: string; customerName: string }> };
    }>(searchQuotesTool, { limit: 20, offset: 0, sortBy: "createdAt", sortOrder: "desc" }, context);

    expect(quoteResult.type).toBe("quote_list");
    const quoteIds = quoteResult.data.results.map((row) => row.id);
    expect(quoteIds).toContain(ownQuote.id);
    expect(quoteIds).not.toContain(foreignQuote.id);
  });

  it("rejects foreign record ids in write tools", async () => {
    const foreignQuote = await createQuote(
      ids.otherBusinessId,
      ids.outsiderUserId,
      ids.otherInquiryId,
      "Foreign business quote",
    );

    const context = assistantContext(ids.businessId, ids.ownerUserId);

    const statusResult = await runTool<{ type: string; error?: string }>(
      updateInquiryStatusTool,
      { inquiryId: ids.otherInquiryId, newStatus: "won" },
      context,
    );
    expect(statusResult).toMatchObject({ type: "error", error: "NOT_FOUND" });

    const createResult = await runTool<{ type: string; error?: string }>(
      createQuoteTool,
      {
        inquiryId: ids.otherInquiryId,
        lineItems: [{ description: "Sign", quantity: 1 }],
      },
      context,
    );
    expect(createResult).toMatchObject({ type: "error", error: "NOT_FOUND" });

    const sendResult = await runTool<{ type: string; error?: string }>(
      sendQuoteTool,
      { quoteId: foreignQuote.id, deliveryMethod: "link" },
      context,
    );
    expect(sendResult).toMatchObject({ type: "error", error: "NOT_FOUND" });

    const [foreignInquiry] = await testDb
      .select({ status: inquiries.status })
      .from(inquiries)
      .where(eq(inquiries.id, ids.otherInquiryId))
      .limit(1);
    expect(foreignInquiry.status).toBe("new");

    const foreignQuotes = await testDb
      .select({ id: quotes.id })
      .from(quotes)
      .where(eq(quotes.inquiryId, ids.otherInquiryId));
    expect(foreignQuotes.map((row) => row.id)).toEqual([foreignQuote.id]);
  });
});
