import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

/**
 * DB-backed regression tests for the follow-up list layer.
 *
 * The list is the owner's main working surface: the filters, the search and
 * the day buckets all have to agree with the business timezone, and a deleted
 * follow-up must stop counting as pending work.
 */

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

import {
  getFollowUpListCountForBusiness,
  getFollowUpListPageForBusiness,
} from "@/features/follow-ups/queries";
import {
  createFollowUpForBusiness,
  deleteFollowUpForBusiness,
} from "@/features/follow-ups/mutations";
import { getInquiryListPageForBusiness } from "@/features/inquiries/queries";
import { inquiryListFiltersSchema } from "@/features/inquiries/schemas";
import { businesses, followUps, inquiries } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

const TIMEZONE = "Europe/Berlin";

const inquiryListFilters = {
  ...inquiryListFiltersSchema.parse({}),
  unread: false as const,
};

async function insertFollowUp(
  overrides: Partial<{
    title: string;
    reason: string;
    dueDate: string;
    status: "pending" | "completed" | "skipped";
    sendMode: "manual" | "automatic";
  }> = {},
) {
  const result = await createFollowUpForBusiness({
    businessId: ids.businessId,
    inquiryId: ids.inquiryId,
    quoteId: null,
    actorUserId: ids.ownerUserId,
    followUp: {
      title: "Call the customer",
      reason: "They asked for a callback.",
      channel: "email",
      category: "sales",
      sendMode: "manual",
      dueDate: "2026-02-01",
      recurrence: "none",
      recurrenceLimit: null,
      terminationCondition: null,
      ...overrides,
    },
    timezone: TIMEZONE,
  });

  return result!;
}

describe("features/follow-ups list", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);

    // The business timezone drives every day bucket and the rendered due
    // date, so the fixture has to carry it explicitly.
    await testDb
      .update(businesses)
      .set({ timezone: TIMEZONE })
      .where(eq(businesses.id, ids.businessId));
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("counts and lists the follow-ups of the business", async () => {
    await insertFollowUp({ title: "Alpha follow-up" });
    await insertFollowUp({ title: "Beta follow-up" });

    const filters = {
      status: "all" as const,
      due: "all" as const,
      sort: "due_asc" as const,
      q: undefined,
    };

    const count = await getFollowUpListCountForBusiness({
      businessId: ids.businessId,
      filters,
      timezone: TIMEZONE,
    });

    expect(count).toBe(2);

    const rows = await getFollowUpListPageForBusiness({
      businessId: ids.businessId,
      filters,
      page: 1,
      pageSize: 25,
      timezone: TIMEZONE,
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].businessTimezone).toBe(TIMEZONE);
  });

  it("does not leak another business's follow-ups", async () => {
    await insertFollowUp();

    const filters = {
      status: "all" as const,
      due: "all" as const,
      sort: "due_asc" as const,
      q: undefined,
    };

    const count = await getFollowUpListCountForBusiness({
      businessId: ids.otherBusinessId,
      filters,
      timezone: TIMEZONE,
    });

    expect(count).toBe(0);
  });

  it("escapes LIKE wildcards in the search term", async () => {
    await insertFollowUp({ title: "50% deposit due" });
    await insertFollowUp({ title: "Regular call" });

    const literal = {
      status: "all" as const,
      due: "all" as const,
      sort: "due_asc" as const,
      q: "50%",
    };

    const literalCount = await getFollowUpListCountForBusiness({
      businessId: ids.businessId,
      filters: literal,
      timezone: TIMEZONE,
    });

    // A literal `50%` matches only the row that contains it — an unescaped
    // `%` would also match "Regular call".
    expect(literalCount).toBe(1);
  });

  it("keeps a terminal-status row when a due bucket is also selected", async () => {
    const created = await insertFollowUp({ title: "Finished work" });

    await testDb
      .update(followUps)
      .set({ status: "completed", completedAt: new Date("2026-01-02T08:00:00.000Z") })
      .where(eq(followUps.id, created.followUpId));

    const filters = {
      status: "completed" as const,
      due: "overdue" as const,
      sort: "due_asc" as const,
      q: undefined,
    };

    const rows = await getFollowUpListPageForBusiness({
      businessId: ids.businessId,
      filters,
      page: 1,
      pageSize: 25,
      timezone: TIMEZONE,
    });

    // The due bucket only applies to pending work, so the completed row is
    // still listed rather than dropped by a contradictory filter.
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(created.followUpId);
  });

  it("keeps a soft-deleted follow-up out of the inquiry's pending count", async () => {
    const created = await insertFollowUp();

    await deleteFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created.followUpId,
      actorUserId: ids.ownerUserId,
    });

    const [inquiry] = await testDb
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, ids.inquiryId));

    expect(inquiry).toBeDefined();

    const rows = await getInquiryListPageForBusiness({
      businessId: ids.businessId,
      filters: inquiryListFilters,
      page: 1,
      pageSize: 25,
    });

    const row = rows.find((item) => item.id === ids.inquiryId);

    expect(row?.pendingFollowUpCount ?? 0).toBe(0);
  });

  it("counts a pending follow-up on the inquiry", async () => {
    await insertFollowUp();

    const rows = await getInquiryListPageForBusiness({
      businessId: ids.businessId,
      filters: inquiryListFilters,
      page: 1,
      pageSize: 25,
    });

    const row = rows.find((item) => item.id === ids.inquiryId);

    expect(row?.pendingFollowUpCount ?? 0).toBe(1);
  });

  it("keeps only the tenant's rows after a delete", async () => {
    const created = await insertFollowUp();

    await deleteFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created.followUpId,
      actorUserId: ids.ownerUserId,
    });

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(
        and(
          eq(followUps.id, created.followUpId),
          eq(followUps.businessId, ids.businessId),
        ),
      );

    expect(row.deletedAt).not.toBeNull();
  });
});
