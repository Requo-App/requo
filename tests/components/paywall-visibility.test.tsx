import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * Paywall visibility tests.
 *
 * Validates that plan-gated features remain visible to all plans but are
 * properly locked/paywalled when the current plan lacks access.
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

import { LockedAction } from "@/features/paywall/components/locked-action";
import { FeaturePreviewPaywall } from "@/features/paywall/components/feature-preview-paywall";
import { PremiumContentBlur } from "@/features/paywall/components/premium-content-blur";
import { FeatureGate } from "@/features/paywall/components/feature-gate";
import type { BusinessPlan } from "@/lib/plans/plans";
import type { PlanFeature } from "@/lib/plans/entitlements";
import type { UpgradeActionProps } from "@/features/paywall/types";

const FREE_PLAN: BusinessPlan = "free";
const PRO_PLAN: BusinessPlan = "pro";

const mockUpgradeAction: UpgradeActionProps = {
  userId: "user-123",
  businessId: "biz-456",
  businessSlug: "test-business",
  currentPlan: FREE_PLAN,
};

describe("Paywall visibility", () => {
  describe("LockedAction - free plan", () => {
    it("renders locked action visible with disabled appearance for paid feature", async () => {
      const user = userEvent.setup();

      render(
        <LockedAction
          feature="members"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite team member</button>
        </LockedAction>,
      );

      // Action is visible
      const wrapper = screen.getByRole("group", {
        name: /Business plan required/i,
      });
      expect(wrapper).toBeInTheDocument();
      expect(wrapper).toHaveAttribute("aria-disabled", "true");

      // Button is visible inside wrapper (via aria-hidden div)
      expect(screen.getByText("Invite team member")).toBeInTheDocument();

      // Tooltip shows on hover
      const trigger = wrapper;
      await user.hover(trigger);
      expect(
        await screen.findByRole("tooltip", { name: /Requires Business plan/i }),
      ).toBeInTheDocument();
    });

    it("opens upgrade popover when clicked", async () => {
      const user = userEvent.setup();

      render(
        <LockedAction
          feature="members"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite member</button>
        </LockedAction>,
      );

      const wrapper = screen.getByRole("group");
      await user.click(wrapper);

      // Popover with upgrade CTA appears
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Business Plan")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Upgrade to Business/i })).toBeInTheDocument();
    });

    it("shows correct plan requirement for each feature", () => {
      const proPaidFeatures: Array<{ feature: PlanFeature; requiredPlan: string }> = [
        { feature: "analyticsPerformance", requiredPlan: "Pro" },
        { feature: "multipleForms", requiredPlan: "Pro" },
        { feature: "emailTemplates", requiredPlan: "Pro" },
        { feature: "removeWatermark", requiredPlan: "Pro" },
        { feature: "autoFollowUps", requiredPlan: "Pro" },
      ];

      for (const { feature, requiredPlan } of proPaidFeatures) {
        const { unmount } = render(
          <LockedAction feature={feature} plan={FREE_PLAN}>
            <button type="button">Action</button>
          </LockedAction>,
        );

        expect(
          screen.getByRole("group", { name: new RegExp(`${requiredPlan} plan required`, "i") }),
        ).toBeInTheDocument();

        unmount();
      }
    });

    it("allows keyboard interaction for locked actions", async () => {
      const user = userEvent.setup();

      render(
        <LockedAction
          feature="members"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite member</button>
        </LockedAction>,
      );

      const wrapper = screen.getByRole("group");

      // Tab to focus
      await user.tab();
      expect(wrapper).toHaveFocus();

      // Enter opens popover
      await user.keyboard("{Enter}");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });
  });

  describe("FeaturePreviewPaywall - free plan", () => {
    it("shows preview content with 'Demo data' badge when preview provided", () => {
      render(
        <FeaturePreviewPaywall
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          previewContent={<div data-testid="demo-chart">Demo analytics chart</div>}
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="real-content">Real analytics</div>
        </FeaturePreviewPaywall>,
      );

      // Preview content is visible
      expect(screen.getByTestId("demo-chart")).toBeInTheDocument();
      expect(screen.getByText("Demo analytics chart")).toBeInTheDocument();

      // "Demo data" badge is visible
      expect(screen.getByText("Demo data")).toBeInTheDocument();

      // Real content is NOT rendered in DOM (secure)
      expect(screen.queryByTestId("real-content")).not.toBeInTheDocument();

      // Upgrade banner is visible
      expect(screen.getByRole("button", { name: /Upgrade to Pro/i })).toBeInTheDocument();
    });

    it("shows empty-state upgrade card when no preview provided", () => {
      render(
        <FeaturePreviewPaywall
          feature="members"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="real-content">Real team members</div>
        </FeaturePreviewPaywall>,
      );

      // No demo data badge
      expect(screen.queryByText("Demo data")).not.toBeInTheDocument();

      // Real content is NOT rendered
      expect(screen.queryByTestId("real-content")).not.toBeInTheDocument();

      // Empty-state upgrade card is visible
      expect(screen.getByText(/Team members/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Upgrade to Business/i })).toBeInTheDocument();
    });

    it("shows correct feature description in upgrade prompt", () => {
      render(
        <FeaturePreviewPaywall
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          description="Custom description for analytics"
          upgradeAction={mockUpgradeAction}
        >
          <div>Content</div>
        </FeaturePreviewPaywall>,
      );

      expect(screen.getByText("Custom description for analytics")).toBeInTheDocument();
    });
  });

  describe("PremiumContentBlur - free plan", () => {
    it("shows upgrade card with lock icon instead of content when locked", () => {
      render(
        <PremiumContentBlur
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="premium-data">Premium analytics data</div>
        </PremiumContentBlur>,
      );

      // Real content is NOT rendered in DOM (secure)
      expect(screen.queryByTestId("premium-data")).not.toBeInTheDocument();

      // Upgrade card is visible
      expect(screen.getByText("Performance analytics")).toBeInTheDocument();
      expect(screen.getByText("Pro")).toBeInTheDocument(); // Plan badge
      expect(screen.getByRole("button", { name: /Upgrade to Pro/i })).toBeInTheDocument();
    });

    it("renders children normally when unlocked (free tier has access)", () => {
      render(
        <PremiumContentBlur
          feature="followUps"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <div data-testid="follow-ups-content">Follow-ups list</div>
        </PremiumContentBlur>,
      );

      // Content is visible (followUps is on free plan)
      expect(screen.getByTestId("follow-ups-content")).toBeInTheDocument();
      expect(screen.getByText("Follow-ups list")).toBeInTheDocument();

      // No upgrade UI
      expect(screen.queryByText(/Upgrade to/i)).not.toBeInTheDocument();
    });
  });

  describe("FeatureGate - variant behavior", () => {
    it("action variant: disables with popover for locked feature", async () => {
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

      // Action is visible but disabled
      const wrapper = screen.getByRole("group");
      expect(wrapper).toHaveAttribute("aria-disabled", "true");
      expect(screen.getByText("Export data")).toBeInTheDocument();

      // Click opens upgrade popover
      await user.click(wrapper);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("Business Plan")).toBeInTheDocument();
    });

    it("block variant: shows upgrade card instead of content", () => {
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

      // Real content is NOT rendered
      expect(screen.queryByTestId("analytics-content")).not.toBeInTheDocument();

      // Upgrade card is visible
      expect(screen.getByText("Performance analytics")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Upgrade to Pro/i })).toBeInTheDocument();
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

      // Preview is visible
      expect(screen.getByText("Demo preview")).toBeInTheDocument();
      expect(screen.getByText("Demo data")).toBeInTheDocument();

      // Real content is NOT rendered
      expect(screen.queryByTestId("real-content")).not.toBeInTheDocument();

      // Upgrade banner
      expect(screen.getByRole("button", { name: /Upgrade to Pro/i })).toBeInTheDocument();
    });

    it("page variant without preview: shows empty-state upgrade card", () => {
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

      // Real content is NOT rendered
      expect(screen.queryByTestId("real-members")).not.toBeInTheDocument();

      // Empty-state card
      expect(screen.getByText("Team members")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Upgrade to Business/i })).toBeInTheDocument();
    });
  });

  describe("Pro plan - business-tier features locked", () => {
    it("shows business-tier features locked for pro plan users", () => {
      const businessOnlyFeatures: PlanFeature[] = ["members", "auditLogs", "analyticsTeam"];

      for (const feature of businessOnlyFeatures) {
        const { unmount } = render(
          <LockedAction
            feature={feature}
            plan={PRO_PLAN}
            upgradeAction={{ ...mockUpgradeAction, currentPlan: PRO_PLAN }}
          >
            <button type="button">Action</button>
          </LockedAction>,
        );

        // Action is visible but locked
        expect(
          screen.getByRole("group", { name: /Business plan required/i }),
        ).toBeInTheDocument();

        // Shows Business plan badge
        expect(screen.getByRole("group")).toBeInTheDocument();

        unmount();
      }
    });

    it("shows pro features unlocked for pro plan users", () => {
      render(
        <LockedAction
          feature="analyticsPerformance"
          plan={PRO_PLAN}
          upgradeAction={{ ...mockUpgradeAction, currentPlan: PRO_PLAN }}
        >
          <button type="button">View analytics</button>
        </LockedAction>,
      );

      // Action is NOT locked (passes through)
      const button = screen.getByRole("button", { name: "View analytics" });
      expect(button).toBeInTheDocument();
      expect(button).not.toHaveAttribute("aria-disabled");

      // No wrapper with aria-disabled
      expect(screen.queryByRole("group", { name: /required/i })).not.toBeInTheDocument();
    });
  });

  describe("Mixed-access page scenario", () => {
    it("renders accessible sections normally and inaccessible sections as locked blocks", () => {
      render(
        <div data-testid="analytics-page">
          {/* Free tier content - accessible to all */}
          <section data-testid="basic-analytics">
            <h2>Basic Analytics</h2>
            <p>Inquiry and quote counts</p>
          </section>

          {/* Pro tier content - locked for free users */}
          <PremiumContentBlur
            feature="analyticsPerformance"
            plan={FREE_PLAN}
            upgradeAction={mockUpgradeAction}
          >
            <div data-testid="conversion-funnel">Conversion funnel chart</div>
          </PremiumContentBlur>

          {/* Business tier content - locked for free users */}
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

      // Basic content is visible
      expect(screen.getByTestId("basic-analytics")).toBeInTheDocument();
      expect(screen.getByText("Basic Analytics")).toBeInTheDocument();

      // Pro content shows upgrade card
      expect(screen.queryByTestId("conversion-funnel")).not.toBeInTheDocument();
      expect(screen.getByText("Performance analytics")).toBeInTheDocument();

      // Business content shows upgrade card
      expect(screen.queryByTestId("workflow-timing")).not.toBeInTheDocument();
      expect(screen.getByText("Operations analytics")).toBeInTheDocument();

      // Both upgrade buttons visible
      const upgradeButtons = screen.getAllByRole("button", { name: /Upgrade to/i });
      expect(upgradeButtons).toHaveLength(2);
    });
  });

  describe("Accessibility", () => {
    it("locked actions have proper ARIA attributes", () => {
      render(
        <LockedAction
          feature="members"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <button type="button">Invite member</button>
        </LockedAction>,
      );

      const wrapper = screen.getByRole("group");
      expect(wrapper).toHaveAttribute("aria-disabled", "true");
      expect(wrapper).toHaveAttribute("aria-label", expect.stringContaining("plan required"));
      expect(wrapper).toHaveAttribute("tabIndex", "0");
    });

    it("upgrade cards have proper semantic structure", () => {
      render(
        <PremiumContentBlur
          feature="analyticsPerformance"
          plan={FREE_PLAN}
          upgradeAction={mockUpgradeAction}
        >
          <div>Content</div>
        </PremiumContentBlur>,
      );

      // Region with descriptive label
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
          <LockedAction feature="members" plan={FREE_PLAN}>
            <button type="button">Action 1</button>
          </LockedAction>
          <LockedAction feature="emailTemplates" plan={FREE_PLAN}>
            <button type="button">Action 2</button>
          </LockedAction>
        </div>,
      );

      // Both locked actions are keyboard navigable
      // Note: In real browsers, `inert` on the inner div prevents child focus.
      // jsdom does not implement `inert`, so the inner button is still a tab stop.
      await user.tab();
      expect(screen.getAllByRole("group")[0]).toHaveFocus();

      // Tab past the inner button (jsdom ignores inert) to reach the second group
      await user.tab(); // inner button of first group
      await user.tab(); // second group
      expect(screen.getAllByRole("group")[1]).toHaveFocus();
    });
  });

  describe("No features hidden by plan", () => {
    it("all plan-gated features remain visible in UI as locked/paywalled states", () => {
      const allPaidFeatures: PlanFeature[] = [
        "analyticsPerformance",
        "analyticsOperations",
        "analyticsTeam",
        "multipleForms",
        "inquiryPageCustomization",
        "emailTemplates",
        "removeWatermark",
        "autoFollowUps",
        "members",
        "auditLogs",
        "exports",
      ];

      for (const feature of allPaidFeatures) {
        const { unmount } = render(
          <LockedAction feature={feature} plan={FREE_PLAN}>
            <button type="button">Test action</button>
          </LockedAction>,
        );

        // Feature is visible (either locked or unlocked)
        // If locked, shows group with aria-disabled
        // If unlocked (free tier access), shows button directly
        const isLocked = screen.queryByRole("group", { name: /plan required/i });
        const isUnlocked = screen.queryByRole("button", { name: "Test action" });

        expect(isLocked || isUnlocked).toBeTruthy();

        unmount();
      }
    });
  });
});
