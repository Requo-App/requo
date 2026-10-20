/**
 * Time to first team response, and the rate behind it.
 *
 * The average only covers the inquiries that got a reply, so the rate has to
 * be part of the measure — otherwise a business that leaves inquiries
 * unanswered reads as fast on this number.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb, testExecuteRows } = await import("../support/db");

  return {
    db: testDb,
    executeRows: testExecuteRows,
    dbConnection: { end: async () => {} },
  };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import { getFirstResponseMetric } from "@/features/analytics/queries";
import { activityLogs, inquiries } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "analytics_first_response";
let ids: WorkflowFixtureIds;

const windowStart = new Date("2026-02-10T00:00:00.000Z");
const windowEnd = new Date("2026-02-11T00:00:00.000Z");

async function moveInquiryIntoWindow(inquiryId: string, submittedAt: Date) {
  await testDb
    .update(inquiries)
    .set({ submittedAt, createdAt: submittedAt, updatedAt: submittedAt })
    .where(eq(inquiries.id, inquiryId));
}

describe("analytics first response", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);

    await moveInquiryIntoWindow(ids.inquiryId, windowStart);
    await moveInquiryIntoWindow(ids.waitingInquiryId, windowStart);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("counts the unanswered inquiries instead of dropping them", async () => {
    // Only one of the two inquiries gets a reply.
    await testDb.insert(activityLogs).values({
      id: `${prefix}_log_note`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      actorUserId: ids.ownerUserId,
      type: "inquiry.note_added",
      summary: "Called the customer.",
      metadata: {},
      createdAt: new Date("2026-02-10T05:00:00.000Z"),
    });

    const metric = await getFirstResponseMetric(
      ids.businessId,
      windowStart,
      windowEnd,
    );

    expect(metric.total).toBe(2);
    expect(metric.answered).toBe(1);
    // Five hours between submission and the reply.
    expect(metric.hours).toBe(5);
  }, 30_000);

  it("does not count a bookkeeping entry as a response", async () => {
    await testDb.insert(activityLogs).values({
      id: `${prefix}_log_archived`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      actorUserId: ids.ownerUserId,
      type: "inquiry.archived",
      summary: "Archived the inquiry.",
      metadata: {},
      createdAt: new Date("2026-02-10T05:00:00.000Z"),
    });

    const metric = await getFirstResponseMetric(
      ids.businessId,
      windowStart,
      windowEnd,
    );

    expect(metric.total).toBe(2);
    expect(metric.answered).toBe(0);
    expect(metric.hours).toBeNull();
  }, 30_000);

  it("does not count another business's activity", async () => {
    await testDb.insert(activityLogs).values({
      id: `${prefix}_log_other_business`,
      businessId: ids.otherBusinessId,
      inquiryId: ids.otherInquiryId,
      actorUserId: ids.ownerUserId,
      type: "inquiry.note_added",
      summary: "Belongs to another business.",
      metadata: {},
      createdAt: new Date("2026-02-10T05:00:00.000Z"),
    });

    const metric = await getFirstResponseMetric(
      ids.businessId,
      windowStart,
      windowEnd,
    );

    expect(metric.answered).toBe(0);
    expect(metric.total).toBe(2);
  }, 30_000);
});
