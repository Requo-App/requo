import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, inArray, ne } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb } = await import("../support/db");
  return { db: testDb };
});
vi.mock("@/lib/email/transactional", () => ({
  sendQuoteAutoFollowUpEmail: vi.fn().mockResolvedValue(true),
}));
vi.mock("@/lib/plans/usage", () => ({
  getDailyAutoFollowUpSendCount: vi.fn().mockResolvedValue(0),
  getMonthlyAutoFollowUpSendCount: vi.fn().mockResolvedValue(0),
}));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  isQuoteAutoFollowUpEmailEnabled: true,
}));

import { processQuoteAutoFollowUps } from "@/features/quotes/jobs/auto-follow-ups";
import { processQuoteExpiringSoon } from "@/features/quotes/jobs/expiring-soon";
import { processQuoteViewedFollowUps } from "@/features/quotes/jobs/viewed-follow-ups";
import { getLocalDateString } from "@/features/follow-ups/utils";
import {
  businesses,
  businessNotifications,
  businessSubscriptions,
  followUps,
  quotes,
} from "@/lib/db/schema";
import { sendQuoteAutoFollowUpEmail } from "@/lib/email/transactional";
import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

async function insertQuote(suffix: string, overrides: Partial<typeof quotes.$inferInsert> = {}) {
  const id = `${prefix}_${suffix}`;
  await testDb.insert(quotes).values({
    id,
    businessId: ids.businessId,
    quoteNumber: suffix,
    title: "Job test quote",
    customerName: "Job Customer",
    customerEmail: "customer@example.com",
    publicToken: `${id}_token`,
    status: "sent",
    validUntil: "2099-12-31",
    sentAt: new Date("2026-01-01T12:00:00Z"),
    ...overrides,
  });
  return id;
}

function setNow(value: string) {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(value));
}

