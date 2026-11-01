import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BusinessDiscussionList } from "@/features/quote-discussions/components/business-discussion-list";
import { DiscussionComposer } from "@/features/quote-discussions/components/discussion-composer";
import { DiscussionMessages } from "@/features/quote-discussions/components/discussion-messages";
import { PublicQuoteDiscussion } from "@/features/quote-discussions/components/public-quote-discussion";
import type {
  PublicQuoteDiscussionView,
  QuoteDiscussionMessageView,
  QuoteDiscussionSummary,
} from "@/features/quote-discussions/types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/components/shared/notify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

const publicDiscussion: PublicQuoteDiscussionView = {
  messages,
  closed: false,
  archived: false,
  suggestedName: "Maria Santos",
  businessName: "Studio",
  quoteNumber: "Q-2002",
};

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.location.hash = "";
  document.body.style.overflow = "";
});

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = "";
  document.body.style.overflow = "";
});

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

  it("renders relative timestamps with the absolute time in the title", () => {
    render(
      <DiscussionMessages
        businessName="Studio"
        messages={messages}
        showAvatars
        timestampFormat="relative"
        viewer="customer"
      />,
    );

    const time = document.querySelector("time");
    expect(time).not.toBeNull();
    expect(time).toHaveTextContent(/ago/);
    expect(time).toHaveAttribute(
      "title",
      expect.stringContaining("May 1, 2026"),
    );
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

    expect(screen.getByLabelText("Display name")).toHaveValue("Maria Santos");
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

describe("public quote discussion panel", () => {
  it("opens from the sidebar trigger, focuses the composer, and returns focus", async () => {
    const user = userEvent.setup();
    render(
      <PublicQuoteDiscussion
        action={async () => ({ success: "Message sent." })}
        businessContactEmail="hello@studio.test"
        discussion={publicDiscussion}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Questions/ });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    document.body.style.overflow = "scroll";

    await user.click(trigger);

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveAccessibleName("Questions");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(screen.getByText("Quote Q-2002 · Studio")).toBeTruthy();
    expect(
      screen.getByText(/Anyone with this quote link can read this conversation/),
    ).toBeTruthy();
    expect(screen.getByText("This is not an acceptance of the quote.")).toBeTruthy();
    expect(screen.getByLabelText("Message")).toHaveFocus();
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(document.body.style.overflow).toBe("hidden");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(document.body.style.overflow).toBe("scroll");
  });

  it("shows the empty state and keeps a draft when the panel closes", async () => {
    const user = userEvent.setup();
    render(
      <PublicQuoteDiscussion
        action={async () => ({ success: "Message sent." })}
        discussion={{ ...publicDiscussion, messages: [] }}
      />,
    );

    const trigger = screen.getByRole("button", { name: "Questions" });
    await user.click(trigger);

    expect(screen.getByText("Start the conversation")).toBeTruthy();
    expect(screen.queryByLabelText("Display name")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Change" }));
    const name = screen.getByLabelText("Display name");
    await user.clear(name);
    await user.type(name, "E2E Customer");
    const message = screen.getByLabelText("Message");
    await user.type(message, "Can we adjust the timeline?");

    await user.keyboard("{Escape}");
    await waitFor(() => expect(trigger).toHaveFocus());
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    await user.click(trigger);

    expect(await screen.findByLabelText("Message")).toHaveValue(
      "Can we adjust the timeline?",
    );
    await user.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByLabelText("Display name")).toHaveValue("E2E Customer");
  });

  it("shows an optimistic bubble while sending and preserves text on failure", async () => {
    const user = userEvent.setup();
    let resolveAction:
      | ((state: { error: string }) => void)
      | undefined;
    const action = vi.fn(
      () =>
        new Promise<{ error: string }>((resolve) => {
          resolveAction = resolve;
        }),
    );

    render(
      <PublicQuoteDiscussion
        action={action}
        discussion={{ ...publicDiscussion, messages: [] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Questions" }));
    const message = screen.getByLabelText("Message");
    await user.type(message, "Can we adjust the timeline?");
    const sendButton = screen.getByRole("button", { name: "Send" });
    await user.click(sendButton);

    expect(
      screen.getByRole("list", { name: "Discussion messages" }),
    ).toHaveTextContent("Can we adjust the timeline?");
    expect(sendButton).toBeDisabled();

    await act(async () => {
      resolveAction?.({ error: "Try again." });
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("Try again.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeTruthy();
    expect(screen.getByLabelText("Message")).toHaveValue(
      "Can we adjust the timeline?",
    );
  });

  it("marks a new business reply until the panel is opened", async () => {
    const user = userEvent.setup();
    render(
      <PublicQuoteDiscussion
        action={async () => ({ success: "Message sent." })}
        discussion={publicDiscussion}
      />,
    );

    const trigger = screen.getByRole("button", { name: /Questions/ });

    await waitFor(() =>
      expect(trigger).toHaveAttribute(
        "aria-label",
        "Questions, 2 messages, new reply from business",
      ),
    );

    await user.click(trigger);

    await waitFor(() =>
      expect(trigger).toHaveAttribute(
        "aria-label",
        "Questions, 2 messages",
      ),
    );
  });

  it("opens automatically for #discussion links", async () => {
    window.location.hash = "#discussion";

    render(
      <PublicQuoteDiscussion
        action={async () => ({ success: "Message sent." })}
        discussion={publicDiscussion}
      />,
    );

    expect(await screen.findByRole("dialog")).toBeTruthy();
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
