import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const cacheMocks = vi.hoisted(() => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => cacheMocks);

vi.mock("@/lib/db/business-access", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/db/business-access")>()),
  getOwnerBusinessActionContext: async () => ({
    ok: true,
    user: { id: fixtureIds.ownerUserId },
    businessContext: {
      business: {
        id: fixtureIds.businessId,
        slug: fixtureIds.businessSlug,
      },
    },
  }),
}));

import {
  removeBusinessMemberAction,
  updateBusinessMemberRoleAction,
} from "@/features/business-members/actions";
import { businessMembers } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  getWorkflowFixtureIds,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(import.meta.url);
const fixtureIds: WorkflowFixtureIds = getWorkflowFixtureIds(prefix);
const membershipIds = new Map<string, string>();

function actionForm(values: Record<string, string>) {
  const formData = new FormData();

  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }

  return formData;
}

function invalidatedTags() {
  return cacheMocks.updateTag.mock.calls.map(([tag]) => tag);
}

describe("business member cache invalidation", () => {
  beforeAll(async () => {
    await createWorkflowFixture(prefix);

    const memberships = await testDb
      .select({
        id: businessMembers.id,
        userId: businessMembers.userId,
      })
      .from(businessMembers)
      .where(eq(businessMembers.businessId, fixtureIds.businessId));

    for (const membership of memberships) {
      membershipIds.set(membership.userId, membership.id);
    }
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("invalidates the affected member's shell after a role change", async () => {
    cacheMocks.updateTag.mockClear();

    const result = await updateBusinessMemberRoleAction(
      {},
      actionForm({
        membershipId: membershipIds.get(fixtureIds.staffUserId) ?? "",
        role: "manager",
        userId: fixtureIds.staffUserId,
      }),
    );

    expect(result).toEqual({ success: "Member updated." });
    expect(invalidatedTags()).toEqual(
      expect.arrayContaining([
        `business:${fixtureIds.businessId}:members`,
        `user:${fixtureIds.staffUserId}:memberships`,
        `user:${fixtureIds.staffUserId}:business-context:${fixtureIds.businessSlug}`,
      ]),
    );
  });

  it("invalidates the removed member's shell after removal", async () => {
    const membershipId = membershipIds.get(fixtureIds.managerUserId) ?? "";
    cacheMocks.updateTag.mockClear();

    const result = await removeBusinessMemberAction(
      {},
      actionForm({
        membershipId,
        userId: fixtureIds.managerUserId,
      }),
    );

    expect(result).toEqual({ success: "Member removed." });
    expect(invalidatedTags()).toEqual(
      expect.arrayContaining([
        `business:${fixtureIds.businessId}:members`,
        `user:${fixtureIds.managerUserId}:memberships`,
        `user:${fixtureIds.managerUserId}:business-context:${fixtureIds.businessSlug}`,
      ]),
    );

    const remaining = await testDb
      .select({ id: businessMembers.id })
      .from(businessMembers)
      .where(eq(businessMembers.id, membershipId));

    expect(remaining).toEqual([]);
  });
});
