import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { BusinessDiscussionList } from "@/features/quote-discussions/components/business-discussion-list";
import { DiscussionComposer } from "@/features/quote-discussions/components/discussion-composer";
import { DiscussionMessages } from "@/features/quote-discussions/components/discussion-messages";
import type {
  QuoteDiscussionMessageView,
  QuoteDiscussionSummary,
} from "@/features/quote-discussions/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const messages: QuoteDiscussionMessageView[] = [
  {
    id: "message-1",
    senderType: "customer",
    senderName: "Maria Santos",
    body: "Can we split the deposit into two payments?",
    createdAt: "2026-05-01T10:00:00.000Z",
  },
  {
    id: "message-2",
    senderType: "business",
    senderName: "Studio",
    body: "Yes, we can split it across two dates.",
    createdAt: "2026-05-01T11:00:00.000Z",
  },
];

describe("quote discussion messages", () => {
  it("shows the empty state when no messages exist", () => {
    render(
      <DiscussionMessages
        businessName="Studio"
        emptyDescription="Ask about scope."
        emptyTitle="Start the conversation"
        messages={[]}
        viewer="customer"
      />,
    );

    expect(screen.getByText("Start the conversation")).toBeTruthy();
    expect(screen.getByText("Ask about scope.")).toBeTruthy();
  });

  it("renders plain text and distinguishes customer from business", () => {
    render(
      <DiscussionMessages
        businessName="Studio"
        messages={messages}
        viewer="business"
      />,
    );

    expect(
      screen.getByText("Can we split the deposit into two payments?"),
    ).toBeTruthy();
    expect(
      screen.getByText("Yes, we can split it across two dates."),
    ).toBeTruthy();
    expect(screen.getByText("Maria Santos")).toBeTruthy();
    expect(screen.getByText("Studio")).toBeTruthy();
    expect(screen.getAllByText("Customer")).toHaveLength(1);
    expect(screen.getAllByText("Business")).toHaveLength(1);
  });
});

describe("quote discussion composer", () => {
  const action = async () => ({ success: "Message sent." });

  it("collects an unverified display name alongside the first message", () => {
    render(
      <DiscussionComposer
        action={action}
        defaultName="Maria Santos"
        showNameField
        submitLabel="Send question"
      />,
    );

    expect(screen.getByLabelText("Your name")).toHaveValue("Maria Santos");
    expect(
      screen.getByText("This name is a display label, not a verified identity."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Message")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send question/ })).toBeTruthy();
  });

  it("renders a read-only notice instead of the composer when closed", () => {
    render(<DiscussionComposer action={action} disabled />);

    expect(screen.getByText("This discussion is read-only")).toBeTruthy();
    expect(screen.queryByLabelText("Message")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("business discussion inbox list", () => {
  const item: QuoteDiscussionSummary = {
    id: "discussion-1",
    quoteId: "quote-1",
    quoteNumber: "Q-0012",
    quoteStatus: "sent",
    quoteTotalInCents: 250000,
    currency: "USD",
    customerName: "Maria Santos",
    state: "needs_reply",
    unreadCount: 2,
    lastMessageAt: "2026-05-01T10:00:00.000Z",
    lastMessage: {
      senderType: "customer",
      senderName: "Maria Santos",
      body: "Can we split the deposit?",
      createdAt: "2026-05-01T10:00:00.000Z",
    },
  };

  it("shows quote context, unread count, state, and the last message", () => {
    render(
      <BusinessDiscussionList
        businessSlug="studio"
        items={[item]}
        view="needs_reply"
      />,
    );

    expect(screen.getByText("Maria Santos")).toBeTruthy();
    expect(screen.getByText(/Q-0012/)).toBeTruthy();
    expect(screen.getByText("2 new")).toBeTruthy();
    expect(screen.getByText("Needs reply")).toBeTruthy();
    expect(screen.getByText(/Can we split the deposit\?/)).toBeTruthy();
    expect(
      screen.getByRole("link", { name: /Maria Santos/ }).getAttribute("href"),
    ).toBe("/studio/discussions/discussion-1");
  });

  it("shows the view-specific empty state", () => {
    render(
      <BusinessDiscussionList businessSlug="studio" items={[]} view="archived" />,
    );

    expect(screen.getByText("No archived discussions")).toBeTruthy();
    expect(screen.queryByText("Needs reply")).toBeNull();
  });
});
