import { describe, expect, it } from "vitest";

import { renderQuoteDiscussionReplyEmail } from "@/emails/templates/quote-discussion-reply";
import { getQuoteDiscussionGuestSessionHash } from "@/features/quote-discussions/guest-session";
import {
  quoteDiscussionInboxFiltersSchema,
  quoteDiscussionMessageSchema,
} from "@/features/quote-discussions/schemas";
import type { QuoteDiscussionMessageView } from "@/features/quote-discussions/types";
import {
  deriveQuoteDiscussionState,
  getLatestCustomerMessageName,
  getQuoteDiscussionPreview,
  isQuoteDiscussionOpen,
  isTerminalQuoteStatus,
  validateQuoteDiscussionMessageBody,
  validateQuoteDiscussionSenderName,
} from "@/features/quote-discussions/utils";
import { hashOpaqueToken } from "@/lib/security/tokens";

describe("quote discussion lifecycle", () => {
  it("keeps a sent quote open until its validity date", () => {
    expect(
      isQuoteDiscussionOpen({
        status: "sent",
        validUntil: "2026-06-01",
        today: new Date("2026-05-01T12:00:00Z"),
      }),
    ).toBe(true);
    expect(
      isQuoteDiscussionOpen({
        status: "sent",
        validUntil: "2026-05-01",
        today: new Date("2026-05-02T12:00:00Z"),
      }),
    ).toBe(false);
  });

  it("keeps revision requests open because the quote is still active", () => {
    expect(
      isQuoteDiscussionOpen({
        status: "revision_requested",
        validUntil: "2026-05-01",
        today: new Date("2026-05-02T12:00:00Z"),
      }),
    ).toBe(true);
  });

  it("treats every terminal status and an archived quote as closed", () => {
    for (const status of ["accepted", "rejected", "expired", "voided"]) {
      expect(isTerminalQuoteStatus(status)).toBe(true);
      expect(
        isQuoteDiscussionOpen({
          status,
          validUntil: "2099-01-01",
          today: new Date("2026-05-01T12:00:00Z"),
        }),
      ).toBe(false);
    }

    expect(
      isQuoteDiscussionOpen({
        status: "sent",
        validUntil: "2099-01-01",
        quoteArchived: true,
      }),
    ).toBe(false);
  });

  it("does not open a draft quote", () => {
    expect(
      isQuoteDiscussionOpen({
        status: "draft",
        validUntil: "2099-01-01",
      }),
    ).toBe(false);
  });
});

describe("quote discussion state", () => {
  it("derives needs reply from the latest customer message", () => {
    expect(
      deriveQuoteDiscussionState({
        quoteStatus: "sent",
        latestSenderType: "customer",
      }),
    ).toBe("needs_reply");
  });

  it("derives waiting for customer from the latest business message", () => {
    expect(
      deriveQuoteDiscussionState({
        quoteStatus: "sent",
        latestSenderType: "business",
      }),
    ).toBe("waiting_for_customer");
  });

  it("archives terminal quotes even when no archive marker is set", () => {
    expect(
      deriveQuoteDiscussionState({
        quoteStatus: "accepted",
        latestSenderType: "customer",
      }),
    ).toBe("archived");
    expect(
      deriveQuoteDiscussionState({
        quoteStatus: "sent",
        archivedAt: "2026-05-01T12:00:00.000Z",
        latestSenderType: "business",
      }),
    ).toBe("archived");
  });
});

describe("quote discussion message validation", () => {
  it("trims and accepts a normal message", () => {
    expect(validateQuoteDiscussionMessageBody("  Hello there  ")).toEqual({
      ok: true,
      body: "Hello there",
    });
  });

  it("rejects empty and whitespace-only messages", () => {
    expect(validateQuoteDiscussionMessageBody("").ok).toBe(false);
    expect(validateQuoteDiscussionMessageBody("   \n  ").ok).toBe(false);
    expect(validateQuoteDiscussionMessageBody(null).ok).toBe(false);
  });

  it("rejects an oversized message", () => {
    expect(
      validateQuoteDiscussionMessageBody("a".repeat(4001)).ok,
    ).toBe(false);
  });

  it("normalizes and validates the guest display name", () => {
    expect(validateQuoteDiscussionSenderName("  Maria   Santos ")).toEqual({
      ok: true,
      body: "Maria Santos",
    });
    expect(validateQuoteDiscussionSenderName("M").ok).toBe(false);
    expect(validateQuoteDiscussionSenderName("a".repeat(121)).ok).toBe(false);
  });

  it("rejects a whitespace-only body at the schema boundary", () => {
    expect(
      quoteDiscussionMessageSchema.safeParse({
        senderName: "Maria Santos",
        body: "   ",
      }).success,
    ).toBe(false);
  });
});

