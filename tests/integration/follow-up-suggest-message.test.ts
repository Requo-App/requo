import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => ({
  db: (await import("../support/db")).testDb,
}));
vi.mock("@/lib/db/business-access", () => ({
  getMemberBusinessActionContext: vi.fn(),
}));
vi.mock("@/lib/billing/subscription-service", () => ({
  getEffectivePlanForBusiness: vi.fn().mockResolvedValue("free"),
}));
vi.mock("@/features/follow-ups/queries", () => ({
  getFollowUpAiContextForBusiness: vi.fn().mockResolvedValue({
    title: "Call Taylor", reason: "Check in", customerName: "Taylor",
    channel: "email", recordKind: "inquiry",
  }),
}));
vi.mock("@/lib/rate-limit/redis-rate-limiter", () => ({
  assertBusinessActionRateLimit: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/ai/router", () => ({ generateWithFallback: vi.fn() }));
vi.mock("@/lib/ai/input-sanitizer", () => ({
  sanitizeAiInput: vi.fn().mockResolvedValue({ status: "clean" }),
}));

import { POST } from "@/app/api/business/follow-ups/suggest-message/route";
import { getMemberBusinessActionContext } from "@/lib/db/business-access";
import { generateWithFallback } from "@/lib/ai/router";
import { cacheLayer } from "@/lib/ai/cache-layer";
import {
  getBusinessUsageCacheKey, getMonthlyUsageSummary, PLAN_LIMITS,
  reserveUsage, releaseUsageReservation, resetCooldown,
} from "@/lib/ai/usage-limiter";
import { aiUsageEvents } from "@/lib/db/schema";
import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
const businessId = `${prefix}_business`;
const userId = `${prefix}_owner`;
const input = { businessId, userId, taskType: "follow_up_message", plan: "free" } as const;
const result = {
  text: "Hi Taylor, please let us know.", model: "test-model", provider: "groq",
  usage: { promptTokens: 6_000, completionTokens: 200, totalTokens: 6_200 },
} as Awaited<ReturnType<typeof generateWithFallback>>;

const request = () => new Request("http://localhost/api/business/follow-ups/suggest-message", {
  method: "POST", body: JSON.stringify({ followUpId: "follow-up" }),
});

describe("follow-up message credit reservations", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await testDb.delete(aiUsageEvents).where(eq(aiUsageEvents.businessId, businessId));
    await resetCooldown(userId, "follow_up_message");
    await cacheLayer.delete(getBusinessUsageCacheKey(businessId, "free"));
    vi.mocked(getMemberBusinessActionContext).mockResolvedValue({
      ok: true, user: { id: userId },
      businessContext: { business: { id: businessId, name: "Acme" } },
    } as Awaited<ReturnType<typeof getMemberBusinessActionContext>>);
    vi.mocked(generateWithFallback).mockResolvedValue(result);
    await testDb.insert(aiUsageEvents).values({
      id: `${prefix}_usage`, businessId, userId, taskType: "follow_up_message",
      weight: PLAN_LIMITS.free - 1, plan: "free",
    });
  });

  afterAll(async () => {
    await testDb.delete(aiUsageEvents).where(eq(aiUsageEvents.businessId, businessId));
    await closeTestDb();
  });

  it("allows only one concurrent request to reserve the last credit and settles actual tokens", async () => {
    let started!: () => void;
    let finish!: () => void;
    const generating = new Promise<void>((resolve) => { started = resolve; });
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    vi.mocked(generateWithFallback).mockImplementation(async () => {
      started();
      await pending;
      return result;
    });

    const first = POST(request());
    await generating;
    try {
      // A stale display cache must not bypass the persisted reservation.
      await cacheLayer.set(getBusinessUsageCacheKey(businessId, "free"), 0, 60);
      const others = await Promise.all(Array.from({ length: 4 }, () => POST(request())));
      expect(others.map((response) => response.status)).toEqual([429, 429, 429, 429]);
      expect((await getMonthlyUsageSummary(businessId, "free")).used).toBe(PLAN_LIMITS.free);
    } finally {
      finish();
    }
    expect((await first).status).toBe(200);
    expect(generateWithFallback).toHaveBeenCalledTimes(1);
    expect((await getMonthlyUsageSummary(businessId, "free")).used).toBe(PLAN_LIMITS.free + 1);
  });

  it("serializes simultaneous reservations even with different users and an empty cache", async () => {
    const reservations = await Promise.all(Array.from({ length: 8 }, (_, index) =>
      reserveUsage({ ...input, userId: `${userId}_${index}` }),
    ));
    const accepted = reservations.filter((reservation) => reservation.allowed);
    expect(accepted).toHaveLength(1);
    expect((await getMonthlyUsageSummary(businessId, "free")).used).toBe(PLAN_LIMITS.free);
    await releaseUsageReservation(accepted[0].reservation);
    expect((await reserveUsage(input)).allowed).toBe(true);
  });

  it("refunds a failed generation and preserves cooldown", async () => {
    vi.mocked(generateWithFallback).mockRejectedValue(new Error("Provider unavailable"));
    expect((await POST(request())).status).toBe(503);
    expect((await getMonthlyUsageSummary(businessId, "free")).used).toBe(PLAN_LIMITS.free - 1);
    expect((await POST(request())).status).toBe(429);
    await resetCooldown(userId, "follow_up_message");
    vi.mocked(generateWithFallback).mockResolvedValue(result);
    expect((await POST(request())).status).toBe(200);
  });

  it("counts legacy usage while isolating other plans and months", async () => {
    await testDb.update(aiUsageEvents).set({ plan: null })
      .where(eq(aiUsageEvents.id, `${prefix}_usage`));
    await testDb.insert(aiUsageEvents).values([
      { id: `${prefix}_pro`, businessId, userId, taskType: "follow_up_message", weight: 500, plan: "pro" },
      { id: `${prefix}_old`, businessId, userId, taskType: "follow_up_message", weight: 500, plan: "free", createdAt: new Date("2020-01-01") },
    ]);
    const reservation = await reserveUsage(input);
    expect(reservation.allowed).toBe(true);
    expect((await reserveUsage(input)).allowed).toBe(false);
  });
});