describe("quote jobs with business-local dates", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    ids = await createWorkflowFixture(prefix);
    await testDb.insert(businessSubscriptions).values({
      id: `${prefix}_subscription`,
      businessId: ids.businessId,
      status: "active",
      plan: "pro",
      billingProvider: "polar",
      billingCurrency: "USD",
    });
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  });

  it("excludes expired quotes before the 50-row auto-follow-up limit", async () => {
    setNow("2026-06-10T02:00:00Z"); // Still June 9 in Honolulu.
    await testDb.update(businesses).set({ timezone: "Pacific/Honolulu" })
      .where(eq(businesses.id, ids.businessId));
    for (let index = 0; index < 55; index++) {
      await insertQuote(`expired_${index}`, {
        validUntil: "2026-06-08", autoFollowUpEnabled: true,
      });
    }
    const eligibleId = await insertQuote("eligible", {
      validUntil: "2026-06-09", autoFollowUpEnabled: true,
    });

    expect(await processQuoteAutoFollowUps()).toMatchObject({ sent: 1, errors: 0 });
    expect(sendQuoteAutoFollowUpEmail).toHaveBeenCalledTimes(1);
    expect(sendQuoteAutoFollowUpEmail).toHaveBeenCalledWith(
      expect.objectContaining({ quoteId: eligibleId }),
    );
    const [stored] = await testDb.select().from(quotes).where(eq(quotes.id, eligibleId));
    expect(stored.autoFollowUpAttempts).toBe(1);
  });

  it("does not auto-follow-up after a Pro trial has ended", async () => {
    await testDb
      .delete(businessSubscriptions)
      .where(eq(businessSubscriptions.businessId, ids.businessId));
    await testDb.insert(businessSubscriptions).values({
      id: `${prefix}_expired_trial`,
      businessId: ids.businessId,
      status: "trialing",
      plan: "pro",
      billingProvider: "polar",
      billingCurrency: "USD",
      currentPeriodStart: new Date("2026-05-20T00:00:00Z"),
      currentPeriodEnd: new Date("2026-06-01T00:00:00Z"),
      trialEndsAt: new Date("2026-06-01T00:00:00Z"),
    });
    setNow("2026-06-10T02:00:00Z");
    const quoteId = await insertQuote("expired_trial", {
      autoFollowUpEnabled: true,
    });

    expect(await processQuoteAutoFollowUps()).toMatchObject({ sent: 0 });
    expect(sendQuoteAutoFollowUpEmail).not.toHaveBeenCalled();

    const [stored] = await testDb
      .select()
      .from(quotes)
      .where(eq(quotes.id, quoteId));
    expect(stored.autoFollowUpAttempts).toBe(0);
  });

  it.each([
    ["2026-06-10T12:00:00Z", "Pacific/Kiritimati", "2026-06-13", "2026-06-14"],
    ["2026-11-01T03:30:00Z", "America/New_York", "2026-11-02", "2026-11-03"],
    ["2026-03-08T04:30:00Z", "America/New_York", "2026-03-09", "2026-03-10"],
  ])("includes the two-calendar-day expiry horizon at %s in %s", async (now, timezone, horizon, outside) => {
    setNow(now);
    await testDb.update(businesses).set({ timezone, notifyInAppOnQuoteExpiring: true })
      .where(eq(businesses.id, ids.businessId));
    const quoteId = await insertQuote("horizon", { validUntil: horizon });
    await insertQuote("outside", { validUntil: outside });

    // The job scans every business. Silence other businesses for this
    // assertion so the summary counts only the quotes this case inserted,
    // then restore whatever was enabled.
    const otherNotifyingBusinesses = await testDb
      .select({ id: businesses.id })
      .from(businesses)
      .where(
        and(
          ne(businesses.id, ids.businessId),
          eq(businesses.notifyInAppOnQuoteExpiring, true),
        ),
      );

    await testDb
      .update(businesses)
      .set({ notifyInAppOnQuoteExpiring: false })
      .where(ne(businesses.id, ids.businessId));

    try {
      expect(await processQuoteExpiringSoon()).toEqual({
        processed: 1,
        notified: 1,
      });

      const notificationsForBusiness = () =>
        testDb
          .select()
          .from(businessNotifications)
          .where(eq(businessNotifications.businessId, ids.businessId));
      const notifications = await notificationsForBusiness();
      expect(notifications).toHaveLength(1);
      expect(notifications[0].quoteId).toBe(quoteId);

      // The notification dedupes the quote on the second pass.
      expect(await processQuoteExpiringSoon()).toEqual({
        processed: 0,
        notified: 0,
      });
      const notificationsAfterRetry = await notificationsForBusiness();
      expect(notificationsAfterRetry).toHaveLength(1);
      expect(notificationsAfterRetry[0].quoteId).toBe(quoteId);
    } finally {
      if (otherNotifyingBusinesses.length > 0) {
        await testDb
          .update(businesses)
          .set({ notifyInAppOnQuoteExpiring: true })
          .where(
            inArray(
              businesses.id,
              otherNotifyingBusinesses.map((business) => business.id),
            ),
          );
      }
    }
  });

  it.each([
    ["2026-03-09T04:30:00Z", "2026-03-08T04:30:00Z", "2026-03-08"],
    ["2026-11-02T04:30:00Z", "2026-11-01T03:30:00Z", "2026-11-01"],
  ])("stores the viewed follow-up's local calendar due date across DST at %s", async (now, viewedAt, dueDate) => {
    setNow(now);
    const timezone = "America/New_York";
    await testDb.update(businesses).set({
      timezone, autoFollowUpOnQuoteViewed: true, quoteViewedFollowUpDelayDays: 1,
    }).where(eq(businesses.id, ids.businessId));
    const quoteId = await insertQuote("viewed", { publicViewedAt: new Date(viewedAt) });

    expect(await processQuoteViewedFollowUps()).toMatchObject({ created: 1 });
    const [stored] = await testDb.select().from(followUps).where(eq(followUps.quoteId, quoteId));
    expect(getLocalDateString(stored.dueAt, timezone)).toBe(dueDate);
    expect(await processQuoteViewedFollowUps()).toMatchObject({ created: 0 });
  });
});
