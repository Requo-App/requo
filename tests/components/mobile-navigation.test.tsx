import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { MobileFloatingDock } from "@/components/shell/mobile-floating-dock";
import { MobileFullscreenNav } from "@/components/shell/mobile-fullscreen-nav";
import { MobileGlobalSearch } from "@/components/shell/mobile-global-search";
import {
  MobileHeaderSlot,
  MobileHeaderSlotProvider,
  MobileHeaderSlotTarget,
  mobileNavbarIconButtonClassName,
} from "@/components/shell/mobile-header-slot";
import { MobileTopBar } from "@/components/shell/mobile-top-bar";
import { MobileRecordRow } from "@/components/shared/mobile-record-row";

const navState = vi.hoisted(() => ({ pathname: "/demo/inquiries" }));

vi.mock("next/navigation", () => ({
  usePathname: () => navState.pathname,
}));

describe("MobileTopBar", () => {
  it("renders business control, title, slot target, and pins the bell rightmost", () => {
    const { container } = render(
      <MobileTopBar
        businessControl={<button type="button">Biz</button>}
        pageTitle="Inquiries"
        notificationSlot={<button type="button">Bell</button>}
      />,
    );

    expect(screen.getByRole("heading", { name: "Inquiries" })).toBeDefined();

    const biz = screen.getByText("Biz");
    const bell = screen.getByText("Bell");
    expect(
      Boolean(
        biz.compareDocumentPosition(bell) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ).toBe(true);
    expect(container.querySelector("h1")?.textContent).toBe("Inquiries");
  });
});

describe("MobileHeaderSlot", () => {
  function stubMobileViewport() {
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 390,
    });
    vi.stubGlobal("matchMedia", () => ({
      matches: true,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
  }

  it("renders children inline when no slot target is registered", () => {
    render(
      <MobileHeaderSlotProvider>
        <MobileHeaderSlot>
          <button type="button">Export CSV</button>
        </MobileHeaderSlot>
      </MobileHeaderSlotProvider>,
    );

    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDefined();
  });

  it("teleports the same instance into the navbar target on mobile", async () => {
    stubMobileViewport();
    render(
      <MobileHeaderSlotProvider>
        <div data-testid="topbar">
          <MobileHeaderSlotTarget />
        </div>
        <div data-testid="page">
          <MobileHeaderSlot>
            <button type="button">Export CSV</button>
          </MobileHeaderSlot>
        </div>
      </MobileHeaderSlotProvider>,
    );

    const topbarButton = await screen.findByRole("button", {
      name: "Export CSV",
    });
    expect(
      within(screen.getByTestId("topbar")).getByRole("button", {
        name: "Export CSV",
      }),
    ).toBe(topbarButton);
    expect(
      within(screen.getByTestId("page")).queryByRole("button", {
        name: "Export CSV",
      }),
    ).toBeNull();

    vi.unstubAllGlobals();
  });
});

describe("mobileNavbarIconButtonClassName", () => {
  it("pins the 32px icon box below lg without touching desktop", () => {
    // Regression guard: converted header actions keep their previous desktop
    // `variant`/`size` and pair this const only for the mobile collapse.
    // Utility-only collapses (`size="icon-sm"` + `lg:` restores, then
    // `max-lg:` shrink) both lost the cascade to the desktop `h-9`/`h-11`
    // heights below `lg` and inflated the navbar buttons — the primary
    // action most visibly. The globals.css `.mobile-navbar-icon-button`
    // rule pins the box instead.
    expect(mobileNavbarIconButtonClassName).toBe("mobile-navbar-icon-button");
  });
});

describe("MobileFloatingDock", () => {  it("renders home, search, and settings actions", async () => {
    const user = userEvent.setup();
    const onHomeClick = vi.fn();
    const onSearchClick = vi.fn();
    const onSettingsClick = vi.fn();
    render(
      <MobileFloatingDock
        navOpen={false}
        settingsOpen={false}
        searchOpen={false}
        onHomeClick={onHomeClick}
        onSearchClick={onSearchClick}
        onSettingsClick={onSettingsClick}
      />,
    );

    expect(
      screen.getByRole("navigation", { name: "Mobile navigation" }),
    ).toBeDefined();

    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(onHomeClick).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Search records" }));
    expect(onSearchClick).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole("button", { name: "Open settings" }));
    expect(onSettingsClick).toHaveBeenCalledTimes(1);
  });

  it("hides on scroll down and reappears on scroll up", () => {
    const rafSpy = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 0;
      });

    try {
      render(
        <MobileFloatingDock
          navOpen={false}
          settingsOpen={false}
          searchOpen={false}
          onHomeClick={() => {}}
          onSearchClick={() => {}}
          onSettingsClick={() => {}}
        />,
      );

      const dock = screen.getByRole("navigation", {
        name: "Mobile navigation",
      });
      expect(dock.getAttribute("data-scroll-state")).toBe("top");

      act(() => {
        Object.defineProperty(window, "scrollY", {
          configurable: true,
          value: 200,
        });
        window.dispatchEvent(new Event("scroll"));
      });
      expect(dock.getAttribute("data-scroll-state")).toBe("hidden");

      act(() => {
        Object.defineProperty(window, "scrollY", {
          configurable: true,
          value: 100,
        });
        window.dispatchEvent(new Event("scroll"));
      });
      expect(dock.getAttribute("data-scroll-state")).toBe("visible");

      act(() => {
        Object.defineProperty(window, "scrollY", {
          configurable: true,
          value: 0,
        });
        window.dispatchEvent(new Event("scroll"));
      });
      expect(dock.getAttribute("data-scroll-state")).toBe("top");
    } finally {
      rafSpy.mockRestore();
      Object.defineProperty(window, "scrollY", {
        configurable: true,
        value: 0,
      });
    }
  });
});

