import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const store = new Map<string, unknown>();
  const ttls = new Map<string, number>();
  const writeAt = new Map<string, number>();
  const num = (key: string): number => {
    const value = store.get(key);
    return typeof value === "number" ? value : 0;
  };
  const durable = new Map<string, number>();
  const durableTtls = new Map<string, number>();
  const durableWriteAt = new Map<string, number>();
  const durableNum = (key: string): number => durable.get(key) ?? 0;
  return {
    store,
    ttls,
    writeAt,
    num,
    durable,
    durableTtls,
    durableWriteAt,
    durableNum,
  };
});

vi.mock("@/lib/ai/cache-layer", () => ({
  cacheLayer: {
    get: vi.fn(async (key: string) => mocks.store.get(key) ?? null),
    getMany: vi.fn(async (keys: string[]) =>
      keys.map((key) => mocks.store.get(key) ?? null),
    ),
    set: vi.fn(async (key: string, value: number, ttlSeconds: number) => {
      mocks.store.set(key, value);
      mocks.ttls.set(key, ttlSeconds);
      mocks.writeAt.set(key, Date.now());
    }),
    increment: vi.fn(async (key: string, ttlSeconds: number) => {
      const next = mocks.num(key) + 1;
      mocks.store.set(key, next);
      mocks.ttls.set(key, ttlSeconds);
      if (!mocks.writeAt.has(key)) mocks.writeAt.set(key, Date.now());
      return next;
    }),
    incrementBy: vi.fn(async (key: string, delta: number, ttlSeconds: number) => {
      const next = mocks.num(key) + delta;
      mocks.store.set(key, next);
      mocks.ttls.set(key, ttlSeconds);
      if (!mocks.writeAt.has(key)) mocks.writeAt.set(key, Date.now());
      return next;
    }),
    adjustCounter: vi.fn(
      async (
        key: string,
        delta: number,
        ttlSeconds: number,
        whenMissing: number,
        heldForMs = 0,
      ) => {
        const now = Date.now();
        const existing = mocks.store.get(key);

        if (existing === undefined) {
          const next = Math.max(0, Math.ceil(whenMissing));
          mocks.store.set(key, next);
          mocks.ttls.set(key, ttlSeconds);
          mocks.writeAt.set(key, now);
          return next;
        }

        // Mirror the cache layer's newer-window rule: the hold's key can have
        // at most `ttl − heldForMs` left, so a longer lifetime means the key
        // was recreated after this hold's window expired.
        const current = mocks.num(key);
        const remaining =
          (mocks.writeAt.get(key) ?? now - ttlSeconds * 1000) +
          ttlSeconds * 1000 -
          now;
        const maxRemaining = ttlSeconds * 1000 - Math.max(0, heldForMs);
        if (remaining > maxRemaining) {
          if (delta > 0 && whenMissing > 0) {
            const next = current + Math.ceil(whenMissing);
            mocks.store.set(key, next);
            return next;
          }
          return current;
        }

        const next = Math.max(0, current + delta);
        mocks.store.set(key, next);
        return next;
      },
    ),
    delete: vi.fn(async (key: string) => {
      mocks.store.delete(key);
    }),
    reserve: vi.fn(
      async (
        counters: Array<{
          key: string;
          limit: number;
          amount: number;
          ttlSeconds: number;
        }>,
      ) => {
        for (const counter of counters) {
          const current = mocks.num(counter.key);
          if (current + counter.amount > counter.limit) {
            return { ok: false, key: counter.key };
          }
        }
        const values: number[] = [];
        for (const counter of counters) {
          const next = mocks.num(counter.key) + counter.amount;
          mocks.store.set(counter.key, next);
          mocks.ttls.set(counter.key, counter.ttlSeconds);
          if (!mocks.writeAt.has(counter.key)) {
            mocks.writeAt.set(counter.key, Date.now());
          }
          values.push(next);
        }
        return { ok: true, values };
      },
    ),
  },
}));

