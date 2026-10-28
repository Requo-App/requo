import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

vi.mock("@/features/admin/components/shell/admin-sidebar", () => ({
  AdminSidebar: () => <button type="button">Navigation item</button>,
}));

import { MobileGlobalSearch } from "@/components/shell/mobile-global-search";
import { AdminFullscreenNav } from "@/features/admin/components/shell/admin-fullscreen-nav";

describe.each(["search", "admin"] as const)("%s dialog presence", (kind) => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.style.overflow = "scroll";
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    document.body.style.overflow = "";
  });

  function setup() {
    const onOpenChange = vi.fn();
    function dialog(open: boolean) {
      return (
        <>
          <button type="button">Open dialog</button>
          {kind === "search" ? (
            <MobileGlobalSearch
              open={open}
              onOpenChange={onOpenChange}
              businessSlug="test-business"
            />
          ) : (
            <AdminFullscreenNav
              open={open}
              onOpenChange={onOpenChange}
              userSlot={null}
            />
          )}
        </>
      );
    }
    const view = render(dialog(false));
    const trigger = screen.getByRole("button", { name: "Open dialog" });
    trigger.focus();
    return {
      trigger,
      onOpenChange,
      setOpen: (open: boolean) => view.rerender(dialog(open)),
    };
  }

  it("releases modal effects immediately while preserving the exit transition", () => {
    const { trigger, onOpenChange, setOpen } = setup();
    setOpen(true);
    act(() => vi.advanceTimersByTime(40));

    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("data-state", "open");
    expect(panel).not.toHaveAttribute("inert");
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).toHaveBeenCalledExactlyOnceWith(false);
    onOpenChange.mockClear();

    setOpen(false);

    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute("data-state", "closed");
    expect(panel).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("scroll");
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onOpenChange).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(trigger).toHaveFocus();

    act(() => vi.advanceTimersByTime(239));
    expect(panel).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(panel).not.toBeInTheDocument();
  });

  it("cancels pending entrance focus when closed before the next frame", () => {
    const { trigger, setOpen } = setup();
    setOpen(true);
    const panel = screen.getByRole("dialog");
    setOpen(false);

    act(() => vi.advanceTimersByTime(40));

    expect(panel).toHaveAttribute("data-state", "closed");
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
    act(() => vi.advanceTimersByTime(200));
    expect(panel).not.toBeInTheDocument();
  });

  it("can reopen during exit without being unmounted by the old timer", () => {
    const { trigger, setOpen } = setup();
    setOpen(true);
    act(() => vi.advanceTimersByTime(40));
    setOpen(false);
    act(() => vi.advanceTimersByTime(100));
    setOpen(true);
    act(() => vi.advanceTimersByTime(240));

    const panel = screen.getByRole("dialog");
    expect(panel).toHaveAttribute("data-state", "open");
    expect(panel).not.toHaveAttribute("inert");
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.body.style.overflow).toBe("hidden");

    setOpen(false);
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("scroll");
  });
});
