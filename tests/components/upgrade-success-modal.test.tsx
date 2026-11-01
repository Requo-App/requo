import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { UpgradeSuccessModal } from "@/features/billing/components/upgrade-success-modal";

const navigation = vi.hoisted(() => ({
  params: new URLSearchParams(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/example/home",
  useSearchParams: () => navigation.params,
  useRouter: () => ({ replace: navigation.replace, refresh: navigation.refresh }),
}));

describe("checkout result dialog", () => {
  beforeEach(() => {
    navigation.replace.mockReset();
    navigation.refresh.mockReset();
  });

  it.each([
    ["success", "Welcome to Business", /Your upgrade is active/],
    ["processing", "Activation pending", /payment is being processed/],
    ["failed", "Upgrade failed", /couldn't confirm your upgrade/],
  ])("shows the %s outcome and clears its parameters when closed", async (status, title, message) => {
    navigation.params = new URLSearchParams({ upgrade: status, plan: "business", tab: "billing" });
    const user = userEvent.setup();
    render(<UpgradeSuccessModal />);
    const dialog = await screen.findByRole("dialog", { name: title });
    expect(within(dialog).getByText(message)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: status === "success" ? "Get started" : "Done" }));
    expect(navigation.replace).toHaveBeenCalledWith("/example/home?tab=billing", { scroll: false });
    expect(navigation.refresh).toHaveBeenCalled();
  });
});