vi.mock("@/lib/ai/capacity-store", () => ({
  // In-memory stand-in for the durable store. Reservation tests assert
  // against these maps so they cover the authority rather than the mirror.
  reserveDurableCapacity: vi.fn(
    async (
      counters: Array<{
        key: string;
        limit: number;
        amount: number;
        ttlSeconds: number;
      }>,
    ) => {
      for (const counter of counters) {
        if (mocks.durableNum(counter.key) + counter.amount > counter.limit) {
          return { ok: false, key: counter.key };
        }
      }
      for (const counter of counters) {
        const next = mocks.durableNum(counter.key) + counter.amount;
        mocks.durable.set(counter.key, next);
        mocks.durableTtls.set(counter.key, counter.ttlSeconds);
        if (!mocks.durableWriteAt.has(counter.key)) {
          mocks.durableWriteAt.set(counter.key, Date.now());
        }
      }
      return { ok: true };
    },
  ),
  adjustDurableCounter: vi.fn(
    async (
      key: string,
      delta: number,
      ttlSeconds: number,
      whenMissing: number,
      heldForMs = 0,
    ) => {
      const now = Date.now();
      const existing = mocks.durable.get(key);

      if (existing === undefined) {
        const next = Math.max(0, Math.ceil(whenMissing));
        mocks.durable.set(key, next);
        mocks.durableTtls.set(key, ttlSeconds);
        mocks.durableWriteAt.set(key, now);
        return next;
      }

      const current = mocks.durableNum(key);
      const remaining =
        (mocks.durableWriteAt.get(key) ?? now - ttlSeconds * 1000) +
        ttlSeconds * 1000 -
        now;
      const maxRemaining = ttlSeconds * 1000 - Math.max(0, heldForMs);
      if (remaining > maxRemaining) {
        if (delta > 0 && whenMissing > 0) {
          const next = current + Math.ceil(whenMissing);
          mocks.durable.set(key, next);
          return next;
        }
        return current;
      }

      const next = Math.max(0, current + delta);
      mocks.durable.set(key, next);
      return next;
    },
  ),
}));

vi.mock("@/lib/env", () => ({
  isGroqConfigured: true,
  isGeminiConfigured: true,
  isOpenRouterConfigured: true,
  isCloudflareAiConfigured: true,
  isNvidiaNimConfigured: true,
}));

