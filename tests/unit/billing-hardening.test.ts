import { describe, expect, it } from "vitest";

import { getSafeAuthRedirectPath } from "@/lib/auth/redirects";
import { normalizeBillingCurrency } from "@/lib/billing/currency";
import { sanitizeSameOriginPath } from "@/lib/routing/safe-return-path";

describe("sanitizeSameOriginPath", () => {
  it("keeps a same-origin path with query and hash", () => {
    expect(
      sanitizeSameOriginPath("/acme/settings/billing?checkout=success#top"),
    ).toBe("/acme/settings/billing?checkout=success#top");
  });

  it.each([
    "https://evil.example/path",
    "//evil.example/path",
    "/\\evil.example",
    "\\\\evil.example",
    "/..//evil.example",
    "/a/..//evil.example",
    "javascript:alert(1)",
    "/api/billing/checkout",
    "",
  ])("rejects unsafe return path %j", (value) => {
    expect(sanitizeSameOriginPath(value)).toBeNull();
  });

  it("rejects control characters", () => {
    expect(sanitizeSameOriginPath("/ok\u0000")).toBeNull();
  });
});

describe("getSafeAuthRedirectPath", () => {
  it("uses the fallback for an off-origin path", () => {
    expect(getSafeAuthRedirectPath("/\\evil.example", "/login")).toBe(
      "/login",
    );
  });

  it("keeps a valid relative path", () => {
    expect(getSafeAuthRedirectPath("/admin/users?page=2")).toBe(
      "/admin/users?page=2",
    );
  });
});

describe("normalizeBillingCurrency", () => {
  it("normalizes Polar's lowercase currency codes", () => {
    expect(normalizeBillingCurrency("usd")).toBe("USD");
    expect(normalizeBillingCurrency("php")).toBe("PHP");
    expect(normalizeBillingCurrency("eur")).toBe("EUR");
  });

  it("defaults unsupported currencies to USD", () => {
    expect(normalizeBillingCurrency("jpy")).toBe("USD");
    expect(normalizeBillingCurrency(null)).toBe("USD");
  });
});
