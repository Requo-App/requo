import { afterEach, describe, expect, it, vi } from "vitest";

import {
  defaultDeploymentMode,
  parseDeploymentMode,
} from "@/lib/deployment-mode";
import { getUnifiedSettingsNavigation } from "@/features/settings/navigation";

describe("deployment mode configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps Cloud behavior when the variable is missing or blank", () => {
    expect(defaultDeploymentMode).toBe("cloud");
    expect(parseDeploymentMode(undefined)).toBe("cloud");
    expect(parseDeploymentMode(null)).toBe("cloud");
    expect(parseDeploymentMode("")).toBe("cloud");
    expect(parseDeploymentMode("   ")).toBe("cloud");
  });

  it("accepts the two supported modes", () => {
    expect(parseDeploymentMode("cloud")).toBe("cloud");
    expect(parseDeploymentMode("self-hosted")).toBe("self-hosted");
    expect(parseDeploymentMode(" self-hosted ")).toBe("self-hosted");
  });

  it("rejects unsupported values with a clear configuration error", () => {
    expect(() => parseDeploymentMode("Self-Hosted")).toThrow(
      /REQUO_DEPLOYMENT_MODE/,
    );
    expect(() => parseDeploymentMode("staging")).toThrow(/self-hosted/);
  });

  it("is independent of NODE_ENV", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(parseDeploymentMode("self-hosted")).toBe("self-hosted");

    vi.stubEnv("NODE_ENV", "development");
    expect(parseDeploymentMode("self-hosted")).toBe("self-hosted");
    expect(parseDeploymentMode("cloud")).toBe("cloud");
  });
});

describe("settings navigation deployment filtering", () => {
  it("omits the Cloud billing section when billing is disabled", () => {
    const labels = getUnifiedSettingsNavigation("acme", {
      includeBilling: false,
    })
      .flatMap((group) => group.items.map((item) => item.label))
      .join("\n");

    expect(labels).not.toContain("Billing");
  });

  it("keeps the billing section by default", () => {
    const labels = getUnifiedSettingsNavigation("acme")
      .flatMap((group) => group.items.map((item) => item.label))
      .join("\n");

    expect(labels).toContain("Billing");
  });
});
