import { afterAll, describe, expect, it, vi } from "vitest";
import { like } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb } = await import("../support/db");
  return { db: testDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { createRecipeVersionForBusiness } from "@/features/businesses/pack-recipes";
import {
  acceptBusinessInviteLink,
  getOrCreateBusinessInviteLink,
} from "@/features/business-members/mutations";
import {
  businessMembers,
  businessSubscriptions,
  businesses,
  user,
  type BillingCurrency,
  type SubscriptionStatus,
} from "@/lib/db/schema";
import { closeTestDb, testDb } from "@/tests/support/db";

const PREFIX = "plan_effective_gates";
const NOW = new Date("2026-04-20T00:00:00.000Z");

type SeedSubscription = {
  status: SubscriptionStatus;
  plan: "pro" | "business";
  currentPeriodEnd?: Date;
  currency?: BillingCurrency;
};

async function createUser(suffix: string) {
  const userId = `${PREFIX}_${suffix}`;

  await testDb.insert(user).values({
    id: userId,
    name: "Plan Gate Test User",
    email: `${userId}@example.com`,
    emailVerified: true,
    createdAt: NOW,
    updatedAt: NOW,
  });

  return userId;
}

async function seedBusiness({
  suffix,
  cachedPlan,
  subscription,
}: {
  suffix: string;
  cachedPlan: "free" | "pro" | "business";
  subscription?: SeedSubscription;
}) {
  const ownerId = await createUser(`${suffix}_owner`);
  const businessId = `${PREFIX}_${suffix}_biz`;

  await testDb.insert(businesses).values({
    id: businessId,
    ownerUserId: ownerId,
    name: "Plan Gate Test Biz",
    slug: businessId.replace(/_/g, "-"),
    plan: cachedPlan,
    businessType: "general_project_services",
    defaultCurrency: "USD",
    createdAt: NOW,
    updatedAt: NOW,
  });

  await testDb.insert(businessMembers).values({
    id: `${PREFIX}_${suffix}_owner_member`,
    businessId,
    userId: ownerId,
    role: "owner",
  });

  if (subscription) {
    await testDb.insert(businessSubscriptions).values({
      id: `${PREFIX}_${suffix}_sub`,
      businessId,
      status: subscription.status,
      plan: subscription.plan,
      billingProvider: "polar",
      billingCurrency: subscription.currency ?? "USD",
      currentPeriodStart: NOW,
      currentPeriodEnd: subscription.currentPeriodEnd ?? NOW,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }

  return {
    ownerId,
    businessId,
    businessSlug: businessId.replace(/_/g, "-"),
  };
}

const recipeInput = {
  pack: "contractors_home_services" as const,
  kind: "scope" as const,
  config: {
    version: 1,
    requiredKinds: ["deliverables"],
    recommendedKinds: ["exclusions"],
  },
  actorRole: "owner" as const,
};

afterAll(async () => {
  await testDb.delete(businesses).where(like(businesses.id, `${PREFIX}%`));
  await testDb.delete(user).where(like(user.id, `${PREFIX}%`));
  await closeTestDb();
});

describe("effective-plan gates", () => {
  it("rejects recipe editing when the cached plan is Pro but the subscription expired", async () => {
    const { businessId } = await seedBusiness({
      suffix: "recipe_expired",
      cachedPlan: "pro",
      subscription: { status: "expired", plan: "pro" },
    });

    await expect(
      createRecipeVersionForBusiness({ businessId, ...recipeInput }),
    ).rejects.toThrow("Recipe customization requires a Pro plan or higher.");
  });

  it("allows recipe editing when the cached plan is Free but the subscription is active Pro", async () => {
    const { businessId } = await seedBusiness({
      suffix: "recipe_active",
      cachedPlan: "free",
      subscription: { status: "active", plan: "pro" },
    });

    const recipe = await createRecipeVersionForBusiness({
      businessId,
      ...recipeInput,
    });

    expect(recipe.version).toBe(1);
  });

  it("rejects invite acceptance when the cached plan is Business but the subscription expired", async () => {
    const { businessId, ownerId } = await seedBusiness({
      suffix: "invite_expired",
      cachedPlan: "business",
      subscription: { status: "expired", plan: "business" },
    });
    const inviteeId = await createUser("invite_expired_invitee");
    const { token } = await getOrCreateBusinessInviteLink({
      businessId,
      userId: ownerId,
    });

    const result = await acceptBusinessInviteLink({
      inviteToken: token,
      userId: inviteeId,
    });

    expect(result).toEqual({
      ok: false,
      error: "This business supports up to 1 member, including the owner.",
    });
  });

  it("allows invite acceptance when the cached plan is Free but the subscription is active Business", async () => {
    const { businessId, businessSlug, ownerId } = await seedBusiness({
      suffix: "invite_active",
      cachedPlan: "free",
      subscription: { status: "active", plan: "business" },
    });
    const inviteeId = await createUser("invite_active_invitee");
    const { token } = await getOrCreateBusinessInviteLink({
      businessId,
      userId: ownerId,
    });

    const result = await acceptBusinessInviteLink({
      inviteToken: token,
      userId: inviteeId,
    });

    expect(result).toEqual({ ok: true, businessId, businessSlug });
  });
});
