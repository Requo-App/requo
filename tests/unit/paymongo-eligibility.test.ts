import { describe, expect, it } from "vitest";

import {
  canBuyPlanWithPaymongo,
  isActivePrepaidSubscription,
  isPaidPolarSubscription,
  resolvePaymongoEligibility,
  type PaymongoSubscriptionLike,
} from "@/lib/billing/paymongo-eligibility";

const now = new Date("2026-11-01T12:00:00.000Z");

function subscription(
  overrides: Partial<PaymongoSubscriptionLike> = {},
): PaymongoSubscriptionLike {
  return {
    status: "active",
    plan: "pro",
    billingProvider: "polar",
    currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("resolvePaymongoEligibility", () => {
  it("offers QR Ph to a Philippine business without a subscription", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: "PH",
      configured: true,
      subscription: null,
      now,
    });

    expect(eligibility).toEqual({
      available: true,
      reason: null,
      renewablePlan: null,
      lockedUntil: null,
    });
  });

  it("accepts a lowercase country code with whitespace", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: " ph ",
      configured: true,
      subscription: null,
      now,
    });

    expect(eligibility.available).toBe(true);
  });

  it.each([null, undefined, "", "XX", "US", "PHL"])(
    "treats country %j as not in the Philippines",
    (countryCode) => {
      const eligibility = resolvePaymongoEligibility({
        countryCode,
        configured: true,
        subscription: null,
        now,
      });

      expect(eligibility.available).toBe(false);
      expect(eligibility.reason).toBe("country");
    },
  );

  it("stays unavailable when PayMongo is not configured, even in the Philippines", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: "PH",
      configured: false,
      subscription: null,
      now,
    });

    expect(eligibility.available).toBe(false);
    expect(eligibility.reason).toBe("not_configured");
  });

  it("does not offer QR Ph while a paid Polar subscription occupies billing", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: "PH",
      configured: true,
      subscription: subscription({ status: "active" }),
      now,
    });

    expect(eligibility.available).toBe(false);
    expect(eligibility.reason).toBe("polar_subscription");
  });

  it("allows QR Ph during a Polar trial because a trial is not paid", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: "PH",
      configured: true,
      subscription: subscription({
        status: "trialing",
        plan: "pro",
        currentPeriodEnd: new Date("2026-11-08T00:00:00.000Z"),
      }),
      now,
    });

    expect(eligibility.available).toBe(true);
    expect(eligibility.renewablePlan).toBeNull();
  });

  it("locks plan changes to the current prepaid plan until the term ends", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: "PH",
      configured: true,
      subscription: subscription({
        billingProvider: "paymongo",
        plan: "pro",
        currentPeriodEnd: new Date("2026-12-01T00:00:00.000Z"),
      }),
      now,
    });

    expect(eligibility).toEqual({
      available: true,
      reason: null,
      renewablePlan: "pro",
      lockedUntil: new Date("2026-12-01T00:00:00.000Z"),
    });

    expect(canBuyPlanWithPaymongo(eligibility, "pro")).toEqual({
      allowed: true,
    });
    expect(canBuyPlanWithPaymongo(eligibility, "business")).toEqual({
      allowed: false,
      reason: "plan_change",
    });
  });

  it("releases the plan lock once the prepaid term has ended", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: "PH",
      configured: true,
      subscription: subscription({
        billingProvider: "paymongo",
        plan: "business",
        currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
      }),
      now,
    });

    expect(eligibility.available).toBe(true);
    expect(eligibility.renewablePlan).toBeNull();
    expect(canBuyPlanWithPaymongo(eligibility, "pro")).toEqual({
      allowed: true,
    });
  });
});

describe("isPaidPolarSubscription", () => {
  it.each(["active", "past_due", "paused", "pending"] as const)(
    "counts a %s Polar row as occupying billing",
    (status) => {
      expect(
        isPaidPolarSubscription(subscription({ status }), now),
      ).toBe(true);
    },
  );

  it("counts a canceled Polar row only until its paid period ends", () => {
    expect(
      isPaidPolarSubscription(subscription({ status: "canceled" }), now),
    ).toBe(true);

    expect(
      isPaidPolarSubscription(
        subscription({
          status: "canceled",
          currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z"),
        }),
        now,
      ),
    ).toBe(false);
  });

  it("ignores a PayMongo row and a missing row", () => {
    expect(
      isPaidPolarSubscription(
        subscription({ billingProvider: "paymongo" }),
        now,
      ),
    ).toBe(false);
    expect(isPaidPolarSubscription(null, now)).toBe(false);
  });
});

describe("isActivePrepaidSubscription", () => {
  it("requires a PayMongo paid plan that has not reached its term end", () => {
    const active = subscription({ billingProvider: "paymongo" });

    expect(isActivePrepaidSubscription(active, now)).toBe(true);

    expect(
      isActivePrepaidSubscription(
        { ...active, currentPeriodEnd: new Date("2026-10-01T00:00:00.000Z") },
        now,
      ),
    ).toBe(false);

    expect(
      isActivePrepaidSubscription({ ...active, plan: "free" }, now),
    ).toBe(false);

    expect(
      isActivePrepaidSubscription({ ...active, status: "past_due" }, now),
    ).toBe(false);
  });
});

describe("canBuyPlanWithPaymongo", () => {
  it("reports the eligibility reason when QR Ph is unavailable", () => {
    const eligibility = resolvePaymongoEligibility({
      countryCode: "US",
      configured: true,
      subscription: null,
      now,
    });

    expect(canBuyPlanWithPaymongo(eligibility, "pro")).toEqual({
      allowed: false,
      reason: "country",
    });
  });
});
