import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

vi.mock("@/components/shared/notify", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { BookDemoDialog } from "@/components/marketing/book-demo-dialog";

function HeroTrigger() {
  return <BookDemoDialog>Book a demo</BookDemoDialog>;
}

describe("BookDemoDialog hydration parity (issue #72)", () => {
  it("server and client render the same trigger element (button, never a span)", () => {
    const serverHtml = renderToString(<HeroTrigger />);

    // The trigger must be the child button passed through DialogTrigger asChild.
    expect(serverHtml).toContain("<button");
    expect(serverHtml).not.toContain("contents");

    const { container } = render(<HeroTrigger />);
    const trigger = screen.getByRole("button", { name: "Book a demo" });

    expect(trigger.tagName).toBe("BUTTON");
    expect(trigger.outerHTML).toContain('data-variant="outline"');
    expect(container.innerHTML).not.toContain("contents");
  });

  it("hydrates the server markup without client-side regeneration", async () => {
    const serverHtml = renderToString(<HeroTrigger />);
    const host = document.createElement("div");
    host.innerHTML = serverHtml;
    document.body.appendChild(host);

    const caught: unknown[] = [];
    try {
      hydrateRoot(host, <HeroTrigger />, {
        onCaughtError: (error) => {
          caught.push(error);
        },
      });

      // Hydrated trigger stays wired: clicking opens the dialog.
      const user = userEvent.setup();
      await user.click(
        screen.getByRole("button", { name: "Book a demo" }),
      );
      expect(
        screen.getByRole("dialog", { name: "Book a demo" }),
      ).toBeInTheDocument();

      // Close again so the modal portal (rendered outside `host`) and its
      // body pointer-events lock don't leak into later tests. The close
      // plays a 220ms exit animation, so wait for the removal.
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Book a demo" }),
        ).not.toBeInTheDocument();
      });

      expect(caught).toEqual([]);
    } finally {
      host.remove();
    }
  });

  it("opens the demo request dialog when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(<HeroTrigger />);

    await user.click(screen.getByRole("button", { name: "Book a demo" }));

    expect(
      screen.getByRole("dialog", { name: "Book a demo" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/Name/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Email/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send request" }),
    ).toBeInTheDocument();
  });

  it("renders unique field ids for multiple instances on one page", async () => {
    const user = userEvent.setup();
    render(
      <>
        <HeroTrigger />
        <HeroTrigger />
      </>,
    );

    const triggers = screen.getAllByRole("button", { name: "Book a demo" });
    expect(triggers).toHaveLength(2);

    await user.click(triggers[0]!);
    const nameInputs = screen.getAllByLabelText(/Name/);
    const ids = nameInputs.map((input) => input.getAttribute("id"));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
