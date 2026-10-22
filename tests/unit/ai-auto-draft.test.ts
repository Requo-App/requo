import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ inquiry: vi.fn(), createQuote: vi.fn() }));
vi.mock("@/lib/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: mocks.inquiry }) }) }) },
}));
vi.mock("@/features/quotes/mutations", () => ({ createQuoteForBusiness: mocks.createQuote }));

import { createAutoDraftQuote } from "@/features/quote-drafting/auto-draft";
import type { AiQuoteDraft } from "@/features/quote-drafting/types";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.inquiry.mockResolvedValue([{
    id: "inquiry-1", customerName: "Jane Doe", customerEmail: "jane@example.com",
    customerContactMethod: "email", customerContactHandle: "jane@example.com", details: "Install a sign",
  }]);
  mocks.createQuote.mockResolvedValue({ id: "quote-1" });
});

it.each([12345, 99, 10000])("persists a priced AI draft without rescaling its %i cents", async (price) => {
  const draft: AiQuoteDraft = {
    title: "Sign installation", notes: null, missingInfo: [], clarificationMessage: null,
    model: "model", provider: "groq", itemsNeedingReview: 0, readiness: "ready",
    aiGenerationId: `qgen_${"a".repeat(32)}`, knowledgeCitations: [],
    items: [{
      name: "Installation", description: "Install a sign", quantity: 2,
      unitPriceInCents: price, pricingSource: "pricing_library_block", pricingSourceLabel: "Installation",
      confidence: "high", reviewStatus: "matched", aiProductStatus: "verified",
      aiEvidence: null, aiKnowledgeCitations: [], reason: "Library price",
    }],
  };

  expect(await createAutoDraftQuote({
    businessId: "business-1", inquiryId: "inquiry-1", actorUserId: "owner-1", currency: "USD", draft,
  })).toEqual({ quoteId: "quote-1" });
  expect(mocks.createQuote).toHaveBeenCalledWith(expect.objectContaining({
    businessId: "business-1", inquiryId: "inquiry-1",
    quote: expect.objectContaining({ items: [expect.objectContaining({ unitPriceInCents: price, quantity: 2 })] }),
  }));
});
