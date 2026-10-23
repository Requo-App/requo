import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Entitlement visibility tests.
 *
 * Validates that plan-gated features remain visible to all plans but are
 * properly gated when the current plan lacks access.
 *
 * Requirements:
 * - Free users can discover all features (visible but locked)
 * - Pro users can discover business-only features (visible but locked)
 * - All locked states show upgrade CTAs with required plan info
 * - No features are hidden solely due to plan restrictions
 */

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
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

// ── Imports ──────────────────────────────────────────────────────────────────

import { FeatureGate } from "@/features/entitlements/components/feature-gate";
import type { PlanTier } from "@/lib/plans/plans";
import type { PlanFeature } from "@/lib/plans/entitlements";
import type { UpgradeActionProps } from "@/features/entitlements/types";

const FREE_PLAN: PlanTier = "free";
const PRO_PLAN: PlanTier = "pro";

const mockUpgradeAction: UpgradeActionProps = {
  userId: "user-123",
  businessId: "biz-456",
  businessSlug: "test-business",
  currentPlan: FREE_PLAN,
};

describe("Entitlement visibility", () => {
  describe("FeatureGate action variant - free plan", () => {
    it("renders a locked action visibly disabled for a paid feature", async () => {
      const user = userEvent.setup();

      render(
        <FeatureGate
          feature="members"
          plan={FREE_PLAN}
          variant="action"
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite team member</button>
        </FeatureGate>,
      );

      const wrapper = screen.getByRole("group", {
        name: /Business plan required/i,
      });
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Invite team member")).toBeInTheDocument();

      await user.hover(wrapper);
      expect(
        await screen.findByRole("tooltip", { name: /Requires Business plan/i }),
      ).toBeInTheDocument();
    });

    it("opens the upgrade popover when clicked", async () => {
      const user = userEvent.setup();

      render(
        <FeatureGate
          feature="members"
          plan={FREE_PLAN}
          variant="action"
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite member</button>
        </FeatureGate>,
      );

      const wrapper = screen.getByRole("group");
      await user.click(wrapper);

      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Business Plan")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upgrade to Business/i }),
      ).toBeInTheDocument();
    });

    it("shows the correct plan requirement for each feature", () => {
      const proPaidFeatures: Array<{
        feature: PlanFeature;
        requiredPlan: string;
      }> = [
        { feature: "analyticsPerformance", requiredPlan: "Pro" },
        { feature: "emailTemplates", requiredPlan: "Pro" },
        { feature: "removeWatermark", requiredPlan: "Pro" },
        { feature: "autoFollowUps", requiredPlan: "Pro" },
      ];

      for (const { feature, requiredPlan } of proPaidFeatures) {
        const { unmount } = render(
          <FeatureGate feature={feature} plan={FREE_PLAN} variant="action">
            <button type="button">Action</button>
          </FeatureGate>,
        );

        expect(
          screen.getByRole("group", {
            name: new RegExp(`${requiredPlan} plan required`, "i"),
          }),
        ).toBeInTheDocument();

        unmount();
      }
    });

    it("allows keyboard interaction for locked actions", async () => {
      const user = userEvent.setup();

      render(
        <FeatureGate
          feature="members"
          plan={FREE_PLAN}
          variant="action"
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite member</button>
        </FeatureGate>,
      );

      const wrapper = screen.getByRole("group");
      await user.tab();
      expect(wrapper).toHaveFocus();

      await user.keyboard("{Enter}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("FeatureGate page variant - free plan", () => {
    it("shows preview content with a 'Demo data' badge when preview is provided", () => {
      render(
        <FeatureGate
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          variant="page"
          previewContent={<div data-testid="demo-chart">Demo analytics chart</div>}
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="real-content">Real analytics</div>
        </FeatureGate>,
      );

      expect(screen.getByTestId("demo-chart")).toBeInTheDocument();
      expect(screen.getByText("Demo analytics chart")).toBeInTheDocument();
      expect(screen.getByText("Demo data")).toBeInTheDocument();
      expect(screen.queryByTestId("real-content")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upgrade to Pro/i }),
      ).toBeInTheDocument();
    });

    it("shows an empty-state upgrade card when no preview is provided", () => {
      render(
        <FeatureGate
          feature="members"
          plan={FREE_PLAN}
          variant="page"
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="real-content">Real team members</div>
        </FeatureGate>,
      );

      expect(screen.queryByText("Demo data")).not.toBeInTheDocument();
      expect(screen.queryByTestId("real-content")).not.toBeInTheDocument();
      expect(screen.getByText("Team members")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upgrade to Business/i }),
      ).toBeInTheDocument();
    });

    it("shows a custom feature description in the upgrade prompt", () => {
      render(
        <FeatureGate
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          variant="page"
          description="Custom description for analytics"
          upgradeAction={mockUpgradeAction}
        >
          <div>Content</div>
        </FeatureGate>,
      );

      expect(
        screen.getByText("Custom description for analytics"),
      ).toBeInTheDocument();
    });
  });

  describe("FeatureGate block variant - free plan", () => {
    it("shows an upgrade card instead of content when locked", () => {
      render(
        <FeatureGate
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          variant="block"
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="premium-data">Premium analytics data</div>
        </FeatureGate>,
      );

      expect(screen.queryByTestId("premium-data")).not.toBeInTheDocument();
      expect(screen.getByText("Performance analytics")).toBeInTheDocument();
      expect(screen.getByText("Pro")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upgrade to Pro/i }),
      ).toBeInTheDocument();
    });

    it("renders children normally when the feature is available", () => {
      render(
        <FeatureGate feature="followUps" plan={FREE_PLAN} variant="block">
          <div data-testid="follow-ups-content">Follow-ups list</div>
        </FeatureGate>,
      );

      expect(screen.getByTestId("follow-ups-content")).toBeInTheDocument();
      expect(screen.getByText("Follow-ups list")).toBeInTheDocument();
      expect(screen.queryByText(/Upgrade to/i)).not.toBeInTheDocument();
    });
  });

  describe("FeatureGate - variant behavior", () => {
    it("action variant: disables with a popover for a locked feature", async () => {
      const user = userEvent.setup();

      render(
        <FeatureGate
          feature="members"
          plan={FREE_PLAN}
          variant="action"
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Export data</button>
        </FeatureGate>,
      );

      const wrapper = screen.getByRole("group");
      expect(wrapper).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Export data")).toBeInTheDocument();

      await user.click(wrapper);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Business Plan")).toBeInTheDocument();
    });

    it("block variant: shows an upgrade card instead of content", () => {
      render(
        <FeatureGate
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          variant="block"
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="analytics-content">Analytics chart</div>
        </FeatureGate>,
      );

      expect(screen.queryByTestId("analytics-content")).not.toBeInTheDocument();
      expect(screen.getByText("Performance analytics")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upgrade to Pro/i }),
      ).toBeInTheDocument();
    });

    it("page variant with preview: shows demo + upgrade banner", () => {
      render(
        <FeatureGate
          feature="emailTemplates"
          plan={FREE_PLAN}
          variant="page"
          previewContent={<div>Demo preview</div>}
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="real-content">Real content</div>
        </FeatureGate>,
      );

      expect(screen.getByText("Demo preview")).toBeInTheDocument();
      expect(screen.getByText("Demo data")).toBeInTheDocument();
      expect(screen.queryByTestId("real-content")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upgrade to Pro/i }),
      ).toBeInTheDocument();
    });

    it("page variant without preview: shows an empty-state upgrade card", () => {
      render(
        <FeatureGate
          feature="members"
          plan={FREE_PLAN}
          variant="page"
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="real-members">Team members list</div>
        </FeatureGate>,
      );

      expect(screen.queryByTestId("real-members")).not.toBeInTheDocument();
      expect(screen.getByText("Team members")).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /Upgrade to Business/i }),
      ).toBeInTheDocument();
    });
  });

  describe("Pro plan - business-tier features locked", () => {
    it("shows business-tier features locked for pro plan users", () => {
      const businessOnlyFeatures: PlanFeature[] = [
        "members",
        "auditLogs",
        "analyticsTeam",
      ];

      for (const feature of businessOnlyFeatures) {
        const { unmount } = render(
          <FeatureGate
            feature={feature}
            plan={PRO_PLAN}
            variant="action"
            upgradeAction={{ ...mockUpgradeAction, currentPlan: PRO_PLAN }}
          >
            <button type="button">Action</button>
          </FeatureGate>,
        );

        expect(
          screen.getByRole("group", { name: /Business plan required/i }),
        ).toBeInTheDocument();

        unmount();
      }
    });

    it("shows pro features unlocked for pro plan users", () => {
      render(
        <FeatureGate
          feature="analyticsPerformance"
          plan={PRO_PLAN}
          variant="action"
          upgradeAction={{ ...mockUpgradeAction, currentPlan: PRO_PLAN }}
        >
          <button type="button">View analytics</button>
        </FeatureGate>,
      );

      const button = screen.getByRole("button", { name: "View analytics" });
      expect(button).toBeInTheDocument();
      expect(button).not.toHaveAttribute("aria-disabled");
      expect(
        screen.queryByRole("group", { name: /required/i }),
      ).not.toBeInTheDocument();
    });
  });

  describe("Mixed-access page scenario", () => {
    it("renders accessible sections normally and inaccessible sections as locked blocks", () => {
      render(
        <div data-testid="analytics-page">
          <section data-testid="basic-analytics">
            <h2>Basic Analytics</h2>
            <p>Inquiry and quote counts</p>
          </section>

          <FeatureGate
            feature="analyticsPerformance"
            plan={FREE_PLAN}
            variant="block"
            upgradeAction={mockUpgradeAction}
          >
            <div data-testid="conversion-funnel">Conversion funnel chart</div>
          </FeatureGate>

          <FeatureGate
            feature="analyticsOperations"
            plan={FREE_PLAN}
            variant="block"
            upgradeAction={mockUpgradeAction}
          >
            <div data-testid="workflow-timing">Workflow timing data</div>
          </FeatureGate>
        </div>,
      );

      expect(screen.getByTestId("basic-analytics")).toBeInTheDocument();
      expect(screen.getByText("Basic Analytics")).toBeInTheDocument();
      expect(screen.queryByTestId("conversion-funnel")).not.toBeInTheDocument();
      expect(screen.getByText("Performance analytics")).toBeInTheDocument();
      expect(screen.queryByTestId("workflow-timing")).not.toBeInTheDocument();
      expect(screen.getByText("Operations analytics")).toBeInTheDocument();

      const upgradeButtons = screen.getAllByRole("button", {
        name: /Upgrade to/i,
      });
      expect(upgradeButtons).toHaveLength(2);
    });
  });

  describe("Accessibility", () => {
    it("locked actions have proper ARIA attributes", () => {
      render(
        <FeatureGate
          feature="members"
          plan={FREE_PLAN}
          variant="action"
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite member</button>
        </FeatureGate>,
      );

      const wrapper = screen.getByRole("group");
      expect(wrapper).toHaveAttribute("aria-disabled", "true");
      expect(wrapper).toHaveAttribute(
        "aria-label",
        expect.stringContaining("plan required"),
      );
      expect(wrapper).toHaveAttribute("tabIndex", "0");
    });

    it("upgrade cards have proper semantic structure", () => {
      render(
        <FeatureGate
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          variant="block"
          upgradeAction={mockUpgradeAction}
        >
          <div>Content</div>
        </FeatureGate>,
      );

      const region = screen.getByRole("region");
      expect(region).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Premium feature"),
      );
    });

    it("maintains keyboard navigation for all locked states", async () => {
      const user = userEvent.setup();

      render(
        <div>
          <FeatureGate feature="members" plan={FREE_PLAN} variant="action">
            <button type="button">Action 1</button>
          </FeatureGate>
          <FeatureGate feature="emailTemplates" plan={FREE_PLAN} variant="action">
            <button type="button">Action 2</button>
          </FeatureGate>
        </div>,
      );

      // Note: In real browsers, `inert` on the inner div prevents child focus.
      // jsdom does not implement `inert`, so the inner button is still a tab stop.
      await user.tab();
      expect(screen.getAllByRole("group")[0]).toHaveFocus();

      await user.tab(); // inner button of first group
      await user.tab(); // second group
      expect(screen.getAllByRole("group")[1]).toHaveFocus();
    });
  });

  describe("No features hidden by plan", () => {
    it("all plan-gated features remain visible as locked or unlocked states", () => {
      const features: PlanFeature[] = [
        "analyticsPerformance",
        "analyticsOperations",
        "analyticsTeam",
        "multipleServices",
        "servicePageCustomization",
        "emailTemplates",
        "removeWatermark",
        "autoFollowUps",
        "members",
        "auditLogs",
        "exports",
      ];

      for (const feature of features) {
        const { unmount } = render(
          <FeatureGate feature={feature} plan={FREE_PLAN} variant="action">
            <button type="button">Test action</button>
          </FeatureGate>,
        );

        const isLocked = screen.queryByRole("group", {
          name: /plan required/i,
        });
        const isUnlocked = screen.queryByRole("button", {
          name: "Test action",
        });

        expect(isLocked || isUnlocked).toBeTruthy();

        unmount();
      }
    });
  });
});
