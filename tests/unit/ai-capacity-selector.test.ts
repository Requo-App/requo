import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  store: new Map<string, number>(),
  ttls: new Map<string, number>(),
  scope: "day" as "day" | "minute",
}));

vi.mock("@/lib/ai/cache-layer", () => ({
  cacheLayer: {
    get: vi.fn(async (key: string) => mocks.store.get(key) ?? null),
    set: vi.fn(async (key: string, value: number, ttlSeconds: number) => {
      mocks.store.set(key, value);
      mocks.ttls.set(key, ttlSeconds);
    }),
    increment: vi.fn(async (key: string, ttlSeconds: number) => {
      const next = (mocks.store.get(key) ?? 0) + 1;
      mocks.store.set(key, next);
      mocks.ttls.set(key, ttlSeconds);
      return next;
    }),
    incrementBy: vi.fn(async (key: string, delta: number, ttlSeconds: number) => {
      const next = (mocks.store.get(key) ?? 0) + delta;
      mocks.store.set(key, next);
      mocks.ttls.set(key, ttlSeconds);
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
  classifyExhaustionScope: vi.fn(() => mocks.scope),
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
  recordModelUsage,
  selectModels,
} from "@/lib/ai/capacity-selector";
import { EMBEDDING_MODEL_ID } from "@/lib/ai/embedding-constants";

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

function rpmKey(modelId: string): string {
  return `cap:rpm:${modelId}`;
}

function tpmKey(modelId: string): string {
  return `cap:tpm:${modelId}`;
}

function tpdKey(modelId: string): string {
  return `cap:tpd:${modelId}`;
}

function providerKey(
  dimension: "rpm" | "rpd" | "tpm" | "tpd",
  provider: string,
): string {
  return `cap:provider:${dimension}:${provider}`;
}

const EXHAUSTED = 99_999;

beforeEach(() => {
  mocks.store.clear();
  mocks.ttls.clear();
  mocks.scope = "day";
});

afterEach(() => {
  vi.useRealTimers();
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

  it("drops a model at its per-minute token ceiling", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    mocks.store.set(tpmKey(gemini.modelId), gemini.limits.tpm);

    const selected = await selectModels({
      profile: "assistant_chat",
      estimatedTokens: 1,
    });

    expect(selected).not.toContain(gemini.modelId);
  });

  it("drops a model at its daily token ceiling", async () => {
    const groq = entry("groq:openai/gpt-oss-120b");
    mocks.store.set(tpdKey(groq.modelId), groq.limits.tpd);

    const selected = await selectModels({
      profile: "assistant_chat",
      estimatedTokens: 1,
    });

    expect(selected).not.toContain(groq.modelId);
  });

  it("cools a provider's shared request bucket after a daily failure", async () => {
    const groq = entry("groq:openai/gpt-oss-20b");
    await markModelExhausted(groq.modelId, new Error("daily quota"));
    // The per-model sentinel alone would explain this result; remove it so the
    // assertion exercises the provider-scoped key.
    mocks.store.delete(rpdKey(groq.modelId));

    expect(mocks.store.get(providerKey("rpd", "groq"))).toBe(EXHAUSTED);
    expect(mocks.store.get(providerKey("rpm", "groq"))).toBe(EXHAUSTED);
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

describe("exhaustion cooldowns", () => {
  it("cools a model without a published RPD for the rest of the day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));

    const nvidia = entry("nvidia:openai/gpt-oss-20b");
    expect(nvidia.limits.rpd).toBe(0);
    await markModelExhausted(nvidia.modelId, new Error("daily quota"));

    expect(mocks.store.get(rpmKey(nvidia.modelId))).toBe(EXHAUSTED);
    expect(mocks.ttls.get(rpmKey(nvidia.modelId))).toBe(12 * 60 * 60);
    await expect(getModelQuotaState(nvidia.modelId)).resolves.toBe("exhausted");
  });

  it("uses an imminent Pacific midnight instead of a full day", async () => {
    vi.useFakeTimers();
    // 23:59:30 in America/Los_Angeles (PDT, UTC-7).
    vi.setSystemTime(new Date("2026-10-22T06:59:30Z"));

    const gemini = entry("google:gemini-3.8-flash");
    await markModelExhausted(gemini.modelId, new Error("daily quota"));

    expect(mocks.ttls.get(rpdKey(gemini.modelId))).toBe(30);
    expect(mocks.ttls.get(rpmKey(gemini.modelId))).toBe(30);
  });

  it("shares a minute-scope refusal across a provider's shared buckets", async () => {
    mocks.scope = "minute";
    const groq = entry("groq:openai/gpt-oss-120b");
    const otherGroq = entry("groq:qwen/qwen3.8-27b");

    await markModelExhausted(groq.modelId, new Error("rate limit"));

    expect(mocks.store.get(providerKey("rpm", "groq"))).toBe(EXHAUSTED);
    expect(mocks.store.get(providerKey("tpm", "groq"))).toBe(EXHAUSTED);
    expect(mocks.ttls.get(rpmKey(groq.modelId))).toBe(60);

    mocks.store.delete(rpmKey(otherGroq.modelId));
    await expect(getModelQuotaState(otherGroq.modelId)).resolves.toBe(
      "exhausted",
    );
  });

  it("keeps a minute-scope refusal model-local when buckets are not shared", async () => {
    mocks.scope = "minute";
    const gemini = entry("google:gemini-3.8-flash");
    const otherGemini = entry("google:gemini-3.6-flash");

    await markModelExhausted(gemini.modelId, new Error("rate limit"));

    expect(mocks.store.get(rpmKey(gemini.modelId))).toBe(EXHAUSTED);
    expect(mocks.store.get(rpmKey(otherGemini.modelId))).toBeUndefined();
    expect(mocks.store.get(providerKey("rpm", "google"))).toBeUndefined();
    await expect(getModelQuotaState(otherGemini.modelId)).resolves.toBe(
      "available",
    );
  });
});

describe("off-catalog accounting", () => {
  it("records embedding usage at the Gemini day boundary", async () => {
    vi.useFakeTimers();
    // 12:00 UTC is 05:00 PDT; the next Pacific midnight is 19 hours away.
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));

    await recordModelUsage(EMBEDDING_MODEL_ID);

    expect(mocks.store.get(rpmKey(EMBEDDING_MODEL_ID))).toBe(1);
    expect(mocks.store.get(rpdKey(EMBEDDING_MODEL_ID))).toBe(1);
    expect(mocks.ttls.get(rpdKey(EMBEDDING_MODEL_ID))).toBe(19 * 60 * 60);
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
