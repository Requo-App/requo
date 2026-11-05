import { describe, expect, it, vi } from "vitest";

/**
 * Verifies server-side self-hosted enforcement, not just the environment
 * parser. The deployment helper is replaced for the whole module graph so
 * route handlers and jobs take their self-hosted branches before doing any
 * authentication, provider initialization, or database work.
 */
vi.mock("@/lib/deployment", () => ({
  getDeploymentMode: () => "self-hosted",
  isCloudDeployment: () => false,
  isSelfHostedDeployment: () => true,
  selfHostedEntitlementPlan: "business",
}));

describe("self-hosted Cloud route guards", () => {
  it("does not expose the machine-readable pricing mirror", async () => {
    const { GET } = await import("@/app/pricing.md/route");

    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.text()).resolves.toBe("Not Found");
  });

  it("refuses subscription checkout before reading a session", async () => {
    const { POST } = await import("@/app/api/billing/checkout/route");

    const response = await POST(
      new Request("http://localhost/api/billing/checkout", {
        body: "{}",
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
  });

  it("refuses Requo Cloud webhook events without processing them", async () => {
    const { POST } = await import("@/app/api/billing/paymongo/webhook/route");

    const response = await POST(
      new Request("http://localhost/api/billing/paymongo/webhook", {
        body: "{}",
        method: "POST",
      }),
    );

    expect(response.status).toBe(404);
  });

  it("does not run the subscription expiry job", async () => {
    const { processExpiredSubscriptions } = await import(
      "@/lib/billing/jobs/expire-subscriptions"
    );

    await expect(processExpiredSubscriptions()).resolves.toEqual({
      processed: 0,
      succeeded: 0,
      failed: 0,
    });
  });
});
