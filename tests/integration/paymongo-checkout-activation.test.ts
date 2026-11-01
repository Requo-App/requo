import { afterAll, describe, expect, it, vi } from "vitest";
import { and, eq, like } from "drizzle-orm";

/**
 * DB-backed regression tests for QR Ph checkout activation.
 *
 * `activatePaymongoCheckoutIntent` is the single activation path for both the
 * webhook and the success-page fallback. These tests protect its payment
 * validation, idempotency, term math, and the prepaid access boundary.
 *
 * Requires the disposable integration Postgres used by the rest of
 * `tests/integration/`.
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
import { processExpiredSubscriptions } from "@/lib/billing/jobs/expire-subscriptions";
import {
  activatePaymongoCheckoutIntent,
  createPaymongoCheckoutIntent,
} from "@/lib/billing/paymongo-checkout";
import { addBillingInterval } from "@/lib/billing/periods";
import { resolveEffectivePlanFromSubscription } from "@/lib/billing/subscription-service";
import { user } from "@/lib/db/schema/auth";
import { businesses } from "@/lib/db/schema/businesses";
import {
  businessSubscriptions,
  paymongoCheckoutIntents,
  paymentAttempts,
} from "@/lib/db/schema/subscriptions";
import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const PREFIX = derivePerFilePrefix("paymongo-checkout-activation.test.ts");
const NOW = new Date("2026-05-10T08:00:00.000Z");

async function seedBusiness(suffix: string) {
  const userId = `${PREFIX}_${suffix}_user`;
  const businessId = `${PREFIX}_${suffix}_biz`;

  await testDb.insert(user).values({
    id: userId,
    name: "PayMongo Activation Test",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await testDb.insert(businesses).values({
    id: businessId,
    ownerUserId: userId,
    name: "PayMongo Activation Test Biz",
    slug: businessId.replace(/_/g, "-"),
    plan: "free",
    businessType: "general_project_services",
    defaultCurrency: "PHP",
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

async function readIntent(intentId: string) {
  const [intent] = await testDb
    .select()
    .from(paymongoCheckoutIntents)
    .where(eq(paymongoCheckoutIntents.id, intentId));

  return intent;
}

async function countAttempts(businessId: string) {
  const rows = await testDb
    .select({ id: paymentAttempts.id })
    .from(paymentAttempts)
    .where(eq(paymentAttempts.businessId, businessId));

  return rows.length;
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

function paid(amount: number, suffix: string) {
  return {
    providerPaymentId: `${PREFIX}_payment_${suffix}`,
    amount,
    currency: "PHP",
    paidAt: new Date(),
  };
}

describe("PayMongo checkout activation", () => {
  afterAll(async () => {
    await testDb
      .delete(paymentAttempts)
      .where(like(paymentAttempts.businessId, `${PREFIX}%`));
    await testDb
      .delete(paymongoCheckoutIntents)
      .where(like(paymongoCheckoutIntents.businessId, `${PREFIX}%`));
    await testDb
      .delete(businessSubscriptions)
      .where(like(businessSubscriptions.businessId, `${PREFIX}%`));
    await testDb.delete(businesses).where(like(businesses.id, `${PREFIX}%`));
    await testDb.delete(user).where(like(user.id, `${PREFIX}%`));
    await closeTestDb();
  });

  it("activates a prepaid term and records the payment once", async () => {
    const { businessId, userId } = await seedBusiness("activate");
    const intent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    const result = await activatePaymongoCheckoutIntent({
      intentId: intent.id,
      payment: paid(intent.amount, "activate"),
    });

    expect(result.status).toBe("activated");

    const { sub, plan } = await readState(businessId);
    expect(sub?.status).toBe("active");
    expect(sub?.billingProvider).toBe("paymongo");
    expect(sub?.plan).toBe("pro");
    expect(plan).toBe("pro");
    expect(sub?.currentPeriodStart).not.toBeNull();
    expect(sub?.currentPeriodEnd).toEqual(
      addBillingInterval(sub!.currentPeriodStart!, "monthly"),
    );
    expect(sub?.providerCustomerId).toBeNull();
    expect(sub?.providerSubscriptionId).toBeNull();

    const savedIntent = await readIntent(intent.id);
    expect(savedIntent?.status).toBe("succeeded");
    expect(savedIntent?.providerPaymentId).toBe(`${PREFIX}_payment_activate`);
    expect(savedIntent?.paidAt).not.toBeNull();

    expect(await countAttempts(businessId)).toBe(1);
    expect(await sqlGrantsPaidAccess(businessId)).toBe(true);
  });

  it("is idempotent when the webhook repeats an activation", async () => {
    const { businessId, userId } = await seedBusiness("idempotent");
    const intent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    const first = await activatePaymongoCheckoutIntent({
      intentId: intent.id,
      payment: paid(intent.amount, "idempotent_first"),
    });
    expect(first.status).toBe("activated");

    const firstState = await readState(businessId);
    const firstEnd = firstState.sub?.currentPeriodEnd?.toISOString();

    const second = await activatePaymongoCheckoutIntent({
      intentId: intent.id,
      payment: paid(intent.amount, "idempotent_second"),
    });

    expect(second.status).toBe("already_active");
    expect((await readState(businessId)).sub?.currentPeriodEnd?.toISOString()).toBe(
      firstEnd,
    );
    expect((await readIntent(intent.id))?.providerPaymentId).toBe(
      `${PREFIX}_payment_idempotent_first`,
    );
    expect(await countAttempts(businessId)).toBe(1);
  });

  it("rejects a payment whose amount does not match the intent", async () => {
    const { businessId, userId } = await seedBusiness("amount");
    const intent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    const result = await activatePaymongoCheckoutIntent({
      intentId: intent.id,
      payment: paid(intent.amount - 1, "amount"),
    });

    expect(result.status).toBe("invalid_payment");

    const { sub, plan } = await readState(businessId);
    expect(sub).toBeUndefined();
    expect(plan).toBe("free");
    expect((await readIntent(intent.id))?.status).toBe("pending");
    expect(await countAttempts(businessId)).toBe(0);
  });

  it("does not let a second checkout replace an active prepaid plan", async () => {
    const { businessId, userId } = await seedBusiness("planchange");
    const proIntent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    expect(
      (
        await activatePaymongoCheckoutIntent({
          intentId: proIntent.id,
          payment: paid(proIntent.amount, "planchange_pro"),
        })
      ).status,
    ).toBe("activated");

    const proState = await readState(businessId);
    const proEnd = proState.sub?.currentPeriodEnd?.toISOString();

    const businessIntent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "business",
      interval: "monthly",
    });

    const result = await activatePaymongoCheckoutIntent({
      intentId: businessIntent.id,
      payment: paid(businessIntent.amount, "planchange_business"),
    });

    expect(result.status).toBe("invalid_payment");

    const after = await readState(businessId);
    expect(after.sub?.plan).toBe("pro");
    expect(after.sub?.currentPeriodEnd?.toISOString()).toBe(proEnd);
    expect(await countAttempts(businessId)).toBe(1);
    expect((await readIntent(businessIntent.id))?.status).toBe("pending");
  });

  it("extends a same-plan renewal from the current term end", async () => {
    const { businessId, userId } = await seedBusiness("renew");
    const firstIntent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    expect(
      (
        await activatePaymongoCheckoutIntent({
          intentId: firstIntent.id,
          payment: paid(firstIntent.amount, "renew_first"),
        })
      ).status,
    ).toBe("activated");

    const firstState = await readState(businessId);
    const firstEnd = firstState.sub!.currentPeriodEnd!;

    const renewalIntent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    expect(
      (
        await activatePaymongoCheckoutIntent({
          intentId: renewalIntent.id,
          payment: paid(renewalIntent.amount, "renew_second"),
        })
      ).status,
    ).toBe("activated");

    const renewed = await readState(businessId);
    expect(renewed.sub?.currentPeriodStart).toEqual(firstEnd);
    expect(renewed.sub?.currentPeriodEnd).toEqual(
      addBillingInterval(firstEnd, "monthly"),
    );
    expect(await countAttempts(businessId)).toBe(2);
  });

  it("starts a new term now when the previous prepaid term already ended", async () => {
    const { businessId, userId } = await seedBusiness("expiredrenew");
    const firstIntent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    expect(
      (
        await activatePaymongoCheckoutIntent({
          intentId: firstIntent.id,
          payment: paid(firstIntent.amount, "expiredrenew_first"),
        })
      ).status,
    ).toBe("activated");

    const expiredEnd = new Date(Date.now() - 60_000);
    await testDb
      .update(businessSubscriptions)
      .set({ currentPeriodEnd: expiredEnd })
      .where(eq(businessSubscriptions.businessId, businessId));

    const renewalIntent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "pro",
      interval: "monthly",
    });

    const startedAt = Date.now();
    const result = await activatePaymongoCheckoutIntent({
      intentId: renewalIntent.id,
      payment: paid(renewalIntent.amount, "expiredrenew_second"),
    });

    expect(result.status).toBe("activated");

    const renewed = await readState(businessId);
    expect(renewed.sub?.currentPeriodStart?.getTime()).toBeGreaterThanOrEqual(
      startedAt,
    );
    expect(renewed.sub?.currentPeriodEnd).toEqual(
      addBillingInterval(renewed.sub!.currentPeriodStart!, "monthly"),
    );
  });

  it("expires prepaid access at the term boundary and the job downgrades the plan", async () => {
    const { businessId, userId } = await seedBusiness("expiryjob");
    const intent = await createPaymongoCheckoutIntent({
      businessId,
      userId,
      plan: "business",
      interval: "monthly",
    });

    expect(
      (
        await activatePaymongoCheckoutIntent({
          intentId: intent.id,
          payment: paid(intent.amount, "expiryjob"),
        })
      ).status,
    ).toBe("activated");

    const endedAt = new Date(Date.now() - 60_000);
    await testDb
      .update(businessSubscriptions)
      .set({ currentPeriodEnd: endedAt })
      .where(eq(businessSubscriptions.businessId, businessId));

    // Access follows the paid boundary immediately, before the daily job.
    expect(await sqlGrantsPaidAccess(businessId)).toBe(false);
    const beforeJob = await readState(businessId);
    expect(resolveEffectivePlanFromSubscription(beforeJob.sub!)).toBe("free");

    const summary = await processExpiredSubscriptions();
    expect(summary.processed).toBeGreaterThanOrEqual(1);

    const afterJob = await readState(businessId);
    expect(afterJob.sub?.status).toBe("expired");
    expect(afterJob.sub?.plan).toBe("business");
    expect(afterJob.plan).toBe("free");
    expect(await sqlGrantsPaidAccess(businessId)).toBe(false);
  });
});
