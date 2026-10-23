import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BillingStatusCard } from "@/features/billing/components/billing-status-card";
import { startPolarCheckout } from "@/features/billing/start-checkout";
import type { BusinessBillingOverview } from "@/features/billing/types";

vi.mock("@/features/billing/actions", () => ({
  startBusinessTrialAction: vi.fn(),
}));

vi.mock("@/features/billing/start-checkout", () => ({
  startPolarCheckout: vi.fn(),
}));

const billing: BusinessBillingOverview = {
  userId: "trial-owner",
  businessId: "trial-business",
  businessName: "Trial business",
  businessSlug: "trial-business",
  currentPlan: "pro",
  billingCurrency: "EUR",
  canStartTrial: false,
  subscription: {
    status: "trialing",
    plan: "pro",
    provider: "polar",
    currency: "EUR",
    currentPeriodStart: null,
    currentPeriodEnd: new Date("2030-01-15"),
    trialEndsAt: new Date("2030-01-15"),
    canceledAt: null,
    providerSubscriptionId: null,
    providerCustomerId: null,
  },
  downgradePreview: {
    targetPlan: "free",
    activeBusinessLimit: 1,
    activeBusinesses: [],
    requiresSelection: false,
  },
};

describe("trial billing plan selection without a checkout provider", () => {
  beforeEach(() => {
    vi.mocked(startPolarCheckout).mockReset();
    vi.mocked(startPolarCheckout).mockResolvedValue({
      ok: true,
      openedInNewTab: true,
    });
  });

  it.each(["Choose a plan", "Compare plans"])(
    "allows subscribing to Pro from %s and shows every live-service allowance",
    async (buttonName) => {
      const user = userEvent.setup();
      render(
        <BillingStatusCard
          billing={billing}
          canManageBilling
          planUsage={{
            aiCredits: { used: 0, limit: 50 },
            emailsSent: 0,
            autoFollowUpEmailsSent: 0,
          }}
        />,
      );

      await user.click(screen.getByRole("button", { name: buttonName }));
      const dialog = within(screen.getByRole("dialog", { name: "Choose a plan" }));
      expect(dialog.getByRole("button", { name: "Default after trial" })).toBeDisabled();
      expect(dialog.queryByRole("button", { name: "Current plan" })).not.toBeInTheDocument();

      for (const [plan, allowance, retainedHighlight] of [
        ["Free", "2 live services", "20 Requo email sends per month"],
        ["Pro", "10 live services", "200 Requo email sends per month"],
        ["Business", "Unlimited live services", "About 165 AI quote drafts per month"],
      ]) {
        const card = dialog.getByRole("heading", { name: plan }).parentElement!;
        expect(within(card).getByText(allowance)).toBeInTheDocument();
        expect(within(card).getByText(retainedHighlight)).toBeInTheDocument();
      }

      await user.click(dialog.getByRole("button", { name: "Subscribe to Pro" }));
      expect(startPolarCheckout).toHaveBeenCalledWith({
        businessId: "trial-business",
        plan: "pro",
        interval: "monthly",
        returnTo: "/trial-business/home",
      });
    },
  );
});
