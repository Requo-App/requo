import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/deployment", () => ({
  getDeploymentMode: () => "self-hosted",
  isCloudDeployment: () => false,
  isSelfHostedDeployment: () => true,
  selfHostedEntitlementPlan: "business",
}));

describe("self-hosted plan resolution", () => {
  it("uses the full product tier when a business has no subscription fields", async () => {
    const { resolveEffectivePlanFromSubscriptionFields } = await import(
      "@/lib/billing/subscription-service"
    );

    expect(resolveEffectivePlanFromSubscriptionFields(null)).toBe("business");
    expect(resolveEffectivePlanFromSubscriptionFields(undefined)).toBe(
      "business",
    );
    expect(
      resolveEffectivePlanFromSubscriptionFields({
        status: null,
        plan: null,
        currentPeriodEnd: null,
      }),
    ).toBe("business");
  });

  it("does not downgrade a self-hosted business from an ended subscription", async () => {
    const {
      resolveEffectivePlanFromSubscription,
      resolveEffectivePlanFromSubscriptionFields,
    } = await import("@/lib/billing/subscription-service");

    const endedSubscription = {
      status: "canceled" as const,
      plan: "pro",
      currentPeriodEnd: new Date(0),
    };

    expect(
      resolveEffectivePlanFromSubscriptionFields(endedSubscription),
    ).toBe("business");
    expect(
      resolveEffectivePlanFromSubscription(endedSubscription),
    ).toBe("business");
  });
});
