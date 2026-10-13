import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");
  return { db: mockedDb };
});

const authState = vi.hoisted(() => ({ userId: "" }));
const cookieState = vi.hoisted(() => ({ slug: "" }));

vi.mock("@/lib/auth/session", () => {
  const session = async () => ({ user: { id: authState.userId } });
  const user = async () => ({ id: authState.userId });
  return {
    getSession: vi.fn(session),
    getOptionalSession: vi.fn(session),
    requireSession: vi.fn(session),
    requireUser: vi.fn(user),
    getCurrentUser: vi.fn(user),
  };
});

// The operational settings action resolves its business from the active-slug
// cookie, so the store is bound to the fixture business.
vi.mock("next/headers", async () => {
  const { activeBusinessSlugCookieName } = await import(
    "@/features/businesses/routes"
  );

  return {
    cookies: vi.fn(async () => ({
      get: (name: string) =>
        name === activeBusinessSlugCookieName && cookieState.slug
          ? { name, value: cookieState.slug }
          : undefined,
    })),
    headers: vi.fn(async () => new Headers()),
  };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

/**
 * Plan-based authorization integration tests.
 *
 * Validates that server-side enforcement remains intact:
 * - Server actions reject unauthorized operations based on plan
 * - Users cannot bypass UI restrictions by calling endpoints directly
 * - Error messages clearly communicate upgrade requirements
 *
 * This ensures that making features visible in the UI (for discovery)
 * does not weaken actual authorization.
 *
 * Two details shape this file:
 *
 * 1. `businesses.plan` is only a denormalized read cache. The effective plan
 *    resolves through `business_subscriptions` (fail-closed to `free` when no
 *    row exists), so granting a plan means writing a subscription row.
 * 2. The effective plan is resolved from the requested business's own
 *    `business_subscriptions` row. The suite acts as `outsiderUserId`, who
 *    owns exactly one business, so the authorization assertions stay scoped.
 *
 * `knowledgeBase` is available on every plan and metered by source count
 * instead (see `lib/plans/usage-limits.ts`), so the AI agent — the pro-gated
 * surface that shares the same enforcement copy — is the vehicle for the
 * action-level assertions.
 */

import { updateBusinessAiAgentSettingsAction } from "@/features/settings/actions";
import { getRequiredPlan, hasFeatureAccess } from "@/lib/plans/entitlements";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { businessSubscriptions } from "@/lib/db/schema";

const prefix = "test_plan_authz";
let ids: WorkflowFixtureIds;

/** Grant a paid plan to the acting owner's only business. */
async function grantPlan(plan: "pro" | "business") {
  await testDb
    .delete(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, ids.otherBusinessId));

  await testDb.insert(businessSubscriptions).values({
    id: `${prefix}_subscription`,
    businessId: ids.otherBusinessId,
    status: "active",
    plan,
    billingProvider: "polar",
    billingCurrency: "USD",
  });
}

/** Drop back to the free entitlement (no subscription row at all). */
async function revokePlan() {
  await testDb
    .delete(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, ids.otherBusinessId));
}

function aiAgentFormData() {
  const formData = new FormData();
  formData.set("aiAgentEnabled", "on");
  formData.set("tone", "friendly");
  formData.set("aiAgentInstructions", "Keep answers brief.");
  return formData;
}

function updateAiAgentSettings() {
  return updateBusinessAiAgentSettingsAction({ error: "" }, aiAgentFormData());
}

describe("Plan-based authorization — server-side enforcement", () => {
  beforeAll(async () => {
    ids = await createWorkflowFixture(prefix);

    authState.userId = ids.outsiderUserId;
    cookieState.slug = ids.otherBusinessSlug;

    await revokePlan();
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  describe("AI agent (aiAgent feature)", () => {
    it("rejects enabling the AI agent on the free plan", async () => {
      await revokePlan();

      const result = await updateAiAgentSettings();

      expect(result.error).toBeDefined();
      expect(result.error).toContain("plan does not include");
    });

    it("allows enabling the AI agent once the business is on Pro", async () => {
      await grantPlan("pro");

      const result = await updateAiAgentSettings();

      expect(result.error ?? "").not.toContain("plan does not include");
      expect(result.success).toBeDefined();
    });
  });

  describe("Plan transitions", () => {
    it("denies access immediately after a downgrade", async () => {
      await grantPlan("pro");
      const onPro = await updateAiAgentSettings();
      expect(onPro.success).toBeDefined();

      await revokePlan();
      const onFree = await updateAiAgentSettings();

      expect(onFree.error).toBeDefined();
      expect(onFree.error).toContain("plan does not include");
    });

    it("grants access immediately after an upgrade", async () => {
      await revokePlan();
      const onFree = await updateAiAgentSettings();
      expect(onFree.error).toContain("plan does not include");

      await grantPlan("pro");
      const onPro = await updateAiAgentSettings();

      expect(onPro.success).toBeDefined();
      expect(onPro.error ?? "").not.toContain("plan does not include");
    });
  });

  describe("Business plan bypass", () => {
    it("gives the business plan access to the pro-gated feature", async () => {
      await grantPlan("business");

      const result = await updateAiAgentSettings();

      expect(result.error ?? "").not.toContain("plan does not include");
      expect(result.error ?? "").not.toContain("Upgrade to");

      await revokePlan();
    });
  });

  describe("Entitlement helper consistency", () => {
    it("matches the documented per-plan feature map", () => {
      // Knowledge base ships on every plan, metered by source count.
      expect(hasFeatureAccess("free", "knowledgeBase")).toBe(true);
      expect(hasFeatureAccess("pro", "knowledgeBase")).toBe(true);
      expect(hasFeatureAccess("business", "knowledgeBase")).toBe(true);
      expect(getRequiredPlan("knowledgeBase")).toBeNull();

      // The AI agent is the pro gate the action above enforces.
      expect(hasFeatureAccess("free", "aiAgent")).toBe(false);
      expect(hasFeatureAccess("pro", "aiAgent")).toBe(true);
      expect(hasFeatureAccess("business", "aiAgent")).toBe(true);
      expect(getRequiredPlan("aiAgent")).toBe("pro");

      // Team members remain a business-tier capability.
      expect(hasFeatureAccess("free", "members")).toBe(false);
      expect(hasFeatureAccess("pro", "members")).toBe(false);
      expect(hasFeatureAccess("business", "members")).toBe(true);
      expect(getRequiredPlan("members")).toBe("business");
    });
  });
});
