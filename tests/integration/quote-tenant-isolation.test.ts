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

import type { QuoteEditorInput } from "@/features/quotes/schemas";
import {
  bulkArchiveQuotesForBusiness,
  createQuoteForBusiness,
  markQuoteSentForBusiness,
  stopAutoFollowUpForQuote,
  updateQuoteForBusiness,
} from "@/features/quotes/mutations";
import {
  getQuoteDetailForBusiness,
  getQuoteExportRowsForBusiness,
  getQuoteWithItemsForBusiness,
} from "@/features/quotes/queries";
import { quotes } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "test_quote_isolation";
let ids: WorkflowFixtureIds;

function quoteInput(overrides: Partial<QuoteEditorInput> = {}): QuoteEditorInput {
  return {
    title: "Isolation test package",
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

/**
 * The quote data layer is business-scoped. Every read and write must filter
 * on `businessId` — the app talks to Postgres directly and bypasses the
 * database's row-level security, so the server-side predicate is the only
 * thing keeping tenants apart.
 */
describe("quote tenant isolation", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("does not read another business's quote", async () => {
    const created = await createQuoteForBusiness({
      businessId: ids.businessId,
      actorUserId: ids.ownerUserId,
      currency: "USD",
      inquiryId: ids.inquiryId,
      quote: quoteInput(),
    });

    expect(
      await getQuoteDetailForBusiness({
        businessId: ids.otherBusinessId,
        quoteId: created!.id,
      }),
    ).toBeNull();

    expect(
      await getQuoteWithItemsForBusiness({
        businessId: ids.otherBusinessId,
        quoteId: created!.id,
      }),
    ).toBeNull();
  });

  it("does not export another business's quotes", async () => {
    await createQuoteForBusiness({
      businessId: ids.businessId,
      actorUserId: ids.ownerUserId,
      currency: "USD",
      inquiryId: ids.inquiryId,
      quote: quoteInput(),
    });
    await createQuoteForBusiness({
      businessId: ids.otherBusinessId,
      actorUserId: ids.outsiderUserId,
      currency: "USD",
      inquiryId: ids.otherInquiryId,
      quote: quoteInput({ title: "Foreign quote" }),
    });

    const rows = await getQuoteExportRowsForBusiness({
      businessId: ids.businessId,
      filters: { view: "active", status: "all", sort: "newest" },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]?.title).toBe("Isolation test package");
  });

  it("does not update or send another business's quote", async () => {
    const created = await createQuoteForBusiness({
      businessId: ids.businessId,
      actorUserId: ids.ownerUserId,
      currency: "USD",
      inquiryId: ids.inquiryId,
      quote: quoteInput(),
    });

    const updateResult = await updateQuoteForBusiness({
      businessId: ids.otherBusinessId,
      quoteId: created!.id,
      actorUserId: ids.outsiderUserId,
      quote: quoteInput({ title: "Hijacked" }),
    });

    expect(updateResult).toBeNull();

    const sendResult = await markQuoteSentForBusiness({
      businessId: ids.otherBusinessId,
      quoteId: created!.id,
      actorUserId: ids.outsiderUserId,
      sendMethod: "manual",
    });

    expect(sendResult).toBeNull();

    const [stored] = await testDb
      .select()
      .from(quotes)
      .where(eq(quotes.id, created!.id))
      .limit(1);
    expect(stored.title).toBe("Isolation test package");
    expect(stored.status).toBe("draft");
  });

  it("does not stop another business's auto follow-up", async () => {
    const created = await createQuoteForBusiness({
      businessId: ids.businessId,
      actorUserId: ids.ownerUserId,
      currency: "USD",
      inquiryId: ids.inquiryId,
      quote: quoteInput(),
    });

    await stopAutoFollowUpForQuote({
      businessId: ids.otherBusinessId,
      quoteId: created!.id,
    });

    const [stored] = await testDb
      .select()
      .from(quotes)
      .where(eq(quotes.id, created!.id))
      .limit(1);
    expect(stored.autoFollowUpStoppedAt).toBeNull();
  });

  it("does not archive another business's quote in bulk", async () => {
    const created = await createQuoteForBusiness({
      businessId: ids.businessId,
      actorUserId: ids.ownerUserId,
      currency: "USD",
      inquiryId: ids.inquiryId,
      quote: quoteInput(),
    });

    const result = await bulkArchiveQuotesForBusiness({
      businessId: ids.otherBusinessId,
      quoteIds: [created!.id],
      actorUserId: ids.outsiderUserId,
    });

    expect(result.affected).toBe(0);

    const [stored] = await testDb
      .select()
      .from(quotes)
      .where(eq(quotes.id, created!.id))
      .limit(1);
    expect(stored.archivedAt).toBeNull();
  });
});
