import { describe, expect, it } from "vitest";

import {
  aiDraftAllowanceLabels,
  aiDraftingClarification,
  annualBillingPromoCopy,
  planCatalog,
  pricingComparison,
} from "@/lib/plans/catalog";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import { planTiers } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";

describe("plan catalog", () => {
  it("exposes an entry for every plan", () => {
    for (const plan of planTiers) {
      expect(planCatalog[plan]).toBeDefined();
      expect(planCatalog[plan].id).toBe(plan);
      expect(planCatalog[plan].highlights.length).toBeGreaterThan(0);
    }
  });

  it("uses the approved description copy", () => {
    expect(planCatalog.free.description).toBe(
      "Run the complete inquiry-to-payment workflow for one service business.",
    );
    expect(planCatalog.pro.description).toContain("automatic follow-ups");
    expect(planCatalog.business.description).toContain("small team");
  });

  it("uses the approved AI drafting allowance labels", () => {
    expect(aiDraftAllowanceLabels.free).toBe(
      "About 10 AI quote drafts per month",
    );
    expect(aiDraftAllowanceLabels.pro).toBe(
      "About 50 AI quote drafts per month",
    );
    expect(aiDraftAllowanceLabels.business).toBe(
      "About 165 AI quote drafts per month",
    );
    expect(aiDraftingClarification).toContain("varies by the action");
    expect(annualBillingPromoCopy).toBe("Two months free");
  });

  it("keeps the pricing comparison to the approved four sections", () => {
    expect(pricingComparison.map((section) => section.category)).toEqual([
      "Core workflow",
      "Time savings",
      "Presentation and insights",
      "Team",
    ]);
  });

  it("derives numeric cells from the canonical usage limits", () => {
    const core = pricingComparison[0].features;
    const time = pricingComparison[1].features;
    const team = pricingComparison[3].features;

    const liveForms = core.find((row) => row.label === "Live services");
    expect(liveForms?.free).toBe(
      getUsageLimit("free", "liveServicesPerBusiness"),
    );
    expect(liveForms?.pro).toBe(
      getUsageLimit("pro", "liveServicesPerBusiness"),
    );
    expect(liveForms?.business).toBe("Unlimited");

    const sends = time.find(
      (row) => row.label === "Requo email sends per month",
    );
    expect(sends?.free).toBe(20);
    expect(sends?.business).toBe(500);

    const members = team.find((row) => row.label === "Members");
    expect(members?.business).toBe("Up to 5");
  });

  it("includes record exports on every plan", () => {
    const exportRow = pricingComparison
      .flatMap((section) => section.features)
      .find((row) => row.label.toLowerCase().includes("exports"));

    expect(exportRow?.label).toContain("CSV");
    expect(exportRow?.label).toContain("PDF");
    expect(exportRow?.label).toContain("PNG");
    expect(exportRow).toMatchObject({
      free: true,
      pro: true,
      business: true,
    });
    expect(planCatalog.free.highlights.join(" ")).toContain("PDF");

    for (const plan of planTiers) {
      expect(hasFeatureAccess(plan, "exports")).toBe(true);
    }
  });

  it("does not advertise removed or sold-separately capabilities", () => {
    const allLabels = pricingComparison.flatMap((section) =>
      section.features.map((row) => row.label),
    );
    expect(allLabels.join(" ").toLowerCase()).not.toContain("chat");
    expect(allLabels.join(" ").toLowerCase()).not.toContain("job");
    expect(allLabels.join(" ").toLowerCase()).not.toContain("support");
  });
});
