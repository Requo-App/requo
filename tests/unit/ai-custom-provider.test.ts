import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SELF_HOSTED_ENV = {
  REQUO_DEPLOYMENT_MODE: "self-hosted",
  AI_CUSTOM_BASE_URL: "http://127.0.0.1:11434/v1",
  AI_CUSTOM_MODEL: "qwen3:8b",
} as const;

function stubSelfHostedCustom(overrides: Record<string, string> = {}) {
  for (const [key, value] of Object.entries({
    ...SELF_HOSTED_ENV,
    ...overrides,
  })) {
    vi.stubEnv(key, value);
  }
}

beforeEach(() => {
  vi.resetModules();
  stubSelfHostedCustom();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("self-hosted custom AI provider", () => {
  it("adds the configured model to the catalog and every chat profile first", async () => {
    const { getCustomModelEntry } = await import("@/lib/ai/custom-provider");
    const { getModelCatalog } = await import("@/lib/ai/catalog");
    const { ROUTING_PROFILES } = await import("@/lib/ai/routing-profiles");
    const { selectModels } = await import("@/lib/ai/capacity-selector");

    expect(getCustomModelEntry()).toMatchObject({
      modelId: "custom:qwen3:8b",
      quality: 9,
      toolCapable: true,
    });
    expect(
      getModelCatalog().some((entry) => entry.modelId === "custom:qwen3:8b"),
    ).toBe(true);

    for (const profile of [
      "assistant_chat",
      "agent_chat",
      "quote_draft",
      "quote_improvement",
      "short_text",
    ] as const) {
      expect(ROUTING_PROFILES[profile].order[0], profile).toBe(
        "custom:qwen3:8b",
      );
    }

    expect(ROUTING_PROFILES.extraction.order).not.toContain(
      "custom:qwen3:8b",
    );

    const selected = await selectModels({ profile: "assistant_chat" });
    expect(selected[0]).toBe("custom:qwen3:8b");
  });

  it("honours tool capability and output/context limits", async () => {
    vi.stubEnv("AI_CUSTOM_TOOLS", "false");
    vi.stubEnv("AI_CUSTOM_MAX_OUTPUT_TOKENS", "4096");
    vi.stubEnv("AI_CUSTOM_CONTEXT_WINDOW", "2048");
    vi.resetModules();

    const { getCustomModelEntry } = await import("@/lib/ai/custom-provider");

    expect(getCustomModelEntry()).toMatchObject({
      toolCapable: false,
      maxOutputTokens: 4096,
      contextWindow: 4096,
    });
  });

  it("is ignored in Cloud mode", async () => {
    vi.stubEnv("REQUO_DEPLOYMENT_MODE", "cloud");
    vi.resetModules();

    const { getCustomModelEntry } = await import("@/lib/ai/custom-provider");
    const { getModelCatalog } = await import("@/lib/ai/catalog");
    const { ROUTING_PROFILES } = await import("@/lib/ai/routing-profiles");

    expect(getCustomModelEntry()).toBeNull();
    expect(
      getModelCatalog().some((entry) => entry.modelId.startsWith("custom:")),
    ).toBe(false);
    expect(
      ROUTING_PROFILES.assistant_chat.order.some((modelId) =>
        modelId.startsWith("custom:"),
      ),
    ).toBe(false);
  });
});
