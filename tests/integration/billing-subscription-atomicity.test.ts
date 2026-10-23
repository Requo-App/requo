import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";

/**
 * DB-backed regression tests for atomic subscription/plan-cache updates.
 *
 * `activateSubscription` must update `business_subscriptions` and the
 * denormalized `businesses.plan` in one transaction so the cache can
 * never drift from the authoritative row.
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

import { hasPaidBusinessSubscriptionSql } from "@/lib/billing/entitlement-sql";
import { businesses } from "@/lib/db/schema/businesses";
import {
  businessSubscriptions,
  user,
} from "@/lib/db/schema";
import {
  activateSubscription,
  cancelSubscription,
  createPendingSubscription,
  expireSubscription,
  PAST_DUE_GRACE_MS,
  resolveEffectivePlanFromSubscription,
  updateSubscriptionStatus,
} from "@/lib/billing/subscription-service";
import { closeTestDb, testDb } from "@/tests/support/db";

const PREFIX = "test_sub_atomicity";
const NOW = new Date("2026-04-20T00:00:00.000Z");

async function seedBusiness(suffix: string) {
  const userId = `${PREFIX}_${suffix}_user`;
  const businessId = `${PREFIX}_${suffix}_biz`;

  await testDb.insert(user).values({
    id: userId,
    name: "Subscription Atomicity Test",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await testDb.insert(businesses).values({
    id: businessId,
    ownerUserId: userId,
    name: "Subscription Atomicity Test Biz",
    slug: businessId.replace(/_/g, "-"),
    plan: "free",
    businessType: "general_project_services",
    defaultCurrency: "USD",
    createdAt: NOW,
    updatedAt: NOW,
  });

  return { userId, businessId };
}

async function readState(businessId: string) {
  const [sub] = await testDb
    .select()
    .from(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, businessId));
  const [biz] = await testDb
    .select({ plan: businesses.plan })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  return { sub, plan: biz?.plan };
}

async function sqlGrantsPaidAccess(businessId: string) {
  const [row] = await testDb
    .select({ id: businessSubscriptions.id })
    .from(businessSubscriptions)
    .where(
      and(
        eq(businessSubscriptions.businessId, businessId),
        hasPaidBusinessSubscriptionSql(),
      ),
    )
    .limit(1);

  return Boolean(row);
}

describe("activateSubscription atomicity", () => {
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

  it("updates the subscription and cached plan together", async () => {
    const { businessId } = await seedBusiness("joint");

    const result = await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
    });

    expect(result.plan).toBe("pro");
    expect(result.status).toBe("active");

    const { sub, plan } = await readState(businessId);
    expect(sub?.plan).toBe("pro");
    expect(plan).toBe("pro");
  });

  it("leaves no partial rows when the subscription write fails", async () => {
    // Unknown business: the subscription insert violates its foreign key,
    // so the transaction aborts before any paired write can land.
    await expect(
      activateSubscription({
        businessId: `${PREFIX}_missing_biz`,
        plan: "pro",
        provider: "polar",
        currency: "USD",
      }),
    ).rejects.toThrow();

    const { sub } = await readState(`${PREFIX}_missing_biz`);
    expect(sub).toBeUndefined();
  });

  it("repeating an activation stays consistent without duplicating rows", async () => {
    const { businessId } = await seedBusiness("idempotent");

    await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
    });
    const second = await activateSubscription({
      businessId,
      plan: "business",
      provider: "polar",
      currency: "USD",
    });

    expect(second.plan).toBe("business");

    const rows = await testDb
      .select()
      .from(businessSubscriptions)
      .where(eq(businessSubscriptions.businessId, businessId));
    const { plan } = await readState(businessId);
    expect(rows).toHaveLength(1);
    expect(plan).toBe("business");
  });

  it("cancellation keeps paid access and the cached plan within the period", async () => {
    const { businessId } = await seedBusiness("cancel");

    await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });
    const canceled = await cancelSubscription(businessId);

    expect(canceled?.status).toBe("canceled");

    const { sub, plan } = await readState(businessId);

    // The authoritative mapping still resolves paid access within the
    // period, and the cached plan column matches it.
    expect(
      resolveEffectivePlanFromSubscription({
        ...sub!,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    ).toBe("pro");
    expect(plan).toBe("pro");
  });

  it("expiring a subscription downgrades the cached plan to free", async () => {
    const { businessId } = await seedBusiness("expire");

    await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
    });
    expect((await readState(businessId)).plan).toBe("pro");

    const expired = await expireSubscription(businessId);

    expect(expired?.status).toBe("expired");

    // Without this sync the denormalized column keeps granting paid
    // entitlements after a revoke.
    const { sub, plan } = await readState(businessId);
    expect(sub?.status).toBe("expired");
    expect(plan).toBe("free");
  });

  it("a pending subscription does not leave a paid plan in the cache", async () => {
    const { businessId } = await seedBusiness("pending");

    await createPendingSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
    });

    const { sub, plan } = await readState(businessId);
    expect(sub?.status).toBe("pending");
    // A pending checkout is not paid access yet.
    expect(plan).toBe("free");
  });

  it("past_due keeps paid access only inside the local grace window", async () => {
    const { businessId } = await seedBusiness("pastdue");

    await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
      currentPeriodEnd: new Date(Date.now() - 1_000),
    });
    await updateSubscriptionStatus(businessId, "past_due", {
      currentPeriodEnd: new Date(Date.now() - 1_000),
    });

    const withinGrace = await readState(businessId);
    expect(
      resolveEffectivePlanFromSubscription(withinGrace.sub!),
    ).toBe("pro");

    await updateSubscriptionStatus(businessId, "past_due", {
      currentPeriodEnd: new Date(Date.now() - PAST_DUE_GRACE_MS - 1_000),
    });

    const afterGrace = await readState(businessId);
    expect(afterGrace.plan).toBe("free");
    expect(
      resolveEffectivePlanFromSubscription(afterGrace.sub!),
    ).toBe("free");
  });

  it("applies the same paid-access window in SQL and the TS resolver", async () => {
    const { businessId } = await seedBusiness("sqlgrace");
    const graceMs = PAST_DUE_GRACE_MS;

    await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
      currentPeriodEnd: new Date(Date.now() + 60_000),
    });
    expect(await sqlGrantsPaidAccess(businessId)).toBe(true);

    await updateSubscriptionStatus(businessId, "past_due", {
      currentPeriodEnd: new Date(Date.now() - 1_000),
    });
    expect(await sqlGrantsPaidAccess(businessId)).toBe(true);

    await updateSubscriptionStatus(businessId, "past_due", {
      currentPeriodEnd: new Date(Date.now() - graceMs - 1_000),
    });
    expect(await sqlGrantsPaidAccess(businessId)).toBe(false);

    await updateSubscriptionStatus(businessId, "paused", {
      currentPeriodEnd: new Date(Date.now() + 60_000),
    });
    expect(await sqlGrantsPaidAccess(businessId)).toBe(false);

    await updateSubscriptionStatus(businessId, "canceled", {
      currentPeriodEnd: new Date(Date.now() + 60_000),
    });
    expect(await sqlGrantsPaidAccess(businessId)).toBe(true);

    await updateSubscriptionStatus(businessId, "canceled", {
      currentPeriodEnd: new Date(Date.now() - 1_000),
    });
    expect(await sqlGrantsPaidAccess(businessId)).toBe(false);
  });

  it("does not let the expiry job overwrite a recovery that landed after its scan", async () => {
    const { businessId } = await seedBusiness("expiryrace");

    await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
      currentPeriodEnd: new Date(Date.now() + 60_000),
    });
    await updateSubscriptionStatus(businessId, "past_due", {
      currentPeriodEnd: new Date(Date.now() - PAST_DUE_GRACE_MS - 1_000),
    });
    await updateSubscriptionStatus(businessId, "active", {
      currentPeriodEnd: new Date(Date.now() + 60_000),
    });

    await expireSubscription(businessId, undefined, {
      status: "past_due",
      currentPeriodEndBefore: new Date(),
    });

    const state = await readState(businessId);
    expect(state.sub?.status).toBe("active");
    expect(state.plan).toBe("pro");
  });

  it("rejects an out-of-order provider event", async () => {
    const { businessId } = await seedBusiness("stale");
    const newer = new Date("2026-04-20T12:00:00.000Z");
    const older = new Date("2026-04-20T11:00:00.000Z");

    await activateSubscription({
      businessId,
      plan: "business",
      provider: "polar",
      currency: "USD",
      providerEventAt: newer,
    });

    const staleResult = await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
      providerEventAt: older,
    });

    expect(staleResult.plan).toBe("business");

    const { sub, plan } = await readState(businessId);
    expect(sub?.plan).toBe("business");
    expect(sub?.providerEventAt?.toISOString()).toBe(newer.toISOString());
    expect(plan).toBe("business");
  });
});
