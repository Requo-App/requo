import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

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

vi.mock("@/components/ui/sidebar", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/components/ui/sidebar")>();

  return {
    ...actual,
    useSidebar: () => ({ isMobile: false, setOpenMobile: vi.fn() }),
  };
});

vi.mock("@/features/business-members/actions", () => ({
  createBusinessMemberInviteAction: vi.fn(),
}));

vi.mock(
  "@/features/business-members/components/business-members-manager",
  () => ({
    InviteMemberDialog: () => null,
  }),
);

import { BusinessSwitcher } from "@/components/shell/dashboard-shell-slots";
import { PlanSelectionProvider } from "@/features/billing/components/plan-selection-provider";

const business = {
  id: "business_1",
  plan: "free" as const,
  name: "Brightside Print Studio",
  slug: "brightside-print-studio",
  businessType: "print_signage" as const,
  logoStoragePath: null,
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  defaultCurrency: "USD",
  timezone: "UTC",
  publicInquiryEnabled: true,
  recordState: "active" as const,
  archivedAt: null,
  lockedAt: null,
  deletedAt: null,
};

const currentBusiness = {
  membershipId: "membership_1",
  role: "owner" as const,
  memberJoinedAt: new Date("2026-01-01T00:00:00Z"),
  business,
};

describe("BusinessSwitcher upgrade action", () => {
  it("opens the shared plan picker and closes the switcher menu", async () => {
    const user = userEvent.setup();

    render(
      <PlanSelectionProvider>
        <BusinessSwitcher
          businessQuota={{
            allowed: false,
            current: 1,
            limit: 1,
            ownerUserId: "user_1",
            plan: "free",
            upgradePlan: "pro",
          }}
          currentBusiness={currentBusiness}
          memberships={[currentBusiness]}
          userId="user_1"
        />
      </PlanSelectionProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /brightside print studio/i }),
    );
    await user.click(await screen.findByRole("button", { name: "Upgrade" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Upgrade Plan");
    await waitFor(() =>
      expect(screen.queryByText("Switch business")).not.toBeInTheDocument(),
    );
  });

  it("shows plan prices in the subscription billing currency", async () => {
    const user = userEvent.setup();

    render(
      <PlanSelectionProvider>
        <BusinessSwitcher
          billingCurrency="EUR"
          businessQuota={{
            allowed: false,
            current: 1,
            limit: 1,
            ownerUserId: "user_1",
            plan: "free",
            upgradePlan: "pro",
          }}
          currentBusiness={currentBusiness}
          memberships={[currentBusiness]}
          userId="user_1"
        />
      </PlanSelectionProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /brightside print studio/i }),
    );
    await user.click(await screen.findByRole("button", { name: "Upgrade" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("€9/mo");
  });

  it("targets Pro while the business is inside its Pro trial", async () => {
    const user = userEvent.setup();
    const trialBusiness = { ...business, plan: "pro" as const };
    const trialCurrentBusiness = {
      ...currentBusiness,
      business: trialBusiness,
    };

    render(
      <PlanSelectionProvider>
        <BusinessSwitcher
          businessQuota={{
            allowed: false,
            current: 1,
            limit: 1,
            ownerUserId: "user_1",
            plan: "pro",
            upgradePlan: "business",
          }}
          currentBusiness={trialCurrentBusiness}
          isTrialing
          memberships={[trialCurrentBusiness]}
          userId="user_1"
        />
      </PlanSelectionProvider>,
    );

    await user.click(
      screen.getByRole("button", { name: /brightside print studio/i }),
    );
    await user.click(await screen.findByRole("button", { name: "Upgrade" }));

    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Choose a plan");
    expect(
      within(dialog).getByRole("button", { name: /subscribe to pro/i }),
    ).toBeInTheDocument();
  });
});
