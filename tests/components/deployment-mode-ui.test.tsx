import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/features/billing/start-checkout", () => ({
  startCheckout: vi.fn(),
}));

import { DeploymentModeProvider } from "@/components/providers/deployment-mode-provider";
import { UpgradeButton } from "@/features/billing/components/upgrade-button";
import { FeatureGate } from "@/features/entitlements/components/feature-gate";

function renderInMode(
  mode: "cloud" | "self-hosted",
  children: React.ReactNode,
) {
  return render(
    <DeploymentModeProvider mode={mode}>{children}</DeploymentModeProvider>,
  );
}

describe("deployment-aware billing UI", () => {
  it("hides upgrade prompts in self-hosted mode", () => {
    renderInMode(
      "self-hosted",
      <UpgradeButton
        businessId="business_1"
        businessSlug="acme"
        currentPlan="free"
        userId="user_1"
      />,
    );

    expect(screen.queryByRole("button")).toBeNull();
  });

  it("keeps upgrade prompts in Cloud mode", () => {
    renderInMode(
      "cloud",
      <UpgradeButton
        businessId="business_1"
        businessSlug="acme"
        currentPlan="free"
        userId="user_1"
      />,
    );

    expect(
      screen.getByRole("button", { name: /upgrade plan/i }),
    ).toBeInTheDocument();
  });

  it("renders Cloud-gated content in self-hosted mode", () => {
    renderInMode(
      "self-hosted",
      <FeatureGate feature="members" plan="free" variant="block">
        <p>Member management</p>
      </FeatureGate>,
    );

    expect(screen.getByText("Member management")).toBeInTheDocument();
  });
});
