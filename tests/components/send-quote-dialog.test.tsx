import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const deferredRefresh = vi.hoisted(() => ({
  scheduleRefresh: vi.fn(),
  refreshNow: vi.fn(),
}));

vi.mock("@/components/shared/notify", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));
vi.mock("@/hooks/use-deferred-refresh", () => ({
  useDeferredRefresh: () => deferredRefresh,
}));

import { SendQuoteDialog } from "@/features/quotes/components/send-quote-dialog";
import type { QuoteSendActionState } from "@/features/quotes/types";

const quote = {
  quoteNumber: "Q-1002",
  title: "Foundry Labs booth kit",
  customerName: "Taylor Nguyen",
  customerEmail: "taylor@example.com",
  customerContactMethod: "email",
  customerContactHandle: "taylor@example.com",
  totalInCents: 230_000,
  currency: "USD",
  validUntil: "2026-12-14",
  status: "draft" as const,
};

function renderDialog(
  sendAction: (
    state: QuoteSendActionState,
    formData: FormData,
  ) => Promise<QuoteSendActionState>,
) {
  return render(
    <SendQuoteDialog
      businessName="Foundry Labs"
      customerQuoteUrl="https://requo.test/quote/token"
      isRequoEmailAvailable={true}
      logEventAction={async () => ({})}
      quote={quote}
      sendAction={sendAction}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("send quote dialog feedback", () => {
  it("keeps the ready step with a persistent error when the server rejects the send", async () => {
    let resolveSend!: (state: QuoteSendActionState) => void;
    const sendAction = vi.fn(
      () =>
        new Promise<QuoteSendActionState>((resolve) => {
          resolveSend = resolve;
        }),
    );

    const testUser = userEvent.setup();
    renderDialog(sendAction);
    await testUser.click(screen.getByRole("button", { name: "Send" }));
    await testUser.click(
      await screen.findByRole("button", { name: "Send now" }),
    );

    expect(await screen.findByText("Sending...")).toBeInTheDocument();
    expect(screen.queryByText("Quote sent")).not.toBeInTheDocument();

    await act(async () => {
      resolveSend({
        error: 'Required scope section "deliverables" is missing.',
      });
    });

    expect(
      await screen.findByRole("alert"),
    ).toHaveTextContent("Quote not sent");
    expect(screen.getByRole("alert")).toHaveTextContent(
      'Required scope section "deliverables" is missing.',
    );
    expect(screen.getByText("Send quote")).toBeInTheDocument();
    expect(screen.queryByText("Quote sent")).not.toBeInTheDocument();
  });

  it("shows the sent confirmation only after the server confirms success", async () => {
    let resolveSend!: (state: QuoteSendActionState) => void;
    const sendAction = vi.fn(
      () =>
        new Promise<QuoteSendActionState>((resolve) => {
          resolveSend = resolve;
        }),
    );

    const testUser = userEvent.setup();
    renderDialog(sendAction);
    await testUser.click(screen.getByRole("button", { name: "Send" }));
    await testUser.click(
      await screen.findByRole("button", { name: "Send now" }),
    );

    expect(await screen.findByText("Sending...")).toBeInTheDocument();
    expect(screen.queryByText("Quote sent")).not.toBeInTheDocument();

    await act(async () => {
      resolveSend({ success: "Quote sent to Taylor Nguyen." });
    });

    expect(await screen.findByText("Quote sent")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("dialog")).toHaveTextContent(
        "Quote sent to Taylor Nguyen.",
      ),
    );
  });

  it("refreshes once when the dialog is dismissed while the send is pending", async () => {
    let resolveSend!: (state: QuoteSendActionState) => void;
    const sendAction = vi.fn(
      () =>
        new Promise<QuoteSendActionState>((resolve) => {
          resolveSend = resolve;
        }),
    );

    const testUser = userEvent.setup();
    renderDialog(sendAction);
    await testUser.click(screen.getByRole("button", { name: "Send" }));
    await testUser.click(
      await screen.findByRole("button", { name: "Send now" }),
    );

    expect(await screen.findByText("Sending...")).toBeInTheDocument();

    // Escape closes the dialog while the action is still in flight. The
    // quote detail must still refresh when the send resolves.
    await testUser.keyboard("{Escape}");
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(deferredRefresh.scheduleRefresh).not.toHaveBeenCalled();

    await act(async () => {
      resolveSend({ success: "Quote sent to Taylor Nguyen." });
    });

    await waitFor(() =>
      expect(deferredRefresh.scheduleRefresh).toHaveBeenCalledTimes(1),
    );
  });
});
