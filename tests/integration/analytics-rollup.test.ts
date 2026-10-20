/**
 * The nightly rollup and the live read path have to count the same thing.
 *
 * The analytics series mixes rollup days with live days on one chart, so a
 * metric that means one thing in the rollup and another in the live query
 * shows a step at the boundary. These cases pin the rollup's definitions to
 * the live ones.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

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

import { computeDailyRollups } from "@/features/analytics/jobs/rollup";
import {
  analyticsDailyRollups,
  analyticsEvents,
  inquiries,
  quotes,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "analytics_rollup";
let ids: WorkflowFixtureIds;

// A day of its own, so the rollup this test writes never lands on a day
// another test's window covers.
const targetDate = "2026-03-05";
const dayStart = new Date("2026-03-05T00:00:00.000Z");

async function rollupRow() {
  const [row] = await testDb
    .select()
    .from(analyticsDailyRollups)
    .where(
      and(
        eq(analyticsDailyRollups.businessId, ids.businessId),
        eq(analyticsDailyRollups.date, targetDate),
      ),
    )
    .limit(1);
  return row;
}

describe("analytics daily rollup definitions", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);

    // The fixture's inquiries are dated later; move one onto the target day
    // and delete the other, so a deleted record can be told from a live one.
    await testDb
      .update(inquiries)
      .set({
        submittedAt: dayStart,
        createdAt: dayStart,
        updatedAt: dayStart,
      })
      .where(eq(inquiries.id, ids.inquiryId));
    await testDb
      .update(inquiries)
      .set({
        submittedAt: dayStart,
        createdAt: dayStart,
        updatedAt: dayStart,
        deletedAt: dayStart,
      })
      .where(eq(inquiries.id, ids.waitingInquiryId));

    await testDb
      .delete(analyticsDailyRollups)
      .where(eq(analyticsDailyRollups.businessId, ids.businessId));
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("counts the same form views, visitors, inquiries, and quotes as the live path", async () => {
    await testDb.insert(quotes).values({
      id: `${prefix}_quote`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteNumber: "Q-1",
      title: "Storefront graphics",
      customerName: "Taylor Nguyen",
      customerContactHandle: "taylor@example.com",
      customerEmail: "taylor@example.com",
      status: "accepted",
      totalInCents: 250_000,
      validUntil: "2026-04-05",
      sentAt: dayStart,
      acceptedAt: dayStart,
      createdAt: dayStart,
      updatedAt: dayStart,
    });

    // A deleted quote is not activity.
    await testDb.insert(quotes).values({
      id: `${prefix}_quote_deleted`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteNumber: "Q-2",
      title: "Deleted work",
      customerName: "Taylor Nguyen",
      customerContactHandle: "taylor@example.com",
      customerEmail: "taylor@example.com",
      status: "sent",
      totalInCents: 10_000,
      validUntil: "2026-04-05",
      sentAt: dayStart,
      deletedAt: dayStart,
      createdAt: dayStart,
      updatedAt: dayStart,
    });

    // A form view that belongs to a form counts.
    await testDb.insert(analyticsEvents).values({
      id: `${prefix}_event_form`,
      businessId: ids.businessId,
      businessInquiryFormId: ids.formId,
      eventType: "inquiry_form_viewed",
      visitorHash: "visitor-hash-1",
      occurredAt: dayStart,
    });

    // A form view without a form does not — the live path ignores it.
    await testDb.insert(analyticsEvents).values({
      id: `${prefix}_event_no_form`,
      businessId: ids.businessId,
      businessInquiryFormId: null,
      eventType: "inquiry_form_viewed",
      visitorHash: "visitor-hash-2",
      occurredAt: dayStart,
    });

    // Another event type is not a visitor for the funnel.
    await testDb.insert(analyticsEvents).values({
      id: `${prefix}_event_other_type`,
      businessId: ids.businessId,
      businessInquiryFormId: ids.formId,
      eventType: "quote_public_viewed",
      visitorHash: "visitor-hash-3",
      occurredAt: dayStart,
    });

    await computeDailyRollups({ targetDate });

    const row = await rollupRow();
    expect(row).toBeDefined();
    expect(row?.formViews).toBe(1);
    expect(row?.uniqueVisitors).toBe(1);
    // The deleted inquiry is not a submission.
    expect(row?.inquirySubmissions).toBe(1);
    // The deleted quote is not a sent quote.
    expect(row?.quotesSent).toBe(1);
    expect(row?.quotesAccepted).toBe(1);
    expect(row?.revenueCents).toBe(250_000);
  }, 60_000);

  it("recomputes a day on demand", async () => {
    await computeDailyRollups({ targetDate });

    const first = await rollupRow();
    expect(first).toBeDefined();

    // A second run over the same day updates the row in place.
    await computeDailyRollups({ targetDate });

    const [rows] = await testDb
      .select({ id: analyticsDailyRollups.id })
      .from(analyticsDailyRollups)
      .where(
        and(
          eq(analyticsDailyRollups.businessId, ids.businessId),
          eq(analyticsDailyRollups.date, targetDate),
        ),
      );

    expect(rows).toHaveLength(1);
  }, 60_000);

  it("rejects a target date that is not a plain day", async () => {
    await expect(
      computeDailyRollups({ targetDate: "05-03-2026" }),
    ).rejects.toThrow(/YYYY-MM-DD/);
  }, 30_000);
});
