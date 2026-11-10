import { afterEach, describe, expect, it, vi } from "vitest";

import { getAdminConfigMatrix } from "@/lib/admin/health-checks";

afterEach(() => vi.unstubAllEnvs());

describe("billing configuration matrix", () => {
  it("reports billing as not used in self-hosted mode", () => {
    vi.stubEnv("REQUO_DEPLOYMENT_MODE", "self-hosted");
    vi.stubEnv("POLAR_ACCESS_TOKEN", "");
    expect(getAdminConfigMatrix().find((row) => row.integration === "Billing"))
      .toEqual({ integration: "Billing", configured: true, notes: "Not used" });
  });

  it("continues to report Polar configuration in cloud mode", () => {
    vi.stubEnv("REQUO_DEPLOYMENT_MODE", "cloud");
    vi.stubEnv("POLAR_ACCESS_TOKEN", "");
    expect(getAdminConfigMatrix().find((row) => row.integration === "Billing"))
      .toEqual({ integration: "Billing", configured: false, notes: "Polar · not configured" });

    vi.stubEnv("POLAR_ACCESS_TOKEN", "test-token");
    vi.stubEnv("POLAR_WEBHOOK_SECRET", "test-secret");
    vi.stubEnv("POLAR_PRO_PRODUCT_ID", "test-product");
    vi.stubEnv("POLAR_SERVER", "sandbox");
    expect(getAdminConfigMatrix().find((row) => row.integration === "Billing"))
      .toEqual({ integration: "Billing", configured: true, notes: "Polar · sandbox" });
  });
});
