import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

vi.mock("react", () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) => fn,
}));

vi.mock("@/lib/db/client", async () => {
  const { testDb, testExecuteRows } = await import("../support/db");
  return { db: testDb, executeRows: testExecuteRows };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers(),
}));

vi.mock("@/lib/auth/server", () => ({ auth: {} }));

vi.mock("@/features/admin/access", () => ({
  requireAdminUser: async () => ({
    user: {
      id: "admin_business_selection_test_admin",
      name: "Test Admin",
      email: "admin-business-selection@example.com",
    },
    session: { session: {} },
  }),
}));

vi.mock("@/features/admin/confirm", () => ({
  consumePasswordConfirmToken: async () => ({ ok: true }),
}));

import { manualPlanOverrideAction } from "@/features/admin/mutations";
import {
  getAdminUserBillingActivity,
  getAdminUserDetailCore,
} from "@/features/admin/queries";
import { adminAuditLogs, businesses, businessSubscriptions, user } from "@/lib/db/schema";
import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const PREFIX = derivePerFilePrefix("admin-business-selection.test.ts");
const ADMIN_ID = `${PREFIX}_admin`;
const date = (day: number) => new Date(Date.UTC(2026, 0, day));

async function seedUser(suffix: string) {
  const id = `${PREFIX}_${suffix}`;
  await testDb.insert(user).values({
    id,
    name: "Business Selection Test",
    email: `${id}@example.com`,
  });
  return id;
}

async function seedBusiness(
  ownerUserId: string,
  suffix: string,
  createdDay: number,
  subscriptionDay?: number,
  deleted = false,
) {
  const id = `${ownerUserId}_${suffix}`;
  await testDb.insert(businesses).values({
    id,
    ownerUserId,
    name: "Business Selection Test",
    slug: id.replaceAll("_", "-"),
    createdAt: date(createdDay),
    deletedAt: deleted ? date(31) : null,
    plan: subscriptionDay ? "pro" : "free",
  });
  if (subscriptionDay) {
    await testDb.insert(businessSubscriptions).values({
      id: `${id}_sub`,
      businessId: id,
      plan: "pro",
      status: "active",
      billingProvider: "polar",
      billingCurrency: "PHP",
      createdAt: date(subscriptionDay),
    });
  }
  return id;
}

async function expectSelectedSubscription(userId: string, businessId: string | null) {
  const core = await getAdminUserDetailCore(userId);
  const activity = await getAdminUserBillingActivity(userId);
  expect(core?.subscription?.id ?? null).toBe(businessId ? `${businessId}_sub` : null);
  expect(activity.subscription?.businessId ?? null).toBe(businessId);
}

async function override(userId: string) {
  return manualPlanOverrideAction({
    userId,
    plan: "business",
    confirmToken: "synthetic-confirm-token",
  });
}

async function readPlan(businessId: string) {
  const [row] = await testDb
    .select({ plan: businesses.plan })
    .from(businesses)
    .where(eq(businesses.id, businessId));
  return row?.plan;
}

describe("admin user billing business selection", () => {
  beforeAll(async () => {
    await seedUser("admin");
  });

  afterAll(async () => {
    await testDb.delete(adminAuditLogs).where(eq(adminAuditLogs.adminUserId, ADMIN_ID));
    await testDb.delete(businesses).where(like(businesses.id, `${PREFIX}%`));
    await testDb.delete(user).where(like(user.id, `${PREFIX}%`));
    await closeTestDb();
  });

  it("overrides the displayed newest subscription, excluding deleted and other owners' businesses", async () => {
    const userId = await seedUser("subscribed");
    const target = await seedBusiness(userId, "old_business", 1, 10);
    const olderSubscription = await seedBusiness(userId, "newer_business", 2, 5);
    const unsubscribed = await seedBusiness(userId, "newest_business", 20);
    const deleted = await seedBusiness(userId, "deleted_business", 25, 25, true);
    const otherUserId = await seedUser("other_owner");
    const other = await seedBusiness(otherUserId, "business", 30, 30);

    await expectSelectedSubscription(userId, target);
    expect((await override(userId)).ok).toBe(true);

    await expectSelectedSubscription(userId, target);
    expect(await readPlan(target)).toBe("business");
    for (const businessId of [olderSubscription, deleted, other]) {
      expect(await readPlan(businessId)).toBe("pro");
    }
    expect(await readPlan(unsubscribed)).toBe("free");
    const [subscription] = await testDb.select().from(businessSubscriptions)
      .where(eq(businessSubscriptions.businessId, target));
    expect(subscription.billingCurrency).toBe("PHP");
  });

  it("uses the same subscription ID tie breaker in both views and the override", async () => {
    const userId = await seedUser("tied");
    const other = await seedBusiness(userId, "a", 20, 10);
    const target = await seedBusiness(userId, "z", 1, 10);

    await expectSelectedSubscription(userId, target);
    expect((await override(userId)).ok).toBe(true);
    expect(await readPlan(target)).toBe("business");
    expect(await readPlan(other)).toBe("pro");
  });

  it("falls back to the newest non-deleted owned business when only deleted businesses have subscriptions", async () => {
    const userId = await seedUser("fallback");
    const older = await seedBusiness(userId, "older", 1);
    const target = await seedBusiness(userId, "newer", 10);
    const deleted = await seedBusiness(userId, "deleted", 20, 20, true);

    await expectSelectedSubscription(userId, null);
    expect((await override(userId)).ok).toBe(true);
    expect(await readPlan(target)).toBe("business");
    expect(await readPlan(older)).toBe("free");
    expect(await readPlan(deleted)).toBe("pro");
    const activity = await getAdminUserBillingActivity(userId);
    expect(activity.subscription?.businessId).toBe(target);
    expect(activity.subscription?.billingCurrency).toBe("USD");
  });

  it("rejects an override when all owned businesses are deleted", async () => {
    const userId = await seedUser("deleted_only");
    const deleted = await seedBusiness(userId, "deleted", 1, 1, true);

    await expectSelectedSubscription(userId, null);
    expect(await override(userId)).toMatchObject({
      ok: false,
      error: "That user has no businesses to bill.",
    });
    expect(await readPlan(deleted)).toBe("pro");
  });
});
