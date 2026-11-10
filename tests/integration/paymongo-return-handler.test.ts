import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";

const mocks = vi.hoisted(() => ({
  userId: "",
  payment: null as null | { id: string; amount: number; currency: string; paidAt: Date },
  retrieve: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("react", () => ({ cache: <T extends (...args: never[]) => unknown>(fn: T) => fn }));
vi.mock("@/lib/db/client", async () => {
  const { testDb } = await import("../support/db");
  return { db: testDb };
});
vi.mock("next/cache", () => ({ cacheLife: vi.fn(), cacheTag: vi.fn(), updateTag: vi.fn(), revalidateTag: mocks.revalidate }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("notFound"); },
  redirect: (path: string) => { throw new Error(`redirect:${path}`); },
}));
vi.mock("@/lib/deployment", () => ({ isBillingProviderEnabled: () => true }));
vi.mock("@/lib/auth/session", () => ({ requireSession: async () => ({ user: { id: mocks.userId } }) }));
vi.mock("@/lib/billing/paymongo-client", () => ({
  retrievePaymongoCheckoutSession: mocks.retrieve,
  getPaidCheckoutPayment: () => mocks.payment,
}));

import { GET } from "@/app/(checkout)/billing/paymongo/return/sync/route";
import { attachPaymongoCheckoutSession, createPaymongoCheckoutIntent } from "@/lib/billing/paymongo-checkout";
import { getBusinessBillingCacheTags } from "@/lib/cache/shell-tags";
import { user } from "@/lib/db/schema/auth";
import { businesses } from "@/lib/db/schema/businesses";
import { businessSubscriptions, paymongoCheckoutIntents, paymentAttempts } from "@/lib/db/schema/subscriptions";
import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const PREFIX = derivePerFilePrefix("paymongo-return-handler.test.ts");

describe("PayMongo return handler with a database", () => {
  afterAll(async () => {
    await testDb.delete(paymentAttempts).where(like(paymentAttempts.businessId, `${PREFIX}%`));
    await testDb.delete(paymongoCheckoutIntents).where(like(paymongoCheckoutIntents.businessId, `${PREFIX}%`));
    await testDb.delete(businessSubscriptions).where(like(businessSubscriptions.businessId, `${PREFIX}%`));
    await testDb.delete(businesses).where(like(businesses.id, `${PREFIX}%`));
    await testDb.delete(user).where(like(user.id, `${PREFIX}%`));
    await closeTestDb();
  });

  it("activates only the intent owner’s paid checkout and invalidates billing caches", async () => {
    const userId = `${PREFIX}_user`;
    const businessId = `${PREFIX}_business`;
    const now = new Date();
    await testDb.insert(user).values({ id: userId, name: "Test", email: `${userId}@example.com`, emailVerified: true, createdAt: now, updatedAt: now });
    await testDb.insert(businesses).values({ id: businessId, ownerUserId: userId, name: "Test", slug: businessId.replace(/_/g, "-"), plan: "free", businessType: "general_project_services", defaultCurrency: "PHP", createdAt: now, updatedAt: now });
    const intent = await createPaymongoCheckoutIntent({ businessId, userId, plan: "pro", interval: "monthly" });
    await attachPaymongoCheckoutSession(intent.id, `${PREFIX}_session`);
    mocks.payment = { id: `${PREFIX}_payment`, amount: intent.amount, currency: "PHP", paidAt: now };
    const request = () => new Request(`https://requo.test/billing/paymongo/return/sync?intent=${intent.id}`);

    mocks.userId = `${PREFIX}_other`;
    await expect(GET(request())).rejects.toThrow("redirect:/billing/paymongo/return?");
    expect(mocks.retrieve).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
    const [pending] = await testDb.select().from(paymongoCheckoutIntents).where(eq(paymongoCheckoutIntents.id, intent.id));
    expect(pending.status).toBe("pending");

    mocks.userId = userId;
    await expect(GET(request())).rejects.toThrow("redirect:/billing/paymongo/return?");
    const [activated] = await testDb.select().from(paymongoCheckoutIntents).where(eq(paymongoCheckoutIntents.id, intent.id));
    const [subscription] = await testDb.select().from(businessSubscriptions).where(eq(businessSubscriptions.businessId, businessId));
    expect(activated.status).toBe("succeeded");
    expect(subscription.plan).toBe("pro");
    expect(mocks.revalidate.mock.calls).toEqual(getBusinessBillingCacheTags(businessId).map((tag) => [tag, "max"]));
  });
});
