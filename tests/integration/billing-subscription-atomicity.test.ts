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
  businessTrialClaims,
  user,
} from "@/lib/db/schema";
import {
  activateSubscription,
  cancelSubscription,
  canStartBusinessTrial,
  createPendingSubscription,
  expireSubscription,
  hasBusinessTrialClaim,
  PAST_DUE_GRACE_MS,
  resolveEffectivePlanFromSubscription,
  startBusinessTrial,
  updateSubscriptionStatus,
} from "@/lib/billing/subscription-service";
import { PRO_TRIAL_MS } from "@/lib/plans/plans";
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
    await testDb
      .delete(businessTrialClaims)
      .where(like(businessTrialClaims.userId, `${PREFIX}%`));
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

  it("starts a one-time Pro trial and records the owner claim", async () => {
    const { businessId, userId } = await seedBusiness("trial");
    const startedAt = new Date();

    const started = await startBusinessTrial({
      businessId,
      userId,
      currency: "USD",
      now: startedAt,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) {
      throw new Error(started.reason);
    }

    expect(started.subscription.status).toBe("trialing");
    expect(started.subscription.plan).toBe("pro");
    expect(started.trialEndsAt.getTime()).toBe(
      startedAt.getTime() + PRO_TRIAL_MS,
    );

    const { sub, plan } = await readState(businessId);
    expect(sub?.status).toBe("trialing");
    expect(sub?.plan).toBe("pro");
    expect(sub?.trialEndsAt?.toISOString()).toBe(
      started.trialEndsAt.toISOString(),
    );
    expect(sub?.currentPeriodEnd?.toISOString()).toBe(
      started.trialEndsAt.toISOString(),
    );
    expect(plan).toBe("pro");
    expect(resolveEffectivePlanFromSubscription(sub!)).toBe("pro");

    expect(await hasBusinessTrialClaim(userId)).toBe(true);
    expect(await canStartBusinessTrial({ userId, businessId })).toBe(false);
    // A trial is local access, not a paid provider subscription.
    expect(await sqlGrantsPaidAccess(businessId)).toBe(false);
  });

  it("clears stale provider state when restarting on an expired subscription", async () => {
    const { businessId, userId } = await seedBusiness("trialcleanup");
    const previousTerm = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    await testDb.insert(businessSubscriptions).values({
      id: `${PREFIX}_trialcleanup_sub`,
      businessId,
      status: "expired",
      plan: "pro",
      billingProvider: "polar",
      billingCurrency: "PHP",
      providerCustomerId: `${PREFIX}_old_customer`,
      providerSubscriptionId: `${PREFIX}_old_subscription`,
      providerCheckoutId: `${PREFIX}_old_checkout`,
      paymentMethod: "card",
      currentPeriodStart: previousTerm,
      currentPeriodEnd: previousTerm,
      providerEventAt: previousTerm,
      createdAt: previousTerm,
      updatedAt: previousTerm,
    });

    const startedAt = new Date();
    const started = await startBusinessTrial({
      businessId,
      userId,
      currency: "USD",
      now: startedAt,
    });
    expect(started.ok).toBe(true);

    const { sub } = await readState(businessId);
    expect(sub?.status).toBe("trialing");
    expect(sub?.billingCurrency).toBe("USD");
    expect(sub?.providerCustomerId).toBeNull();
    expect(sub?.providerSubscriptionId).toBeNull();
    expect(sub?.providerCheckoutId).toBeNull();
    expect(sub?.paymentMethod).toBeNull();
  });

  it("allows only one trial per owner across businesses", async () => {
    const { businessId, userId } = await seedBusiness("trialonce");
    const secondBusinessId = `${PREFIX}_trialonce_second_biz`;

    await testDb.insert(businesses).values({
      id: secondBusinessId,
      ownerUserId: userId,
      name: "Subscription Atomicity Second Biz",
      slug: secondBusinessId.replace(/_/g, "-"),
      plan: "free",
      businessType: "general_project_services",
      defaultCurrency: "USD",
      createdAt: NOW,
      updatedAt: NOW,
    });

    expect(
      (await startBusinessTrial({ businessId, userId })).ok,
    ).toBe(true);

    const second = await startBusinessTrial({
      businessId: secondBusinessId,
      userId,
    });

    expect(second).toEqual({ ok: false, reason: "already-claimed" });
    expect(await readState(secondBusinessId)).toEqual({
      sub: undefined,
      plan: "free",
    });

    const claims = await testDb
      .select()
      .from(businessTrialClaims)
      .where(eq(businessTrialClaims.userId, userId));
    expect(claims).toHaveLength(1);
    expect(claims[0]?.businessId).toBe(businessId);
  });

  it("does not consume a claim when the caller is not the owner", async () => {
    const { businessId } = await seedBusiness("trialowner");
    const outsiderId = `${PREFIX}_trialowner_outsider`;

    const result = await startBusinessTrial({
      businessId,
      userId: outsiderId,
    });

    expect(result).toEqual({ ok: false, reason: "not-found" });
    expect(await hasBusinessTrialClaim(outsiderId)).toBe(false);
    expect((await readState(businessId)).sub).toBeUndefined();
  });

  it("converts a trial into a paid subscription and clears the trial window", async () => {
    const { businessId, userId } = await seedBusiness("trialconvert");

    expect(
      (await startBusinessTrial({ businessId, userId })).ok,
    ).toBe(true);

    await activateSubscription({
      businessId,
      plan: "pro",
      provider: "polar",
      currency: "USD",
      providerSubscriptionId: `${PREFIX}_trialconvert_sub`,
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    const { sub, plan } = await readState(businessId);
    expect(sub?.status).toBe("active");
    expect(sub?.trialEndsAt).toBeNull();
    expect(plan).toBe("pro");
    expect(await sqlGrantsPaidAccess(businessId)).toBe(true);
  });

  it("resolves an elapsed trial as Free before the expiry job runs", async () => {
    const { businessId, userId } = await seedBusiness("trialexpired");

    const started = await startBusinessTrial({
      businessId,
      userId,
      now: new Date(Date.now() - PRO_TRIAL_MS - 1_000),
    });
    expect(started.ok).toBe(true);

    const beforeExpiry = await readState(businessId);
    expect(beforeExpiry.sub?.status).toBe("trialing");
    // The cached column still says Pro, but entitlement reads follow
    // `trialEndsAt` and already treat the business as Free.
    expect(beforeExpiry.plan).toBe("pro");
    expect(
      resolveEffectivePlanFromSubscription(beforeExpiry.sub!),
    ).toBe("free");
    expect(await sqlGrantsPaidAccess(businessId)).toBe(false);

    await expireSubscription(businessId, undefined, {
      status: "trialing",
      trialEndsAtBefore: new Date(),
    });

    const afterExpiry = await readState(businessId);
    expect(afterExpiry.sub?.status).toBe("expired");
    expect(afterExpiry.sub?.trialEndsAt).toBeNull();
    expect(afterExpiry.plan).toBe("free");
  });

  it("does not let the expiry job overwrite a trial extended after its scan", async () => {
    const { businessId, userId } = await seedBusiness("trialextend");

    expect(
      (
        await startBusinessTrial({
          businessId,
          userId,
          now: new Date(Date.now() - PRO_TRIAL_MS - 1_000),
        })
      ).ok,
    ).toBe(true);

    const extendedTrialEnd = new Date(Date.now() + PRO_TRIAL_MS);
    await testDb
      .update(businessSubscriptions)
      .set({
        trialEndsAt: extendedTrialEnd,
        currentPeriodEnd: extendedTrialEnd,
      })
      .where(eq(businessSubscriptions.businessId, businessId));

    await expireSubscription(businessId, undefined, {
      status: "trialing",
      trialEndsAtBefore: new Date(),
    });

    const state = await readState(businessId);
    expect(state.sub?.status).toBe("trialing");
    expect(resolveEffectivePlanFromSubscription(state.sub!)).toBe("pro");
  });
});
