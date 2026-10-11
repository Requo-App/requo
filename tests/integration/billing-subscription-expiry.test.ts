import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

/**
 * DB-backed regression tests for expired-subscription processing.
 *
 * Only canceled subscriptions past their period end are eligible;
 * processing flips them to expired exactly once.
 *
 * Requires a disposable integration Postgres (same target as the rest of
 * `tests/integration/`). Not runnable without `TEST_DATABASE_URL` /
 * `DATABASE_URL` pointing at a throwaway database.
 */

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");
  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { businesses } from "@/lib/db/schema/businesses";
import {
  businessSubscriptions,
  user,
} from "@/lib/db/schema";
import { processExpiredSubscriptions } from "@/lib/billing/jobs/expire-subscriptions";
import { closeTestDb, testDb } from "@/tests/support/db";

const PREFIX = "test_sub_expiry";
const NOW = new Date("2026-04-20T00:00:00.000Z");
const PAST = new Date("2026-04-01T00:00:00.000Z");
const FUTURE = new Date("2099-05-20T00:00:00.000Z");

async function seedBusiness(suffix: string) {
  const userId = `${PREFIX}_${suffix}_user`;
  const businessId = `${PREFIX}_${suffix}_biz`;

  await testDb.insert(user).values({
    id: userId,
    name: "Subscription Expiry Test",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await testDb.insert(businesses).values({
    id: businessId,
    ownerUserId: userId,
    name: "Subscription Expiry Test Biz",
    slug: businessId.replace(/_/g, "-"),
    plan: "pro",
    businessType: "general_project_services",
    defaultCurrency: "USD",
    createdAt: NOW,
    updatedAt: NOW,
  });

  return { userId, businessId };
}

async function seedSubscription(
  businessId: string,
  overrides: {
    status?: "active" | "canceled" | "expired";
    currentPeriodEnd?: Date | null;
  } = {},
) {
  const [row] = await testDb
    .insert(businessSubscriptions)
    .values({
      id: `${businessId}_sub`,
      businessId,
      status: overrides.status ?? "canceled",
      plan: "pro",
      billingProvider: "polar",
      billingCurrency: "USD",
      currentPeriodStart: PAST,
      currentPeriodEnd:
        overrides.currentPeriodEnd === undefined
          ? PAST
          : overrides.currentPeriodEnd,
      createdAt: NOW,
      updatedAt: NOW,
    })
    .returning();

  return row;
}

async function subscriptionStatus(businessId: string) {
  const [row] = await testDb
    .select({ status: businessSubscriptions.status })
    .from(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, businessId));
  return row?.status;
}

describe("processExpiredSubscriptions", () => {
  afterAll(async () => {
    await testDb
      .delete(businessSubscriptions)
      .where(like(businessSubscriptions.businessId, `${PREFIX}%`));
    await testDb
      .delete(businesses)
      .where(like(businesses.id, `${PREFIX}%`));
    await testDb.delete(user).where(like(user.id, `${PREFIX}%`));
    await closeTestDb();
  });

  it("expires canceled subscriptions past their period end", async () => {
    const { businessId } = await seedBusiness("eligible");
    await seedSubscription(businessId, { status: "canceled", currentPeriodEnd: PAST });

    const result = await processExpiredSubscriptions();

    expect(result.processed).toBe(1);
    expect(result).toMatchObject({ succeeded: 1, failed: 0 });
    expect(await subscriptionStatus(businessId)).toBe("expired");
  });

  it("leaves canceled subscriptions within their period alone", async () => {
    const { businessId } = await seedBusiness("future");
    await seedSubscription(businessId, {
      status: "canceled",
      currentPeriodEnd: FUTURE,
    });

    const result = await processExpiredSubscriptions();

    expect(result.processed).toBe(0);
    expect(await subscriptionStatus(businessId)).toBe("canceled");
  });

  it("leaves active subscriptions alone even past period end", async () => {
    const { businessId } = await seedBusiness("active");
    await seedSubscription(businessId, { status: "active", currentPeriodEnd: PAST });

    await processExpiredSubscriptions();

    expect(await subscriptionStatus(businessId)).toBe("active");
  });

  it("does not reprocess already-expired subscriptions", async () => {
    const { businessId } = await seedBusiness("rerun");
    await seedSubscription(businessId, { status: "canceled", currentPeriodEnd: PAST });

    const first = await processExpiredSubscriptions();
    expect(first).toMatchObject({ processed: 1, succeeded: 1, failed: 0 });

    const second = await processExpiredSubscriptions();
    expect(second.processed).toBe(0);
    expect(await subscriptionStatus(businessId)).toBe("expired");
  });
});