describe("MobileFullscreenNav", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <MobileFullscreenNav
        open={false}
        onOpenChange={() => {}}
        businessSlug="demo"
        variant="main"
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("lists dashboard sections in fullscreen", () => {
    render(
      <MobileFullscreenNav
        open={true}
        onOpenChange={() => {}}
        businessSlug="demo"
        variant="main"
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Workspace navigation" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: /inquiries/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /quotes/i })).toBeDefined();
    expect(screen.getByRole("link", { name: /assistant/i })).toBeDefined();
  });

  it("lists grouped settings", () => {
    render(
      <MobileFullscreenNav
        open={true}
        onOpenChange={() => {}}
        businessSlug="demo"
        variant="settings"
        groups={[
          {
            label: "User",
            items: [{ href: "/demo/settings/profile", label: "Profile", icon: "user" }],
          },
        ]}
      />,
    );

    expect(
      screen.getByRole("dialog", { name: "Settings navigation" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "Profile" })).toBeDefined();
  });

  it("shows the user profile without theme or secondary rows", () => {
    render(
      <MobileFullscreenNav
        open={true}
        onOpenChange={() => {}}
        businessSlug="demo"
        variant="main"
        bottomSlot={<button type="button">User profile</button>}
      />,
    );

    expect(screen.getByRole("link", { name: /inquiries/i })).toBeDefined();
    expect(screen.getByRole("button", { name: "User profile" })).toBeDefined();
    expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Support" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Settings" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "Close sidebar" }),
    ).toBeDefined();
  });

  it("dismisses on Escape and reports its open state", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <MobileFullscreenNav
        open={true}
        onOpenChange={onOpenChange}
        businessSlug="demo"
        variant="main"
      />,
    );

    const dialog = screen.getByRole("dialog", {
      name: "Workspace navigation",
    });
    await waitFor(() => {
      expect(dialog.getAttribute("data-state")).toBe("open");
    });

    await user.keyboard("{Escape}");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("strips theme chrome from the settings nav", () => {
    render(
      <MobileFullscreenNav
        open={true}
        onOpenChange={() => {}}
        businessSlug="demo"
        variant="settings"
        groups={[
          {
            label: "User",
            items: [{ href: "/demo/settings/profile", label: "Profile", icon: "user" }],
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "Profile" })).toBeDefined();
    expect(screen.queryByRole("group", { name: "Theme" })).toBeNull();
  });
});

describe("MobileGlobalSearch", () => {
  it("renders nothing when closed", () => {
    const { container } = render(
      <MobileGlobalSearch
        open={false}
        onOpenChange={() => {}}
        businessSlug="demo"
      />,
    );

    expect(container.innerHTML).toBe("");
  });

  it("searches records and links to results", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          results: [
            {
              id: "quote-1",
              type: "quote",
              title: "Website redesign",
              subtitle: "Q-1001 · Acme",
              href: "/demo/quotes/quote-1",
            },
          ],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      render(
        <MobileGlobalSearch
          open={true}
          onOpenChange={() => {}}
          businessSlug="demo"
        />,
      );

      const input = screen.getByRole("searchbox");
      await user.type(input, "acme");

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/business/demo/mobile-search?q=acme",
          expect.objectContaining({}),
        );
      });
      expect(
        await screen.findByRole("link", { name: /website redesign/i }),
      ).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("MobileRecordRow", () => {
  it("renders title, subtitle, badges, and supports selection", async () => {
    const toggleSpy = vi.fn();
    const user = userEvent.setup();

    render(
      <MobileRecordRow
        id="rec-1"
        href="/demo/inquiries/rec-1"
        title="Jane Doe"
        subtitle="jane@example.com"
        statusBadge={<span>New</span>}
        metadata={<span>Channel: Web</span>}
        isSelected={false}
        onToggleSelect={toggleSpy}
      />,
    );

    expect(screen.getByText("Jane Doe")).toBeDefined();
    expect(screen.getByText("jane@example.com")).toBeDefined();
    expect(screen.getByText("New")).toBeDefined();
    expect(screen.getByText("Channel: Web")).toBeDefined();

    const checkbox = screen.getByRole("checkbox", { name: /select record/i });
    await user.click(checkbox);
    expect(toggleSpy).toHaveBeenCalledWith("rec-1");
  });
});
