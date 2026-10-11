import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  Notification,
  NotificationViewport,
} from "@/components/shared/notification";
import { SettingsModal } from "@/components/shared/settings-modal";

describe("Notification lifecycle", () => {
  it("announces with the status role and content", () => {
    render(
      <NotificationViewport position="bottom-right">
        <Notification title="Saved" description="Quote Q-1 updated" />
      </NotificationViewport>,
    );

    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.getByText("Saved")).toBeDefined();
    expect(screen.getByText("Quote Q-1 updated")).toBeDefined();
  });

  it("removes the exiting toast from pointer and keyboard interaction", async () => {
    const user = userEvent.setup();
    const onDismiss = vi.fn();
    render(
      <NotificationViewport position="bottom-right">
        <Notification title="Saved" onDismiss={onDismiss} />
      </NotificationViewport>,
    );

    await user.click(screen.getByRole("button", { name: "Dismiss notification" }));

    const card = screen.getByRole("status");
    expect(card.getAttribute("inert")).not.toBeNull();
    expect(card.className).toContain("pointer-events-none");

    await waitFor(
      () => {
        expect(onDismiss).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
  });

  it("auto-dismisses after the configured duration", async () => {
    const onDismiss = vi.fn();
    render(
      <NotificationViewport position="bottom-right">
        <Notification
          title="Expiring"
          autoDismissDuration={300}
          onDismiss={onDismiss}
        />
      </NotificationViewport>,
    );

    await waitFor(
      () => {
        expect(onDismiss).toHaveBeenCalledTimes(1);
      },
      { timeout: 5000 },
    );
  });
});

function ModalHarness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        Open settings
      </button>
      <SettingsModal isOpen={open} onClose={() => setOpen(false)} />
    </div>
  );
}

describe("SettingsModal focus management", () => {
  it("moves focus into the dialog on open", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Open settings" }));

    const dialog = await screen.findByRole("dialog", { name: "Settings" });
    expect(dialog.contains(document.activeElement)).toBe(true);
  });

  it("closes on Escape", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    await screen.findByRole("dialog", { name: "Settings" });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    });
  });

  it("restores focus to the opener on dismissal", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    const opener = screen.getByRole("button", { name: "Open settings" });
    await user.click(opener);
    await screen.findByRole("dialog", { name: "Settings" });

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Settings" })).toBeNull();
    });
    expect(document.activeElement).toBe(opener);
  });

  it("traps Tab inside the dialog", async () => {
    const user = userEvent.setup();
    render(<ModalHarness />);

    await user.click(screen.getByRole("button", { name: "Open settings" }));
    const dialog = await screen.findByRole("dialog", { name: "Settings" });

    const buttons = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      ),
    );
    expect(buttons.length).toBeGreaterThan(1);

    // Tab from the last focusable element wraps to the first.
    buttons[buttons.length - 1].focus();
    await user.tab();
    expect(document.activeElement).toBe(buttons[0]);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
