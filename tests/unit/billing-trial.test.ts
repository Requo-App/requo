import { describe, expect, it } from "vitest";

import {
  getProTrialEndsAt,
  isTrialSubscription,
  resolveEffectivePlanFromSubscription,
  resolveEffectivePlanFromSubscriptionFields,
} from "@/lib/billing/subscription-service";
import { PRO_TRIAL_DAYS } from "@/lib/plans/plans";

const dayMs = 24 * 60 * 60 * 1000;
const now = new Date();

function trial(endsAt: Date | null, status: "trialing" = "trialing") {
  return {
    status,
    plan: "pro",
    currentPeriodEnd: endsAt,
    trialEndsAt: endsAt,
    provider: "polar",
  } as const;
}

describe("Pro trial resolution", () => {
  it("ends exactly PRO_TRIAL_DAYS after the start date", () => {
    expect(getProTrialEndsAt(now).getTime()).toBe(
      now.getTime() + PRO_TRIAL_DAYS * dayMs,
    );
  });

  it("grants Pro during the trial window", () => {
    const subscription = trial(new Date(now.getTime() + dayMs));

    expect(isTrialSubscription(subscription)).toBe(true);
    expect(resolveEffectivePlanFromSubscription(subscription)).toBe("pro");
  });

  it("falls back to Free once the trial window passes", () => {
    const subscription = trial(new Date(now.getTime() - 1));

    expect(isTrialSubscription(subscription)).toBe(false);
    expect(resolveEffectivePlanFromSubscription(subscription)).toBe("free");
  });

  it("treats a trialing row without a trial end as Free", () => {
    const subscription = trial(null);

    expect(isTrialSubscription(subscription)).toBe(false);
    expect(resolveEffectivePlanFromSubscription(subscription)).toBe("free");
  });

  it("resolves joined subscription fields the same way", () => {
    expect(
      resolveEffectivePlanFromSubscriptionFields({
        status: "trialing",
        plan: "pro",
        currentPeriodEnd: new Date(now.getTime() + dayMs),
        trialEndsAt: new Date(now.getTime() + dayMs),
      }),
    ).toBe("pro");

    expect(
      resolveEffectivePlanFromSubscriptionFields({
        status: "trialing",
        plan: "pro",
        currentPeriodEnd: new Date(now.getTime() - 1),
        trialEndsAt: new Date(now.getTime() - 1),
      }),
    ).toBe("free");
  });
});
