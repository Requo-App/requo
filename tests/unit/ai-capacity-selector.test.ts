import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, number>(),
}));

vi.mock("@/lib/ai/cache-layer", () => ({
  cacheLayer: {
    get: vi.fn(async (key: string) => mocks.store.get(key) ?? null),
    set: vi.fn(async (key: string, value: number) => {
      mocks.store.set(key, value);
    }),
    increment: vi.fn(async (key: string) => {
      const next = (mocks.store.get(key) ?? 0) + 1;
      mocks.store.set(key, next);
      return next;
    }),
    incrementBy: vi.fn(async (key: string, delta: number) => {
      const next = (mocks.store.get(key) ?? 0) + delta;
      mocks.store.set(key, next);
      return next;
    }),
    delete: vi.fn(async (key: string) => {
      mocks.store.delete(key);
    }),
  },
}));

vi.mock("@/lib/env", () => ({
  isGroqConfigured: true,
  isGeminiConfigured: true,
  isOpenRouterConfigured: true,
  isCloudflareAiConfigured: true,
  isNvidiaNimConfigured: true,
}));

vi.mock("@/lib/ai/errors", () => ({
  classifyExhaustionScope: vi.fn(() => "day"),
}));

import {
  CLOUDFLARE_DAILY_NEURON_POOL,
  getModelCatalog,
  getNeuronPoolOverride,
  type ModelEntry,
} from "@/lib/ai/catalog";
import {
  getModelQuotaState,
  markModelExhausted,
  selectModels,
} from "@/lib/ai/capacity-selector";

/**
 * The 80% threshold only deprioritizes; 100% is a hard stop. These tests pin
 * that distinction and the shared-bucket accounting that makes it meaningful.
 */

function entry(modelId: string): ModelEntry {
  const found = getModelCatalog().find((candidate) => candidate.modelId === modelId);
  if (!found) throw new Error(`Missing catalog entry ${modelId}`);
  return found;
}

function rpdKey(modelId: string): string {
  return `cap:rpd:${modelId}`;
}

beforeEach(() => {
  mocks.store.clear();
});

describe("capacity selection quota ceiling", () => {
  it("keeps a model at exactly 100% before the next request", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    expect(gemini.limits.rpd).toBeGreaterThan(0);
    mocks.store.set(rpdKey(gemini.modelId), gemini.limits.rpd - 1);

    const selected = await selectModels({
      profile: "assistant_chat",
      estimatedTokens: 100,
    });

    expect(selected).toContain(gemini.modelId);
  });

  it("drops a model once the next request would exceed its daily quota", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    mocks.store.set(rpdKey(gemini.modelId), gemini.limits.rpd);

    const selected = await selectModels({
      profile: "assistant_chat",
      estimatedTokens: 100,
    });

    expect(selected).not.toContain(gemini.modelId);
  });

  it("drops every model when a shared provider request bucket is full", async () => {
    const groq = entry("groq:openai/gpt-oss-120b");
    mocks.store.set("cap:provider:rpm:groq", groq.limits.rpm);

    const selected = await selectModels({
      profile: "assistant_chat",
      estimatedTokens: 100,
    });

    expect(selected.filter((id) => id.startsWith("groq:"))).toEqual([]);
  });

  it("drops Cloudflare when the shared neuron pool is exhausted", async () => {
    const pool = getNeuronPoolOverride(CLOUDFLARE_DAILY_NEURON_POOL);
    mocks.store.set("cap:neurons:cloudflare", pool * 1000);

    const selected = await selectModels({
      profile: "assistant_chat",
      estimatedTokens: 100,
    });

    expect(selected.filter((id) => id.startsWith("cloudflare:"))).toEqual([]);
  });

  it("cools a provider's shared request bucket after a daily failure", async () => {
    const groq = entry("groq:openai/gpt-oss-20b");
    await markModelExhausted(groq.modelId, new Error("daily quota"));

    await expect(getModelQuotaState(groq.modelId)).resolves.toBe(
      "exhausted",
    );
  });

  it("cools the shared neuron pool after a daily Cloudflare failure", async () => {
    const cloudflare = entry("cloudflare:@cf/openai/gpt-oss-120b");
    await markModelExhausted(cloudflare.modelId, new Error("daily quota"));

    await expect(getModelQuotaState(cloudflare.modelId)).resolves.toBe(
      "exhausted",
    );
  });
});

describe("getModelQuotaState", () => {
  it("distinguishes stressed from exhausted", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    mocks.store.set(rpdKey(gemini.modelId), gemini.limits.rpd - 1);
    await expect(getModelQuotaState(gemini.modelId)).resolves.toBe("stressed");

    mocks.store.set(rpdKey(gemini.modelId), gemini.limits.rpd);
    await expect(getModelQuotaState(gemini.modelId)).resolves.toBe("exhausted");
  });

  it("reports unknown catalog entries and dead identifiers", async () => {
    await expect(
      getModelQuotaState("groq:retired-model"),
    ).resolves.toBe("unknown");

    const groq = entry("groq:openai/gpt-oss-120b");
    mocks.store.set(`cap:dead:${groq.modelId}`, 1);
    await expect(getModelQuotaState(groq.modelId)).resolves.toBe("dead");
  });
});
