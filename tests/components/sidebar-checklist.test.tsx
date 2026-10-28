import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mobileState = vi.hoisted(() => ({ isMobile: false }));

vi.mock("@/hooks/use-mobile", () => ({
  useIsMobile: () => mobileState.isMobile,
}));

vi.mock("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { SidebarChecklist } from "@/features/onboarding/components/sidebar-checklist";

const items = [
  {
    id: "inquiry",
    title: "Send your first inquiry",
    detail: "Share a public inquiry link.",
    complete: false,
    href: "/acme/inquiries",
    actionLabel: "Open inquiries",
  },
];

beforeEach(() => {
  mobileState.isMobile = false;
  window.localStorage.clear();
});

describe("SidebarChecklist popover placement", () => {
  it("opens to the right of the desktop rail", async () => {
    const user = userEvent.setup();
    render(<SidebarChecklist items={items} />);

    await user.click(screen.getByRole("button", { name: /getting started/i }));

    const popover = await screen.findByRole("dialog");
    expect(popover).toHaveAttribute("data-side", "right");
  });

  it("opens above the trigger on mobile so the panel stays on screen", async () => {
    mobileState.isMobile = true;
    const user = userEvent.setup();
    render(<SidebarChecklist items={items} />);

    await user.click(screen.getByRole("button", { name: /getting started/i }));

    const popover = await screen.findByRole("dialog");
    expect(popover).toHaveAttribute("data-side", "top");
    expect(popover.className).toContain("w-[min(20rem,calc(100vw-1rem))]");
  });
});
