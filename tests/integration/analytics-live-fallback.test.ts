/**
 * The live-rollup fallback: the analytics series must carry every metric of a
 * day on that day, even when the day has no form view and the nightly rollup
 * has never processed it.
 *
 * The fallback used to chain `full outer join`s that all anchored on the form
 * view date. A day without a form view was split across several rows and the
 * reader kept only the last of them, so quotes sent and revenue won read as
 * zero. These cases pin the fix.
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

import { getOverviewData } from "@/features/analytics/queries";
import type { AnalyticsWindow } from "@/features/analytics/lib/window";
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

const prefix = "analytics_live_fallback";
let ids: WorkflowFixtureIds;

// A window well in the past, so "today" is never part of the series and the
// live fallback is the only source for these days.
const dayOne = new Date("2026-02-10T00:00:00.000Z");
const dayTwo = new Date("2026-02-11T00:00:00.000Z");
const dayOneKey = "2026-02-10";
const dayTwoKey = "2026-02-11";

function windowFor(): AnalyticsWindow {
  return {
    preset: "custom",
    since: dayOne,
    until: dayTwo,
    bucket: "day",
    label: "Feb 10 – Feb 11, 2026",
    comparison: null,
    clamped: false,
    cappedAllTime: false,
  };
}

async function seriesForDay(key: string) {
  const data = await getOverviewData({
    businessId: ids.businessId,
    businessSlug: ids.businessSlug,
    window: windowFor(),
  });

  return data.series.find((point) => point.key === key);
}

describe("analytics live-rollup fallback", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);

    // The fixture's inquiry is dated after the window; move it inside it.
    await testDb
      .update(inquiries)
      .set({ submittedAt: dayOne, createdAt: dayOne, updatedAt: dayOne })
      .where(eq(inquiries.id, ids.inquiryId));

    // No rollup rows for the window: the fallback has to do the work.
    await testDb
      .delete(analyticsDailyRollups)
      .where(eq(analyticsDailyRollups.businessId, ids.businessId));
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("keeps every metric of a day that has no form view on that day", async () => {
    // A quote sent and accepted the day after the inquiry. Neither day has a
    // form view, so the day's numbers have to survive on their own.
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
      validUntil: "2026-03-10",
      sentAt: dayTwo,
      acceptedAt: dayTwo,
      createdAt: dayOne,
      updatedAt: dayTwo,
    });

    const quoteDay = await seriesForDay(dayTwoKey);

    expect(quoteDay).toBeDefined();
    // The day has no form view, so form views and visitors stay at zero.
    expect(quoteDay?.formViews).toBe(0);
    expect(quoteDay?.visitors).toBe(0);
    // The quote sent and accepted that day must not be lost with the rest.
    expect(quoteDay?.quotesSent).toBe(1);
    expect(quoteDay?.quotesAccepted).toBe(1);
    expect(quoteDay?.revenueInCents).toBe(250_000);
  }, 30_000);

  it("counts an inquiry on a day that has no form view", async () => {
    const inquiryDay = await seriesForDay(dayOneKey);

    expect(inquiryDay).toBeDefined();
    expect(inquiryDay?.inquiries).toBe(1);
    expect(inquiryDay?.formViews).toBe(0);
  }, 30_000);

  it("counts a form view and the quote that shares its day", async () => {
    // The same day carries a form view and a quote: the join must keep both.
    await testDb.insert(quotes).values({
      id: `${prefix}_quote_same_day`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteNumber: "Q-2",
      title: "Storefront graphics",
      customerName: "Taylor Nguyen",
      customerContactHandle: "taylor@example.com",
      customerEmail: "taylor@example.com",
      status: "sent",
      totalInCents: 120_000,
      validUntil: "2026-03-10",
      sentAt: dayOne,
      createdAt: dayOne,
      updatedAt: dayOne,
    });

    await testDb.insert(analyticsEvents).values({
      id: `${prefix}_event`,
      businessId: ids.businessId,
      serviceId: ids.serviceId,
      eventType: "inquiry_form_viewed",
      visitorHash: "visitor-hash-1",
      occurredAt: dayOne,
    });

    const day = await seriesForDay(dayOneKey);

    expect(day?.formViews).toBe(1);
    expect(day?.visitors).toBe(1);
    expect(day?.inquiries).toBe(1);
    expect(day?.quotesSent).toBe(1);
  }, 30_000);

  it("does not count another business's activity", async () => {
    await testDb.insert(quotes).values({
      id: `${prefix}_quote_other_business`,
      businessId: ids.otherBusinessId,
      inquiryId: ids.otherInquiryId,
      quoteNumber: "Q-3",
      title: "Other work",
      customerName: "Other Customer",
      customerContactHandle: "other@example.com",
      customerEmail: "other@example.com",
      status: "sent",
      totalInCents: 999_000,
      validUntil: "2026-03-10",
      sentAt: dayTwo,
      createdAt: dayOne,
      updatedAt: dayTwo,
    });

    const day = await seriesForDay(dayTwoKey);

    expect(day?.quotesSent).toBe(0);
  }, 30_000);
});
