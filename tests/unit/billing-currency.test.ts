import { describe, expect, it } from "vitest";

import { usesStoredBillingCurrency } from "@/lib/billing/subscription-service";
import type { SubscriptionStatus } from "@/lib/db/schema/subscriptions";

const now = new Date("2026-10-29T00:00:00Z");

function subscription(
  status: SubscriptionStatus,
  currentPeriodEnd: Date | null = null,
) {
  return { status, currentPeriodEnd };
}

describe("billing currency authority", () => {
  it.each(["active", "past_due", "paused"] as const)(
    "keeps the stored currency for %s subscriptions",
    (status) => {
      expect(usesStoredBillingCurrency(subscription(status), now)).toBe(true);
    },
  );

  it("keeps the stored currency while a canceled subscription is still in period", () => {
    const currentPeriodEnd = new Date(now.getTime() + 60_000);

    expect(
      usesStoredBillingCurrency(
        subscription("canceled", currentPeriodEnd),
        now,
      ),
    ).toBe(true);
  });

  it("uses the checkout market once a canceled period has ended", () => {
    const currentPeriodEnd = new Date(now.getTime() - 60_000);

    expect(
      usesStoredBillingCurrency(
        subscription("canceled", currentPeriodEnd),
        now,
      ),
    ).toBe(false);
  });

  it("uses the checkout market for free, trial, expired, and pending rows", () => {
    for (const status of [
      "free",
      "trialing",
      "expired",
      "pending",
      "incomplete",
    ] as const) {
      expect(
        usesStoredBillingCurrency(
          subscription(status, new Date(now.getTime() + 60_000)),
          now,
        ),
      ).toBe(false);
    }
  });
});
