import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

import {
  markQuoteDiscussionRead,
  sendBusinessQuoteDiscussionMessage,
  sendPublicQuoteDiscussionMessage,
} from "@/features/quote-discussions/mutations";
import {
  getPublicQuoteDiscussionByToken,
  getQuoteDiscussionDetailForBusiness,
  getQuoteDiscussionForQuoteForBusiness,
  getQuoteDiscussionInboxForBusiness,
} from "@/features/quote-discussions/queries";
import {
  createQuoteForBusiness,
  markQuoteSentForBusiness,
  respondToPublicQuoteByToken,
} from "@/features/quotes/mutations";
import type { QuoteEditorInput } from "@/features/quotes/schemas";
import {
  businessNotifications,
  quoteDiscussionMessages,
  quoteDiscussionReads,
  quoteDiscussions,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "test_quote_discussions";
let ids: WorkflowFixtureIds;

function quoteInput(overrides: Partial<QuoteEditorInput> = {}): QuoteEditorInput {
  return {
    title: "Discussion test quote",
    customerName: "Maria Santos",
    customerEmail: "maria@example.com",
    customerContactMethod: "email",
    customerContactHandle: "maria@example.com",
    notes: "Includes install.",
    validUntil: "2099-12-31",
    discountInCents: 0,
    taxInCents: 0,
    items: [
      {
        id: "line-design",
        description: "Design",
        quantity: 1,
        unitPriceInCents: 150000,
      },
    ],
    ...overrides,
  };
}

async function createSentQuote({
  businessId = ids.businessId,
  actorUserId = ids.ownerUserId,
  inquiryId = ids.inquiryId,
  overrides = {},
}: {
  businessId?: string;
  actorUserId?: string;
  inquiryId?: string | null;
  overrides?: Partial<QuoteEditorInput>;
} = {}) {
  const created = await createQuoteForBusiness({
    businessId,
    actorUserId,
    currency: "USD",
    inquiryId,
    quote: quoteInput(overrides),
  });

  if (!created) {
    throw new Error("Quote fixture was not created.");
  }

  const sent = await markQuoteSentForBusiness({
    businessId,
    quoteId: created.id,
    actorUserId,
    sendMethod: "manual",
  });

  if (!sent?.publicToken) {
    throw new Error("Quote fixture was not sent.");
  }

  return { quoteId: created.id, token: sent.publicToken };
}

describe("quote discussions", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("lazily creates exactly one thread and reuses it for later messages", async () => {
    const sent = await createSentQuote();

    expect(
      await getQuoteDiscussionForQuoteForBusiness({
        businessId: ids.businessId,
        quoteId: sent.quoteId,
        userId: ids.ownerUserId,
      }),
    ).toBeNull();

    const first = await sendPublicQuoteDiscussionMessage({
      token: sent.token,
      senderName: "  Maria   Santos ",
      body: "  Can we split the deposit?  ",
      guestSessionHash: "session-hash-a",
    });

    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error("Expected the first message to send.");

    const second = await sendPublicQuoteDiscussionMessage({
      token: sent.token,
      senderName: "Maria Santos",
      body: "And when would install start?",
      guestSessionHash: "session-hash-a",
    });

    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("Expected the second message to send.");
    expect(second.discussionId).toBe(first.discussionId);

    const discussions = await testDb
      .select()
      .from(quoteDiscussions)
      .where(eq(quoteDiscussions.quoteId, sent.quoteId));
    expect(discussions).toHaveLength(1);

    const messages = await testDb
      .select()
      .from(quoteDiscussionMessages)
      .where(eq(quoteDiscussionMessages.discussionId, first.discussionId))
      .orderBy(quoteDiscussionMessages.createdAt);

    expect(messages).toHaveLength(2);
    expect(messages.map((message) => message.senderName)).toEqual([
      "Maria Santos",
      "Maria Santos",
    ]);
    expect(messages.map((message) => message.body).sort()).toEqual(
      ["Can we split the deposit?", "And when would install start?"].sort(),
    );
    expect(
      messages.every((message) => message.guestSessionHash === "session-hash-a"),
    ).toBe(true);
    expect(messages.every((message) => message.senderUserId === null)).toBe(
      true,
    );

    const notifications = await testDb
      .select()
      .from(businessNotifications)
      .where(
        and(
          eq(businessNotifications.businessId, ids.businessId),
          eq(businessNotifications.quoteId, sent.quoteId),
          eq(businessNotifications.type, "quote_discussion_message"),
        ),
      );

    expect(notifications).toHaveLength(2);
    expect(notifications[0]?.metadata).toEqual(
      expect.objectContaining({ discussionId: first.discussionId }),
    );
  }, 20_000);

  it("does not create duplicate threads under concurrent first messages", async () => {
    const sent = await createSentQuote();

    const results = await Promise.all([
      sendPublicQuoteDiscussionMessage({
        token: sent.token,
        senderName: "Maria Santos",
        body: "First concurrent message",
        guestSessionHash: null,
      }),
      sendPublicQuoteDiscussionMessage({
        token: sent.token,
        senderName: "Maria Santos",
        body: "Second concurrent message",
        guestSessionHash: null,
      }),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    const discussionIds = new Set(
      results.map((result) => (result.ok ? result.discussionId : null)),
    );
    expect(discussionIds.size).toBe(1);

    const discussions = await testDb
      .select()
      .from(quoteDiscussions)
      .where(eq(quoteDiscussions.quoteId, sent.quoteId));
    expect(discussions).toHaveLength(1);

    const messages = await testDb
      .select()
      .from(quoteDiscussionMessages)
      .where(eq(quoteDiscussionMessages.discussionId, discussions[0]!.id));
    expect(messages).toHaveLength(2);
  }, 20_000);

  it("denies unknown tokens and closes silently after a terminal quote", async () => {
    const unknown = await sendPublicQuoteDiscussionMessage({
      token: "this-token-does-not-exist",
      senderName: "Maria Santos",
      body: "Hello?",
      guestSessionHash: null,
    });
    expect(unknown).toEqual({ ok: false, reason: "not_found" });

    const sent = await createSentQuote();
    const sentMessage = await sendPublicQuoteDiscussionMessage({
      token: sent.token,
      senderName: "Maria Santos",
      body: "Before acceptance",
      guestSessionHash: null,
    });
    expect(sentMessage.ok).toBe(true);
    if (!sentMessage.ok) throw new Error("Expected the message to send.");

    await respondToPublicQuoteByToken({
      token: sent.token,
      response: "accepted",
      signerName: "Maria Santos",
      confirmed: true,
      expectedVersion: 1,
    });

    const afterAcceptance = await sendPublicQuoteDiscussionMessage({
      token: sent.token,
      senderName: "Maria Santos",
      body: "After acceptance",
      guestSessionHash: null,
    });
    expect(afterAcceptance).toEqual({ ok: false, reason: "closed" });

    const reply = await sendBusinessQuoteDiscussionMessage({
      businessId: ids.businessId,
      discussionId: sentMessage.discussionId,
      actorUserId: ids.ownerUserId,
      senderName: "Workflow Owner",
      body: "Reply after closure",
    });
    expect(reply).toEqual({ ok: false, reason: "closed" });

    const [discussion] = await testDb
      .select()
      .from(quoteDiscussions)
      .where(eq(quoteDiscussions.id, sentMessage.discussionId));
    expect(discussion?.archivedAt).not.toBeNull();

    const publicView = await getPublicQuoteDiscussionByToken(sent.token);
    expect(publicView?.closed).toBe(true);
    expect(publicView?.messages).toHaveLength(1);
  }, 20_000);

  it("scopes inbox reads and read state by business and user", async () => {
    const quoteA = await createSentQuote();
    const quoteB = await createSentQuote({
      businessId: ids.otherBusinessId,
      actorUserId: ids.outsiderUserId,
      inquiryId: ids.otherInquiryId,
      overrides: { customerName: "Other Customer" },
    });
    const messageA = await sendPublicQuoteDiscussionMessage({
      token: quoteA.token,
      senderName: "Maria Santos",
      body: "Business A question",
      guestSessionHash: null,
    });
    const messageB = await sendPublicQuoteDiscussionMessage({
      token: quoteB.token,
      senderName: "Other Customer",
      body: "Business B question",
      guestSessionHash: null,
    });
    expect(messageA.ok && messageB.ok).toBe(true);
    if (!messageA.ok || !messageB.ok) {
      throw new Error("Expected both discussion messages to send.");
    }

    const inboxA = await getQuoteDiscussionInboxForBusiness({
      businessId: ids.businessId,
      userId: ids.ownerUserId,
      filters: { view: "needs_reply", page: 1 },
    });
    expect(inboxA.items.map((item) => item.id)).toEqual([messageA.discussionId]);

    const inboxB = await getQuoteDiscussionInboxForBusiness({
      businessId: ids.otherBusinessId,
      userId: ids.outsiderUserId,
      filters: { view: "needs_reply", page: 1 },
    });
    expect(inboxB.items.map((item) => item.id)).toEqual([messageB.discussionId]);

    expect(
      await getQuoteDiscussionDetailForBusiness({
        businessId: ids.businessId,
        discussionId: messageB.discussionId,
        userId: ids.ownerUserId,
      }),
    ).toBeNull();

    await markQuoteDiscussionRead({
      businessId: ids.businessId,
      discussionId: messageA.discussionId,
      userId: ids.ownerUserId,
      readThrough: new Date(),
    });

    const ownerInbox = await getQuoteDiscussionInboxForBusiness({
      businessId: ids.businessId,
      userId: ids.ownerUserId,
      filters: { view: "needs_reply", page: 1 },
    });
    expect(ownerInbox.items[0]?.unreadCount).toBe(0);

    const managerInbox = await getQuoteDiscussionInboxForBusiness({
      businessId: ids.businessId,
      userId: ids.managerUserId,
      filters: { view: "needs_reply", page: 1 },
    });
    expect(managerInbox.items[0]?.unreadCount).toBe(1);
  }, 25_000);

  it("rejects a read marker for a discussion in another business", async () => {
    const quoteB = await createSentQuote({
      businessId: ids.otherBusinessId,
      actorUserId: ids.outsiderUserId,
      inquiryId: ids.otherInquiryId,
      overrides: { customerName: "Other Customer" },
    });
    const sentB = await sendPublicQuoteDiscussionMessage({
      token: quoteB.token,
      senderName: "Other Customer",
      body: "Business B question",
      guestSessionHash: null,
    });
    if (!sentB.ok) throw new Error("Expected the message to send.");

    await expect(
      markQuoteDiscussionRead({
        businessId: ids.businessId,
        discussionId: sentB.discussionId,
        userId: ids.ownerUserId,
        readThrough: new Date(),
      }),
    ).resolves.toEqual({ ok: false });

    // The rejected write must not have created a read row under any business.
    const readRows = await testDb
      .select({ businessId: quoteDiscussionReads.businessId })
      .from(quoteDiscussionReads)
      .where(eq(quoteDiscussionReads.discussionId, sentB.discussionId));
    expect(readRows).toEqual([]);

    const inboxB = await getQuoteDiscussionInboxForBusiness({
      businessId: ids.otherBusinessId,
      userId: ids.outsiderUserId,
      filters: { view: "needs_reply", page: 1 },
    });
    expect(
      inboxB.items.find((item) => item.id === sentB.discussionId)?.unreadCount,
    ).toBe(1);
  }, 25_000);

  it("shares one thread and one state across the inbox and quote detail", async () => {
    const sent = await createSentQuote();
    const customerMessage = await sendPublicQuoteDiscussionMessage({
      token: sent.token,
      senderName: "Maria Santos",
      body: "Question from the public page",
      guestSessionHash: null,
    });
    if (!customerMessage.ok) throw new Error("Expected the message to send.");

    const quoteSummary = await getQuoteDiscussionForQuoteForBusiness({
      businessId: ids.businessId,
      quoteId: sent.quoteId,
      userId: ids.ownerUserId,
    });
    expect(quoteSummary).toEqual(
      expect.objectContaining({
        id: customerMessage.discussionId,
        state: "needs_reply",
        unreadCount: 1,
      }),
    );

    const reply = await sendBusinessQuoteDiscussionMessage({
      businessId: ids.businessId,
      discussionId: customerMessage.discussionId,
      actorUserId: ids.ownerUserId,
      senderName: "Workflow Owner",
      body: "Reply from the inbox",
    });
    expect(reply.ok).toBe(true);

    const inbox = await getQuoteDiscussionInboxForBusiness({
      businessId: ids.businessId,
      userId: ids.ownerUserId,
      filters: { view: "waiting_for_customer", page: 1 },
    });
    expect(inbox.items.map((item) => item.id)).toEqual([
      customerMessage.discussionId,
    ]);
    expect(inbox.items[0]?.state).toBe("waiting_for_customer");

    const detail = await getQuoteDiscussionDetailForBusiness({
      businessId: ids.businessId,
      discussionId: customerMessage.discussionId,
      userId: ids.ownerUserId,
    });
    expect(detail?.messages.map((message) => message.body)).toEqual([
      "Question from the public page",
      "Reply from the inbox",
    ]);

    const publicView = await getPublicQuoteDiscussionByToken(sent.token);
    expect(publicView?.messages.map((message) => message.body)).toContain(
      "Reply from the inbox",
    );

    await respondToPublicQuoteByToken({
      token: sent.token,
      response: "rejected",
      expectedVersion: 1,
    });

    const archivedInbox = await getQuoteDiscussionInboxForBusiness({
      businessId: ids.businessId,
      userId: ids.ownerUserId,
      filters: { view: "archived", page: 1 },
    });
    expect(archivedInbox.items.map((item) => item.id)).toEqual([
      customerMessage.discussionId,
    ]);
    expect(archivedInbox.items[0]?.state).toBe("archived");

    const archivedSummary = await getQuoteDiscussionForQuoteForBusiness({
      businessId: ids.businessId,
      quoteId: sent.quoteId,
      userId: ids.ownerUserId,
    });
    expect(archivedSummary?.state).toBe("archived");
  }, 25_000);
});
