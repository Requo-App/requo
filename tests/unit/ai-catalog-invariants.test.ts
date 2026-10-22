import { afterEach, describe, expect, it, vi } from "vitest";

import {
  EXTRACTION_MODEL_IDS,
  KNOWN_CATALOG_PROVIDERS,
  getBaseCatalog,
  getModelCatalog,
  getProviderOverride,
} from "@/lib/ai/catalog";
import { ROUTING_PROFILES } from "@/lib/ai/routing-profiles";

/**
 * Cross-file invariants for the free-tier allowlist.
 *
 * `lib/ai/catalog.ts` is the single source of truth, and routing profiles are
 * allowed to name only catalog entries. Without these checks a typo in a
 * profile silently drops a candidate, and a stray paid model identifier
 * becomes reachable through a profile.
 */

const catalog = getBaseCatalog();
const catalogIds = new Set(catalog.map((entry) => entry.modelId));

function providerOf(modelId: string): string {
  return modelId.split(":")[0] ?? "";
}

describe("AI catalog invariants", () => {
  it("has unique model identifiers", () => {
    expect(catalogIds.size).toBe(catalog.length);
  });

  it("uses only known registry provider prefixes", () => {
    const known = new Set<string>(KNOWN_CATALOG_PROVIDERS);
    for (const entry of catalog) {
      expect(known, entry.modelId).toContain(providerOf(entry.modelId));
    }
    // Every known provider must still have a model; a stale prefix would make
    // the registry look configured while selection can never choose it.
    expect(new Set(catalog.map((entry) => providerOf(entry.modelId)))).toEqual(
      known,
    );
  });

  it("contains no removed provider or model identifiers", () => {
    for (const entry of catalog) {
      expect(providerOf(entry.modelId)).not.toBe("cerebras");
      expect(providerOf(entry.modelId)).not.toBe("mistral");
    }

    const removedModelIds = [
      "google:gemini-2.5-flash",
      "google:gemini-2.5-pro",
      "mistral:mistral-small-latest",
      "mistral:mistral-medium-latest",
    ];
    for (const removed of removedModelIds) {
      expect(catalogIds.has(removed as `${string}:${string}`)).toBe(false);
    }
  });

  it("keeps the direct NVIDIA production fallback", () => {
    const nvidia = catalog.filter(
      (entry) => providerOf(entry.modelId) === "nvidia",
    );
    expect(nvidia.map((entry) => entry.modelId)).toEqual([
      "nvidia:openai/gpt-oss-20b",
    ]);
    expect(nvidia[0]?.toolCapable).toBe(false);
  });

  it("keeps OpenRouter entries on free routes", () => {
    const openRouter = catalog.filter(
      (entry) => providerOf(entry.modelId) === "openrouter",
    );
    expect(openRouter.length).toBeGreaterThan(0);
    for (const entry of openRouter) {
      expect(entry.modelId.endsWith(":free"), entry.modelId).toBe(true);
    }
  });

  it("publishes a positive limit for every shared quota dimension", () => {
    for (const entry of catalog) {
      for (const dimension of entry.sharedWithProvider) {
        expect(entry.limits[dimension], `${entry.modelId} ${dimension}`).toBeGreaterThan(
          0,
        );
      }
    }
  });

  it("models the neuron pool only for Cloudflare", () => {
    for (const entry of catalog) {
      const isCloudflare = providerOf(entry.modelId) === "cloudflare";
      expect(Boolean(entry.limits.neuronsPerMillion), entry.modelId).toBe(
        isCloudflare,
      );
    }
  });

  it("keeps metadata internally coherent", () => {
    for (const entry of catalog) {
      expect(entry.quality, entry.modelId).toBeGreaterThanOrEqual(1);
      expect(entry.quality, entry.modelId).toBeLessThanOrEqual(10);
      expect(entry.contextWindow, entry.modelId).toBeGreaterThan(0);
      expect(entry.maxOutputTokens, entry.modelId).toBeGreaterThan(0);
      expect(entry.maxOutputTokens, entry.modelId).toBeLessThanOrEqual(
        entry.contextWindow,
      );
      expect(entry.limits.rpm, entry.modelId).toBeGreaterThan(0);
      expect(entry.limits.rpd, entry.modelId).toBeGreaterThanOrEqual(0);
      expect(entry.limits.tpm, entry.modelId).toBeGreaterThanOrEqual(0);
      expect(entry.limits.tpd, entry.modelId).toBeGreaterThanOrEqual(0);
      expect(entry.costCentsPerMillion.input, entry.modelId).toBeGreaterThanOrEqual(0);
      expect(entry.costCentsPerMillion.output, entry.modelId).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("AI routing profile invariants", () => {
  it("names only catalog models", () => {
    for (const [profile, definition] of Object.entries(ROUTING_PROFILES)) {
      expect(definition.order.length, profile).toBeGreaterThan(0);
      for (const modelId of definition.order) {
        expect(catalogIds.has(modelId), `${profile} → ${modelId}`).toBe(true);
      }
    }
  });

  it("does not contradict its own constraints", () => {
    for (const [profile, definition] of Object.entries(ROUTING_PROFILES)) {
      for (const modelId of definition.order) {
        const entry = catalog.find((candidate) => candidate.modelId === modelId);
        expect(entry, `${profile} → ${modelId}`).toBeDefined();
        if (!entry) continue;

        expect(
          definition.excludedProviders.includes(providerOf(modelId)),
          `${profile} excludes ${providerOf(modelId)} but orders ${modelId}`,
        ).toBe(false);
        expect(entry.quality, `${profile} → ${modelId}`).toBeGreaterThanOrEqual(
          definition.minQuality,
        );
        if (definition.needsTools) {
          expect(entry.toolCapable, `${profile} → ${modelId}`).toBe(true);
        }
      }
    }
  });

  it("has no duplicate candidates within a profile", () => {
    for (const [profile, definition] of Object.entries(ROUTING_PROFILES)) {
      expect(new Set(definition.order).size, profile).toBe(
        definition.order.length,
      );
    }
  });

  it("keeps extraction on the importer's catalog models", () => {
    for (const modelId of EXTRACTION_MODEL_IDS) {
      expect(catalogIds.has(modelId), modelId).toBe(true);
    }
    expect(ROUTING_PROFILES.extraction.order).toEqual([
      ...EXTRACTION_MODEL_IDS,
    ]);
    for (const modelId of ROUTING_PROFILES.extraction.order) {
      expect(providerOf(modelId), modelId).toBe("google");
    }
  });
});

describe("AI provider quota overrides", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts the documented AI_*_GEMINI aliases for the google provider", () => {
    vi.stubEnv("AI_TPM_GEMINI", "123456");

    expect(getProviderOverride("google", "tpm", 1_000)).toBe(123_456);
    expect(getProviderOverride("gemini", "tpm", 1_000)).toBe(123_456);
    expect(
      getModelCatalog().find(
        (entry) => entry.modelId === "google:gemini-3.8-flash",
      )?.limits.tpm,
    ).toBe(123_456);
  });

  it("prefers the catalog-prefix AI_*_GOOGLE name when both are set", () => {
    vi.stubEnv("AI_TPM_GOOGLE", "222222");
    vi.stubEnv("AI_TPM_GEMINI", "123456");

    expect(getProviderOverride("google", "tpm", 1_000)).toBe(222_222);
  });

  it("still reads non-Gemini overrides by provider name", () => {
    vi.stubEnv("AI_RPD_GROQ", "777");

    expect(getProviderOverride("groq", "rpd", 1_000)).toBe(777);
  });
});
