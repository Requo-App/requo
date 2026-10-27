import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

import { MarketingMainNav } from "@/components/marketing/marketing-main-nav";

/**
 * The marketing nav keeps a single Radix root for all three menus, so the
 * custom keyboard entry and close paths must hand focus to the panel and back
 * to the trigger instead of leaving it on the document.
 */

function productTrigger() {
  return screen.getByRole("button", { name: "Product" });
}

describe("MarketingMainNav", () => {
  it("opens the panel on ArrowDown and moves focus to the first item", async () => {
    const user = userEvent.setup();

    render(<MarketingMainNav />);

    productTrigger().focus();
    await user.keyboard("{ArrowDown}");

    const firstItem = await screen.findByRole("link", { name: /Inquiry/ });

    await waitFor(() => expect(firstItem).toHaveFocus());
  });

  it("closes on Escape and returns focus to the trigger", async () => {
    const user = userEvent.setup();

    render(<MarketingMainNav />);

    const trigger = productTrigger();

    trigger.focus();
    await user.keyboard("{ArrowDown}");
    await screen.findByRole("link", { name: /Inquiry/ });

    await user.keyboard("{Escape}");

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("closes when the open trigger is clicked again", async () => {
    render(<MarketingMainNav />);

    const trigger = productTrigger();

    /*
     * Pointer-enter keeps the pointer-inside close guard active, but drive the
     * clicks raw: userEvent's synthetic hover also schedules Radix's delayed
     * hover-open, which can fire after the close on a slow CI box and reopen
     * the panel. The toggle itself is a click path, not a hover path.
     */
    fireEvent.pointerOver(trigger, { pointerType: "mouse" });
    fireEvent.click(trigger);

    await screen.findByRole("link", { name: /Inquiry/ });

    fireEvent.click(trigger);

    await waitFor(() =>
      expect(trigger).toHaveAttribute("aria-expanded", "false"),
    );
    expect(
      screen.queryByRole("link", { name: /Inquiry/ }),
    ).not.toBeInTheDocument();
  });
});
