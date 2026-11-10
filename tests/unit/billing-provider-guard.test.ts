import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    REQUO_BILLING_DRIVER: "paymongo",
    REQUO_DEPLOYMENT_MODE: "cloud",
  },
}));

import {
  getBillingDriver,
  isBillingProviderEnabled,
} from "@/lib/deployment";

describe("billing provider selection", () => {
  it("only enables the provider selected by the billing driver", () => {
    expect(getBillingDriver()).toBe("paymongo");
    expect(isBillingProviderEnabled("paymongo")).toBe(true);
    expect(isBillingProviderEnabled("polar")).toBe(false);
  });
});
