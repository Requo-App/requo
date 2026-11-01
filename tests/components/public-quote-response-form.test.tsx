import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublicQuoteResponseForm } from "@/features/quotes/components/public-quote-response-form";
import type { PublicQuoteResponseActionState } from "@/features/quotes/types";

vi.mock("@/components/shared/notify", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  cleanup();
});

function renderForm(
  action: (
    state: PublicQuoteResponseActionState,
    formData: FormData,
  ) => Promise<PublicQuoteResponseActionState> = async () => ({}),
) {
  return render(
    <PublicQuoteResponseForm
      action={action}
      customerName="Taylor Nguyen"
      expectedVersion={3}
    />,
  );
}

describe("public quote response form", () => {
  it("uses the customer name as the signer placeholder", () => {
    renderForm();

    expect(screen.getByLabelText("Your name")).toHaveAttribute(
      "placeholder",
      "Taylor Nguyen",
    );
  });

  it("asks for confirmation before declining a quote", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (
        _state: PublicQuoteResponseActionState,
        _formData: FormData,
      ): Promise<PublicQuoteResponseActionState> => ({
        success: "Quote declined.",
      }),
    );
    renderForm(action);

    await user.click(screen.getByRole("button", { name: "Decline" }));

    expect(screen.getByRole("dialog")).toHaveTextContent("Decline this quote?");
    expect(action).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Decline quote" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    const formData = action.mock.calls[0]?.[1];
    expect(formData).toBeInstanceOf(FormData);
    expect(formData?.get("response")).toBe("rejected");
    expect(formData?.get("expectedVersion")).toBe("3");
  });

  it("does not decline when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const action = vi.fn(
      async (
        _state: PublicQuoteResponseActionState,
        _formData: FormData,
      ): Promise<PublicQuoteResponseActionState> => ({}),
    );
    renderForm(action);

    await user.click(screen.getByRole("button", { name: "Decline" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(action).not.toHaveBeenCalled();
  });
});
