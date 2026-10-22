import { afterEach, describe, expect, it, vi } from "vitest";

// Redis is configured, but every script hangs: the layer must treat a timeout
// as an ambiguous commit, not fall back to an independent in-process hold.
vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "test-token",
  },
}));

vi.mock("@upstash/redis", () => ({
  Redis: class {
    eval() {
      return new Promise(() => {});
    }
  },
}));

import { cacheLayer } from "@/lib/ai/cache-layer";

describe("ambiguous Redis failures", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses the reservation when the eval times out instead of holding locally", async () => {
    vi.useFakeTimers();

    const pending = cacheLayer.reserve([
      { key: "cap:rpm:timeout-test", limit: 10, amount: 1, ttlSeconds: 60 },
    ]);
    await vi.advanceTimersByTimeAsync(5_000);
    const result = await pending;

    expect(result).toEqual({
      ok: false,
      key: "cap:rpm:timeout-test",
      ambiguous: true,
    });
    // No local hold was opened: the candidate is skipped, and any hold the
    // timed-out script committed expires with its own TTL.
    expect(await cacheLayer.get("cap:rpm:timeout-test")).toBeNull();
  });
});
