import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, desc, eq } from "drizzle-orm";

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
 * instead (see `lib/plans/usage-limits.ts`), so the Agent — the pro-gated
 * surface that shares the same enforcement copy — is the vehicle for the
 * action-level assertions.
 */

import { updateBusinessAgentSettingsAction } from "@/features/settings/actions";
import { getRequiredPlan, hasFeatureAccess } from "@/lib/plans/entitlements";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { activityLogs, businessSubscriptions } from "@/lib/db/schema";

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

function agentFormData() {
  const formData = new FormData();
  formData.set("agentEnabled", "on");
  formData.set("tone", "friendly");
  formData.set("agentInstructions", "Keep answers brief.");
  return formData;
}

function updateAgentSettings() {
  // The action is bound to the business slug so it always writes to the
  // business whose settings page rendered the form.
  return updateBusinessAgentSettingsAction(
    ids.otherBusinessSlug,
    { error: "" },
    agentFormData(),
  );
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

  describe("Agent (agent feature)", () => {
    it("rejects enabling the Agent on the free plan", async () => {
      await revokePlan();

      const result = await updateAgentSettings();

      expect(result.error).toBeDefined();
      expect(result.error).toContain("plan does not include");
    });

    it("allows enabling the Agent once the business is on Pro", async () => {
      await grantPlan("pro");

      const result = await updateAgentSettings();

      expect(result.error ?? "").not.toContain("plan does not include");
      expect(result.success).toBeDefined();
    });

    it("keeps the persisted aiAgentEnabled activity metadata key", async () => {
      await grantPlan("pro");

      const result = await updateAgentSettings();
      expect(result.success).toBeDefined();

      const [activity] = await testDb
        .select({ metadata: activityLogs.metadata })
        .from(activityLogs)
        .where(
          and(
            eq(activityLogs.businessId, ids.otherBusinessId),
            eq(activityLogs.actorUserId, ids.outsiderUserId),
            eq(activityLogs.type, "business.ai_agent_settings_updated"),
          ),
        )
        .orderBy(desc(activityLogs.createdAt))
        .limit(1);

      expect(activity?.metadata).toEqual(
        expect.objectContaining({
          aiAgentEnabled: true,
          tone: "friendly",
          hasInstructions: true,
        }),
      );
      expect(activity?.metadata).not.toHaveProperty("agentEnabled");
    });
  });

  describe("Plan transitions", () => {
    it("denies access immediately after a downgrade", async () => {
      await grantPlan("pro");
      const onPro = await updateAgentSettings();
      expect(onPro.success).toBeDefined();

      await revokePlan();
      const onFree = await updateAgentSettings();

      expect(onFree.error).toBeDefined();
      expect(onFree.error).toContain("plan does not include");
    });

    it("grants access immediately after an upgrade", async () => {
      await revokePlan();
      const onFree = await updateAgentSettings();
      expect(onFree.error).toContain("plan does not include");

      await grantPlan("pro");
      const onPro = await updateAgentSettings();

      expect(onPro.success).toBeDefined();
      expect(onPro.error ?? "").not.toContain("plan does not include");
    });
  });

  describe("Business plan bypass", () => {
    it("gives the business plan access to the pro-gated feature", async () => {
      await grantPlan("business");

      const result = await updateAgentSettings();

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

      // The Agent is the pro gate the action above enforces.
      expect(hasFeatureAccess("free", "agent")).toBe(false);
      expect(hasFeatureAccess("pro", "agent")).toBe(true);
      expect(hasFeatureAccess("business", "agent")).toBe(true);
      expect(getRequiredPlan("agent")).toBe("pro");

      // Team members remain a business-tier capability.
      expect(hasFeatureAccess("free", "members")).toBe(false);
      expect(hasFeatureAccess("pro", "members")).toBe(false);
      expect(hasFeatureAccess("business", "members")).toBe(true);
      expect(getRequiredPlan("members")).toBe("business");
    });
  });
});
