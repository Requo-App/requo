import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DashboardSidebar } from "@/components/shared/dashboard-sidebar";
import { BusinessAvatar } from "@/components/shared/business-avatar";

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    setTheme: vi.fn(),
    theme: "system",
    uiScale: "default",
    setUiScale: vi.fn(),
  }),
}));

vi.mock("@/features/theme/actions", () => ({
  updateThemePreferenceAction: vi.fn().mockResolvedValue({ ok: true }),
}));

function renderSidebar() {
  return render(
    <DashboardSidebar
      topSlot={<button type="button">Acme Corp</button>}
      bottomSlot={<button type="button">Jane Doe</button>}
      hideSecondaryNav
    />,
  );
}

describe("DashboardSidebar search", () => {
  it("renders without the keyboard shortcut pill", () => {
    renderSidebar();

    expect(screen.getByRole("button", { name: "Search" })).toBeDefined();
    expect(screen.queryByText("⌘L")).toBeNull();
  });
});

describe("DashboardSidebar collapsed rail", () => {
  it("keeps the business slot, search, and user slot mounted with centered triggers", async () => {
    const user = userEvent.setup();
    const { container } = renderSidebar();
    const aside = container.querySelector("aside");

    expect(aside?.getAttribute("data-collapsed")).toBe("false");

    await user.click(
      screen.getByRole("button", { name: "Collapse sidebar" }),
    );

    expect(aside?.getAttribute("data-collapsed")).toBe("true");
    // Avatar slots stay mounted so they can open their menus from the rail.
    expect(
      screen.getByRole("button", { name: "Acme Corp" }),
    ).toBeDefined();
    expect(screen.getByRole("button", { name: "Jane Doe" })).toBeDefined();

    const search = screen.getByRole("button", { name: "Search" });
    expect(search.className).toContain("size-9");
    expect(search.className).toContain("justify-center");

    expect(
      screen.getByRole("button", { name: "Expand sidebar" }),
    ).toBeDefined();
  });
});

describe("BusinessAvatar", () => {
  it("falls back to centered uppercase initials", () => {
    const { container } = render(<BusinessAvatar name="Mark Louie" />);

    const fallback = container.querySelector("[data-slot='avatar-fallback']");
    expect(fallback?.textContent).toBe("ML");
    expect(fallback?.className).toContain("text-center");
    expect(fallback?.className).not.toContain("tracking-wider");
  });
});
