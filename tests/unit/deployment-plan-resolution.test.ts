import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDeployment(mode: "cloud" | "self-hosted") {
  vi.stubEnv("REQUO_DEPLOYMENT_MODE", mode);
  vi.resetModules();

  return import("@/lib/deployment");
}

describe("deployment plan resolution", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("keeps the stored plan in Cloud mode", async () => {
    const { resolveDeploymentPlan } = await loadDeployment("cloud");

    expect(resolveDeploymentPlan("free")).toBe("free");
    expect(resolveDeploymentPlan("pro")).toBe("pro");
    expect(resolveDeploymentPlan("business")).toBe("business");
  });

  it("grants the full product tier in self-hosted mode", async () => {
    const { resolveDeploymentPlan } = await loadDeployment("self-hosted");

    expect(resolveDeploymentPlan("free")).toBe("business");
    expect(resolveDeploymentPlan("pro")).toBe("business");
  });
});
