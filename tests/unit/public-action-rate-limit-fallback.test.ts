import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  dbAssertPublicActionRateLimit: vi.fn(),
  incr: vi.fn(),
  env: {
    UPSTASH_REDIS_REST_URL: "",
    UPSTASH_REDIS_REST_TOKEN: "",
  },
}));

vi.mock("@/lib/env", () => ({ env: mocks.env }));
vi.mock("@/lib/public-action-rate-limit", () => ({
  assertPublicActionRateLimit: mocks.dbAssertPublicActionRateLimit,
  assertBusinessActionRateLimit: vi.fn(),
  getPublicActionClientIpAddress: () => "203.0.113.10",
}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "user-agent": "test-agent" }),
}));
vi.mock("@upstash/redis", () => ({
  Redis: class {
    incr = mocks.incr;
  },
}));

import {
  _resetRateLimitRedisClient,
  assertPublicActionRateLimit,
} from "@/lib/rate-limit/redis-rate-limiter";
import { publicInquiryRateLimit } from "@/features/inquiries/rate-limits";

const config = {
  action: "public-inquiry-submit",
  scope: "business:form",
  ...publicInquiryRateLimit,
} as const;

describe("public rate-limit DB fallback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetRateLimitRedisClient();
    mocks.env.UPSTASH_REDIS_REST_URL = "";
    mocks.env.UPSTASH_REDIS_REST_TOKEN = "";
  });

  it.each([true, false])(
    "preserves sender and scope limits without Redis (allowed: %s)",
    async (allowed) => {
      mocks.dbAssertPublicActionRateLimit.mockResolvedValue(allowed);

      expect(await assertPublicActionRateLimit(config)).toBe(allowed);
      expect(mocks.dbAssertPublicActionRateLimit).toHaveBeenCalledWith(config);
    },
  );

  it("preserves sender and scope limits when Redis fails", async () => {
    mocks.env.UPSTASH_REDIS_REST_URL = "https://redis.example.com";
    mocks.env.UPSTASH_REDIS_REST_TOKEN = "test-token";
    mocks.incr.mockRejectedValue(new Error("Redis unavailable"));
    mocks.dbAssertPublicActionRateLimit.mockResolvedValue(false);

    expect(await assertPublicActionRateLimit(config)).toBe(false);
    expect(mocks.dbAssertPublicActionRateLimit).toHaveBeenCalledWith(config);
  });
});