describe("quote discussion presentation helpers", () => {
  const messages: QuoteDiscussionMessageView[] = [
    {
      id: "1",
      senderType: "business",
      senderName: "Studio",
      body: "Hello",
      createdAt: "2026-05-01T10:00:00.000Z",
    },
    {
      id: "2",
      senderType: "customer",
      senderName: "Maria Santos",
      body: "A question",
      createdAt: "2026-05-01T11:00:00.000Z",
    },
  ];

  it("returns the most recent customer display name", () => {
    expect(getLatestCustomerMessageName(messages)).toBe("Maria Santos");
    expect(getLatestCustomerMessageName([])).toBe("");
  });

  it("truncates long previews without breaking on whitespace runs", () => {
    const preview = getQuoteDiscussionPreview(
      `  Need    to ask ${"x".repeat(200)}  `,
      20,
    );

    expect(preview.length).toBeLessThanOrEqual(20);
    expect(preview.endsWith("…")).toBe(true);
  });
});

describe("quote discussion guest session", () => {
  const quoteToken = "quote-token-abc";
  const sessionToken = "s".repeat(43);
  const scope = hashOpaqueToken(quoteToken).slice(0, 16);

  it("groups a session under its quote without storing the raw token", () => {
    expect(
      getQuoteDiscussionGuestSessionHash({
        quoteToken,
        cookieValue: `${scope}.${sessionToken}`,
      }),
    ).toBe(hashOpaqueToken(sessionToken));
  });

  it("rejects a cookie issued for another quote or a malformed value", () => {
    const otherScope = hashOpaqueToken("another-quote").slice(0, 16);

    expect(
      getQuoteDiscussionGuestSessionHash({
        quoteToken,
        cookieValue: `${otherScope}.${sessionToken}`,
      }),
    ).toBeNull();
    expect(
      getQuoteDiscussionGuestSessionHash({
        quoteToken,
        cookieValue: "not-a-session",
      }),
    ).toBeNull();
    expect(
      getQuoteDiscussionGuestSessionHash({
        quoteToken,
        cookieValue: `${scope}.short`,
      }),
    ).toBeNull();
    expect(
      getQuoteDiscussionGuestSessionHash({ quoteToken, cookieValue: null }),
    ).toBeNull();
  });
});

describe("quote discussion inbox filters", () => {
  it("reads a valid view and page", () => {
    expect(
      quoteDiscussionInboxFiltersSchema.parse({ view: "archived", page: "2" }),
    ).toEqual({ view: "archived", page: 2 });
  });

  it("falls back to needs reply and page one for bad input", () => {
    expect(
      quoteDiscussionInboxFiltersSchema.parse({ view: "bogus", page: "0" }),
    ).toEqual({ view: "needs_reply", page: 1 });
  });
});

describe("quote discussion reply email", () => {
  it("escapes customer and business text in html and text", () => {
    const template = renderQuoteDiscussionReplyEmail({
      businessName: "<b>Studio</b>",
      customerName: "<script>alert(1)</script>",
      quoteNumber: "Q-0012",
      replyPreview: '<img src=x onerror="alert(1)">',
      publicQuoteUrl: "https://example.com/quote/token",
    });

    expect(template.html).not.toContain("<script>");
    expect(template.html).not.toContain("<img src=x");
    expect(template.html).toContain("&lt;script&gt;");
    expect(template.subject).toContain("<b>Studio</b>");
    expect(template.text).toContain('<img src=x onerror="alert(1)">');
  });
});
