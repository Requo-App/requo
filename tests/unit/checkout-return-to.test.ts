import { describe, expect, it } from "vitest";

import { buildCheckoutSuccessPath } from "@/lib/auth/redirects";

describe("buildCheckoutSuccessPath", () => {
  it("appends checkout success parameters to a normal internal path", () => {
    expect(buildCheckoutSuccessPath("/acme/home", "pro")).toBe(
      "/acme/home?upgrade=success&plan=pro",
    );
  });

  it("omits the plan parameter without an active paid plan", () => {
    expect(buildCheckoutSuccessPath("/acme/home", null)).toBe(
      "/acme/home?upgrade=success",
    );
    expect(buildCheckoutSuccessPath("/acme/home", "free")).toBe(
      "/acme/home?upgrade=success",
    );
  });

  it("retains existing query parameters while appending success parameters", () => {
    expect(buildCheckoutSuccessPath("/acme/home?tab=billing", "business")).toBe(
      "/acme/home?tab=billing&upgrade=success&plan=business",
    );
  });

  it("never lets a fragment swallow the appended query parameters", () => {
    expect(buildCheckoutSuccessPath("/acme/home#section", "pro")).toBe(
      "/acme/home?upgrade=success&plan=pro",
    );
    expect(buildCheckoutSuccessPath("/acme/home?tab=billing#section", null)).toBe(
      "/acme/home?tab=billing&upgrade=success",
    );
  });

  it("degrades absolute and protocol-relative destinations to same-origin paths", () => {
    for (const destination of [
      "https://evil.example/x",
      "//evil.example/x",
    ]) {
      const result = buildCheckoutSuccessPath(destination, "pro");
      expect(result.startsWith("/")).toBe(true);
      expect(result).not.toContain("evil.example");
      expect(result).toContain("upgrade=success");
    }
  });
});