import {
  CLOUDFLARE_DAILY_NEURON_POOL,
  getModelCatalog,
  getNeuronPoolOverride,
  type ModelEntry,
} from "@/lib/ai/catalog";
import {
  getCapacitySnapshot,
  getModelQuotaState,
  isModelDead,
  markModelExhausted,
  recordModelUsage,
  reserveModelCapacity,
  selectModels,
} from "@/lib/ai/capacity-selector";
import { cacheLayer } from "@/lib/ai/cache-layer";
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
  mocks.writeAt.clear();
  mocks.durable.clear();
  mocks.durableTtls.clear();
  mocks.durableWriteAt.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("capacity selection quota ceiling", () => {
  it.each(["assistant_chat", undefined] as const)(
    "drops a model at exactly 100% before the next request (profile: %s)",
    async (profile) => {
      const gemini = entry("google:gemini-3.8-flash");
      expect(gemini.limits.rpd).toBeGreaterThan(0);
      mocks.store.set(rpdKey(gemini.modelId), gemini.limits.rpd - 1);

      const selected = await selectModels({
        profile,
        estimatedTokens: 100,
      });

      expect(selected).not.toContain(gemini.modelId);
    },
  );

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

describe("atomic capacity reservation", () => {
  it("refuses the whole reservation when one bucket would exceed its limit", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    mocks.durable.set(rpdKey(gemini.modelId), gemini.limits.rpd);

    const reservation = await reserveModelCapacity(gemini.modelId, 1_000);

    expect(reservation).toBeNull();
    // The request and token buckets must not be charged for a request that
    // was never dispatched.
    expect(mocks.durable.get(rpmKey(gemini.modelId))).toBeUndefined();
    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBeUndefined();
  });

  it("keeps the durable hold when the cache mirror refuses", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    // The optional mirror is stale/full; only the durable store may decide.
    mocks.store.set(rpdKey(gemini.modelId), gemini.limits.rpd);

    const reservation = await reserveModelCapacity(gemini.modelId, 1_000);

    expect(reservation).not.toBeNull();
    expect(mocks.durable.get(rpdKey(gemini.modelId))).toBe(1);
  });

  it("settles the token hold to the provider's reported usage", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    const reservation = await reserveModelCapacity(gemini.modelId, 1_000);
    expect(reservation).not.toBeNull();
    expect(mocks.durable.get(rpmKey(gemini.modelId))).toBe(1);
    expect(mocks.durable.get(rpdKey(gemini.modelId))).toBe(1);
    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBe(1_000);

    await reservation!.settle({ inputTokens: 400, outputTokens: 100 });

    expect(mocks.durable.get(rpmKey(gemini.modelId))).toBe(1);
    expect(mocks.durable.get(rpdKey(gemini.modelId))).toBe(1);
    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBe(500);
  });

  it("releases the token hold but keeps a refused request counted", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    const reservation = await reserveModelCapacity(gemini.modelId, 1_000);

    await reservation!.releaseTokens();

    expect(mocks.durable.get(rpmKey(gemini.modelId))).toBe(1);
    expect(mocks.durable.get(rpdKey(gemini.modelId))).toBe(1);
    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBe(0);
  });

  it("rolls back every counter for a stale model identifier", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    const reservation = await reserveModelCapacity(gemini.modelId, 1_000);

    await reservation!.rollback();

    expect(mocks.durable.get(rpmKey(gemini.modelId))).toBe(0);
    expect(mocks.durable.get(rpdKey(gemini.modelId))).toBe(0);
    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBe(0);
  });

  it("settles actual usage even when the preflight estimate was zero", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    const reservation = await reserveModelCapacity(gemini.modelId, 0);
    expect(reservation).not.toBeNull();

    await reservation!.settle({ inputTokens: 300, outputTokens: 50 });

    expect(mocks.durable.get(rpmKey(gemini.modelId))).toBe(1);
    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBe(350);
  });

  it("seeds the new window when a settlement outlives the minute hold", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    const reservation = await reserveModelCapacity(gemini.modelId, 1_000);
    expect(reservation).not.toBeNull();

    // The per-minute counter expired while a long stream was still running.
    mocks.durable.delete(tpmKey(gemini.modelId));
    await reservation!.settle({ inputTokens: 300, outputTokens: 50 });

    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBe(350);
  });

  it("never lets a late release erase usage recorded by a newer window", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    const reservation = await reserveModelCapacity(gemini.modelId, 1_000);
    expect(reservation).not.toBeNull();

    // The minute bucket expired while the request ran, and a newer request
    // recreated the same key in the next window.
    vi.setSystemTime(new Date("2026-10-22T12:01:30Z"));
    mocks.durable.set(tpmKey(gemini.modelId), 100);
    mocks.durableWriteAt.set(tpmKey(gemini.modelId), Date.now());

    await reservation!.releaseTokens();

    // Dropping the late release is conservative: the newer window's real
    // usage has to survive.
    expect(mocks.durable.get(tpmKey(gemini.modelId))).toBe(100);
  });

  it("marks a 404 identifier dead when a direct path reports it", async () => {
    const gemini = entry("google:gemini-3.8-flash");
    const error = Object.assign(new Error("model not found"), { status: 404 });

    await markModelExhausted(gemini.modelId, error, { turnAborted: false });

    expect(await isModelDead(gemini.modelId)).toBe(true);
  });
});

