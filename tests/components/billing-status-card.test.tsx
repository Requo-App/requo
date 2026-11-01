import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BillingStatusCard } from "@/features/billing/components/billing-status-card";
import { startCheckout } from "@/features/billing/start-checkout";
import type { BusinessBillingOverview } from "@/features/billing/types";

vi.mock("@/features/billing/actions", () => ({
  startBusinessTrialAction: vi.fn(),
}));

vi.mock("@/features/billing/start-checkout", () => ({
  startCheckout: vi.fn(),
}));

const billing: BusinessBillingOverview = {
  userId: "trial-owner",
  businessId: "trial-business",
  businessName: "Trial business",
  businessSlug: "trial-business",
  currentPlan: "pro",
  billingCurrency: "EUR",
  qrPh: {
    available: false,
    reason: "country",
    renewablePlan: null,
    lockedUntil: null,
  },
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

describe("expired prepaid billing summary", () => {
  it("names the paid plan a QR Ph renewal restores", () => {
    render(
      <BillingStatusCard
        billing={{
          ...billing,
          currentPlan: "free",
          canStartTrial: false,
          subscription: {
            status: "expired",
            plan: "pro",
            provider: "paymongo",
            currency: "PHP",
            paymentMethod: "QR Ph",
            currentPeriodStart: new Date("2019-12-15"),
            currentPeriodEnd: new Date("2020-01-15"),
            trialEndsAt: null,
            canceledAt: null,
            providerSubscriptionId: null,
            providerCustomerId: null,
          },
        }}
        canManageBilling
        planUsage={{
          aiCredits: { used: 0, limit: 50 },
          emailsSent: 0,
          autoFollowUpEmailsSent: 0,
        }}
      />,
    );

    expect(
      screen.getByText(/Renew with QR Ph to restore Pro features/),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/Renew with QR Ph to restore Free features/),
    ).not.toBeInTheDocument();
  });
});

describe("trial billing plan selection without a checkout provider", () => {
  beforeEach(() => {
    vi.mocked(startCheckout).mockReset();
    vi.mocked(startCheckout).mockResolvedValue({
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
      expect(startCheckout).toHaveBeenCalledWith({
        businessId: "trial-business",
        plan: "pro",
        interval: "monthly",
        provider: "polar",
        returnTo: "/trial-business/home",
      });
    },
  );
});
