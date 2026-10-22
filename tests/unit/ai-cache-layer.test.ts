import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No Upstash credentials in this environment: the layer must exercise its
// in-memory fallback, which mirrors the Redis scripts' window semantics.
vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
  },
}));

import { cacheLayer } from "@/lib/ai/cache-layer";

let sequence = 0;
let prefix: string;

beforeEach(() => {
  sequence += 1;
  prefix = `test:cache-layer:${sequence}`;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("cache layer reservations", () => {
  it("increments every counter when each bucket can absorb the hold", async () => {
    const result = await cacheLayer.reserve([
      { key: `${prefix}:rpm`, limit: 10, amount: 1, ttlSeconds: 60 },
      { key: `${prefix}:tpm`, limit: 1_000, amount: 400, ttlSeconds: 60 },
    ]);

    expect(result).toEqual({ ok: true, values: [1, 400] });
    expect(await cacheLayer.get<number>(`${prefix}:rpm`)).toBe(1);
    expect(await cacheLayer.get<number>(`${prefix}:tpm`)).toBe(400);
  });

  it("charges nothing when one bucket would exceed its limit", async () => {
    await cacheLayer.set(`${prefix}:rpd`, 9, 3_600);

    const result = await cacheLayer.reserve([
      { key: `${prefix}:rpm`, limit: 10, amount: 1, ttlSeconds: 60 },
      { key: `${prefix}:rpd`, limit: 10, amount: 2, ttlSeconds: 3_600 },
    ]);

    expect(result.ok).toBe(false);
    expect(await cacheLayer.get<number>(`${prefix}:rpm`)).toBeNull();
    expect(await cacheLayer.get<number>(`${prefix}:rpd`)).toBe(9);
  });
});

describe("counter settlement", () => {
  it("applies a release inside the hold's own window", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-10-22T12:00:00Z");
    vi.setSystemTime(start);

    await cacheLayer.reserve([
      { key: `${prefix}:tpm`, limit: 10_000, amount: 1_000, ttlSeconds: 60 },
    ]);

    vi.setSystemTime(new Date(start.getTime() + 30_000));
    const value = await cacheLayer.adjustCounter(
      `${prefix}:tpm`,
      -1_000,
      60,
      0,
      30_000,
    );

    expect(value).toBe(0);
    expect(await cacheLayer.get<number>(`${prefix}:tpm`)).toBe(0);
  });

  it.each([
    { operation: "release", delta: -1_000, actual: 0, expected: 100 },
    { operation: "lower usage", delta: -650, actual: 350, expected: 450 },
    { operation: "higher usage", delta: 800, actual: 1_800, expected: 1_900 },
  ])("settles $operation on the same day key despite rounded TTL skew", async ({ delta, actual, expected }) => {
    vi.useFakeTimers();
    const start = new Date("2026-10-22T12:00:00.900Z").getTime();
    vi.setSystemTime(start);
    const key = `${prefix}:tpd`;
    await cacheLayer.reserve([
      { key, limit: 10_000, amount: 100, ttlSeconds: 43_200 },
    ]);

    // The day TTL rounds down by one second while only 200 ms elapses.
    // Both reservations share the first key's expiry, leaving 800 ms of skew.
    vi.setSystemTime(start + 200);
    await cacheLayer.reserve([
      { key, limit: 10_000, amount: 1_000, ttlSeconds: 43_199 },
    ]);
    vi.setSystemTime(start + 300);

    expect(await cacheLayer.adjustCounter(key, delta, 43_199, actual, 100)).toBe(expected);
    expect(await cacheLayer.get<number>(key)).toBe(expected);
    vi.setSystemTime(start + 43_200_001);
    expect(await cacheLayer.get<number>(key)).toBeNull();
  });

  it("does not let a late release erase a newer window's usage", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-10-22T12:00:00Z");
    vi.setSystemTime(start);

    await cacheLayer.reserve([
      { key: `${prefix}:tpm`, limit: 10_000, amount: 1_000, ttlSeconds: 60 },
    ]);

    // The hold's minute expired; a later request created the same counter in
    // the next window and recorded real usage.
    vi.setSystemTime(new Date(start.getTime() + 90_000));
    await cacheLayer.incrementBy(`${prefix}:tpm`, 100, 60);

    const value = await cacheLayer.adjustCounter(
      `${prefix}:tpm`,
      -1_000,
      60,
      0,
      90_000,
    );

    expect(value).toBe(100);
    expect(await cacheLayer.get<number>(`${prefix}:tpm`)).toBe(100);
  });

  it("charges full reported usage when the over-spend lands on a newer window", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-10-22T12:00:00Z");
    vi.setSystemTime(start);

    await cacheLayer.reserve([
      { key: `${prefix}:tpm`, limit: 10_000, amount: 1_000, ttlSeconds: 60 },
    ]);

    vi.setSystemTime(new Date(start.getTime() + 90_000));
    await cacheLayer.incrementBy(`${prefix}:tpm`, 100, 60);

    // Estimate 1,000; actual 1,800. The hold is gone, so the full actual is
    // charged to the window that is actually live instead of the difference.
    const value = await cacheLayer.adjustCounter(
      `${prefix}:tpm`,
      800,
      60,
      1_800,
      90_000,
    );

    expect(value).toBe(1_900);
  });

  it("seeds a new window when the hold's counter expired", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-10-22T12:00:00Z");
    vi.setSystemTime(start);

    await cacheLayer.reserve([
      { key: `${prefix}:tpm`, limit: 10_000, amount: 1_000, ttlSeconds: 60 },
    ]);

    vi.setSystemTime(new Date(start.getTime() + 61_000));

    const value = await cacheLayer.adjustCounter(
      `${prefix}:tpm`,
      -650,
      60,
      350,
      61_000,
    );

    expect(value).toBe(350);
  });

  it("keeps an existing window's expiry on later writes", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-10-22T12:00:00Z");
    vi.setSystemTime(start);

    await cacheLayer.incrementBy(`${prefix}:tpm`, 100, 60);
    // A second write must not restart the minute.
    vi.setSystemTime(new Date(start.getTime() + 30_000));
    await cacheLayer.incrementBy(`${prefix}:tpm`, 100, 60);

    vi.setSystemTime(new Date(start.getTime() + 61_000));
    expect(await cacheLayer.get<number>(`${prefix}:tpm`)).toBeNull();
  });
});

describe("batched reads", () => {
  it("preserves order and returns null for misses", async () => {
    await cacheLayer.set(`${prefix}:a`, 1, 60);

    const values = await cacheLayer.getMany<number>([
      `${prefix}:a`,
      `${prefix}:missing`,
    ]);

    expect(values).toEqual([1, null]);
  });
});