describe("capacity snapshot", () => {
  it("reads the whole catalog in one batched cache call", async () => {
    vi.mocked(cacheLayer.getMany).mockClear();

    await getCapacitySnapshot();

    expect(cacheLayer.getMany).toHaveBeenCalledTimes(1);
  });
});

describe("adaptive ranking", () => {
  it("demotes a candidate with repeated failures below a healthy one", async () => {
    const cloudflare = entry("cloudflare:@cf/openai/gpt-oss-20b");
    const healthier = entry("cloudflare:@cf/zai-org/glm-4.7-flash");
    mocks.store.set(`cap:health:${cloudflare.modelId}`, {
      successes: 0,
      failures: 6,
      consecutiveFailures: 6,
      latencyEwmaMs: 20_000,
      lastFailureKind: "timeout",
      updatedAt: Date.now(),
    });

    const selected = await selectModels({
      profile: "short_text",
      estimatedTokens: 100,
    });

    expect(selected.indexOf(healthier.modelId)).toBeLessThan(
      selected.indexOf(cloudflare.modelId),
    );
  });

  it("never removes a candidate for poor health alone", async () => {
    const cloudflare = entry("cloudflare:@cf/openai/gpt-oss-20b");
    mocks.store.set(`cap:health:${cloudflare.modelId}`, {
      successes: 0,
      failures: 20,
      consecutiveFailures: 20,
      latencyEwmaMs: 60_000,
      lastFailureKind: "server",
      updatedAt: Date.now(),
    });

    const selected = await selectModels({
      profile: "short_text",
      estimatedTokens: 100,
    });

    expect(selected).toContain(cloudflare.modelId);
  });
});

describe("off-catalog accounting", () => {
  it("records embedding usage at the Gemini day boundary", async () => {
    vi.useFakeTimers();
    // 12:00 UTC is 05:00 PDT; the next Pacific midnight is 19 hours away.
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));

    await recordModelUsage(EMBEDDING_MODEL_ID);

    expect(mocks.durable.get(rpmKey(EMBEDDING_MODEL_ID))).toBe(1);
    expect(mocks.durable.get(rpdKey(EMBEDDING_MODEL_ID))).toBe(1);
    expect(mocks.durableTtls.get(rpdKey(EMBEDDING_MODEL_ID))).toBe(
      19 * 60 * 60,
    );
    // The best-effort mirror receives the same accounting for selection.
    expect(mocks.store.get(rpdKey(EMBEDDING_MODEL_ID))).toBe(1);
    expect(mocks.ttls.get(rpdKey(EMBEDDING_MODEL_ID))).toBe(19 * 60 * 60);
  });
});

describe("getModelQuotaState", () => {
  it.each([
    { remaining: 2, state: "stressed", exhausted: false },
    { remaining: 1, state: "exhausted", exhausted: true },
    { remaining: 0, state: "exhausted", exhausted: true },
  ])(
    "reports $state with $remaining daily requests remaining",
    async ({ remaining, state, exhausted }) => {
      const gemini = entry("google:gemini-3.8-flash");
      mocks.store.set(rpdKey(gemini.modelId), gemini.limits.rpd - remaining);
      await expect(getModelQuotaState(gemini.modelId)).resolves.toBe(state);

      const snapshot = await getCapacitySnapshot();
      expect(snapshot.find((model) => model.modelId === gemini.modelId)).toMatchObject({
        loadRatio: (gemini.limits.rpd - remaining + 1) / gemini.limits.rpd,
        available: false,
        quotaExhausted: exhausted,
      });
    },
  );

  it("reports unknown catalog entries and dead identifiers", async () => {
    await expect(
      getModelQuotaState("groq:retired-model"),
    ).resolves.toBe("unknown");

    const groq = entry("groq:openai/gpt-oss-120b");
    mocks.store.set(`cap:dead:${groq.modelId}`, 1);
    await expect(getModelQuotaState(groq.modelId)).resolves.toBe("dead");
  });
});
