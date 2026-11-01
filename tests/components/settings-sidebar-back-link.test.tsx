import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/acme/settings/general",
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

import { BoarduiSettingsSidebar } from "@/features/settings/components/boardui-settings-sidebar";

const groups = [
  {
    label: "Business",
    items: [
      {
        href: "/acme/settings/general",
        label: "General",
        icon: "building",
      },
    ],
  },
];

describe("BoarduiSettingsSidebar", () => {
  it("links back to the business home dashboard", () => {
    render(
      <BoarduiSettingsSidebar
        businessSlug="acme"
        groups={groups}
        topSlot={<span />}
        bottomSlot={<span />}
      />,
    );

    expect(
      screen.getByRole("link", { name: "Back to dashboard" }),
    ).toHaveAttribute("href", "/acme/home");
  });
});
