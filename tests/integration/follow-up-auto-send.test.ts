import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * The unattended follow-up send is a paid capability with a per-business
 * budget. These tests pin the entitlement gate, the budget and the
 * idempotency of the job.
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

vi.mock("@/lib/email/transactional", () => ({
  // The helpers report whether the email was handed to the provider.
  sendFollowUpAutoSendEmail: vi.fn().mockResolvedValue(true),
  sendQuoteAutoFollowUpEmail: vi.fn().mockResolvedValue(true),
  getRecipientKey: (email: string) => email.trim().toLowerCase(),
}));

vi.mock("@/lib/plans/usage", () => ({
  getDailyAutoFollowUpSendCount: vi.fn().mockResolvedValue(0),
  getMonthlyAutoFollowUpSendCount: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  isFollowUpAutoSendEmailEnabled: true,
}));

import { processAutomaticFollowUpSends } from "@/features/follow-ups/jobs/auto-send";
import {
  businesses,
  businessSubscriptions,
  followUps,
  inquiries,
  quotes,
} from "@/lib/db/schema";
import {
  sendFollowUpAutoSendEmail,
  sendQuoteAutoFollowUpEmail,
} from "@/lib/email/transactional";
import {
  getDailyAutoFollowUpSendCount,
  getMonthlyAutoFollowUpSendCount,
} from "@/lib/plans/usage";

import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

async function insertAutomaticFollowUp(suffix: string) {
  const id = `${prefix}_${suffix}`;

  await testDb.insert(followUps).values({
    id,
    businessId: ids.businessId,
    inquiryId: ids.inquiryId,
    quoteId: null,
    assignedToUserId: ids.ownerUserId,
    createdByUserId: ids.ownerUserId,
    title: "Automatic follow-up",
    reason: "The customer went quiet.",
    category: "sales",
    channel: "email",
    sendMode: "automatic",
    dueAt: new Date("2026-01-01T08:00:00.000Z"),
    status: "pending",
    recurrence: "none",
    recurrenceCount: 0,
    createdAt: new Date("2025-12-31T08:00:00.000Z"),
    updatedAt: new Date("2025-12-31T08:00:00.000Z"),
  });

  return id;
}

async function grantProPlan() {
  await testDb.insert(businessSubscriptions).values({
    id: `${prefix}_subscription`,
    businessId: ids.businessId,
    status: "active",
    plan: "pro",
    billingProvider: "polar",
    billingCurrency: "USD",
  });
}

async function revokePlan() {
  await testDb
    .delete(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, ids.businessId));
}

describe("follow-up auto-send job", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // `clearAllMocks` keeps the resolved values, so the budget is reset
    // explicitly — otherwise a test that exhausts the budget leaks into the
    // next one.
    vi.mocked(getDailyAutoFollowUpSendCount).mockResolvedValue(0);
    vi.mocked(getMonthlyAutoFollowUpSendCount).mockResolvedValue(0);
    ids = await createWorkflowFixture(prefix);
    await grantProPlan();
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("sends a due automatic follow-up and closes it", async () => {
    const id = await insertAutomaticFollowUp("send");

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(1);
    expect(sendFollowUpAutoSendEmail).toHaveBeenCalledTimes(1);

    const [row] = await testDb.select().from(followUps).where(eq(followUps.id, id));

    expect(row.status).toBe("completed");
  });

  it("does not send twice when the job runs again", async () => {
    await insertAutomaticFollowUp("once");

    await processAutomaticFollowUpSends();
    const second = await processAutomaticFollowUpSends();

    expect(second.sent).toBe(0);
    expect(sendFollowUpAutoSendEmail).toHaveBeenCalledTimes(1);
  });

  it("skips a business without the automatic-follow-up entitlement", async () => {
    await revokePlan();
    await testDb
      .update(businesses)
      .set({ plan: "free" })
      .where(eq(businesses.id, ids.businessId));

    await insertAutomaticFollowUp("free_plan");

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(sendFollowUpAutoSendEmail).not.toHaveBeenCalled();
  });

  it("stops sending when a Pro trial has ended before the expiry cron runs", async () => {
    await revokePlan();
    const now = Date.now();

    await testDb.insert(businessSubscriptions).values({
      id: `${prefix}_expired_trial`,
      businessId: ids.businessId,
      status: "trialing",
      plan: "pro",
      billingProvider: "polar",
      billingCurrency: "USD",
      currentPeriodStart: new Date(now - 15 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(now - 24 * 60 * 60 * 1000),
      trialEndsAt: new Date(now - 24 * 60 * 60 * 1000),
    });

    await insertAutomaticFollowUp("expired_trial");

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(sendFollowUpAutoSendEmail).not.toHaveBeenCalled();
  });

  it("stops sending once the daily budget is exhausted", async () => {
    vi.mocked(getDailyAutoFollowUpSendCount).mockResolvedValue(5);
    vi.mocked(getMonthlyAutoFollowUpSendCount).mockResolvedValue(5);

    await insertAutomaticFollowUp("budget");

    const summary = await processAutomaticFollowUpSends();

    // The Pro plan allows 5 automatic follow-up emails per day.
    expect(summary.sent).toBe(0);
    expect(summary.skipped).toBe(1);
    expect(sendFollowUpAutoSendEmail).not.toHaveBeenCalled();
  });

  it("paginates past the first batch of existing rows", async () => {
    await revokePlan();
    await testDb.update(businesses).set({ plan: "free" })
      .where(eq(businesses.id, ids.businessId));
    await Promise.all(Array.from({ length: 101 }, (_, index) =>
      insertAutomaticFollowUp(`batch_${String(index).padStart(3, "0")}`),
    ));

    const summary = await processAutomaticFollowUpSends();

    expect(summary.skipped).toBe(101);
    expect(summary.limitReached).toBe(false);
  });

  it("leaves a snoozed follow-up alone", async () => {
    const id = await insertAutomaticFollowUp("snoozed");

    await testDb
      .update(followUps)
      .set({ snoozedUntil: new Date("2099-01-01T08:00:00.000Z") })
      .where(eq(followUps.id, id));

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(0);
    expect(sendFollowUpAutoSendEmail).not.toHaveBeenCalled();
  });

  it("skips a follow-up whose customer has no email", async () => {
    await testDb
      .update(inquiries)
      .set({ customerEmail: null })
      .where(eq(inquiries.id, ids.inquiryId));

    await insertAutomaticFollowUp("no_email");

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(0);
    expect(sendFollowUpAutoSendEmail).not.toHaveBeenCalled();
  });

  it("creates the next occurrence of a repeating automatic follow-up", async () => {
    await testDb.insert(followUps).values({
      id: `${prefix}_auto_recurring`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteId: null,
      assignedToUserId: ids.ownerUserId,
      createdByUserId: ids.ownerUserId,
      title: "Repeating automatic follow-up",
      reason: "The customer keeps going quiet.",
      category: "sales",
      channel: "email",
      sendMode: "automatic",
      recurrence: "weekly",
      recurrenceCount: 0,
      recurrenceLimit: null,
      terminationCondition: null,
      dueAt: new Date("2026-01-01T08:00:00.000Z"),
      status: "pending",
      createdAt: new Date("2025-12-31T08:00:00.000Z"),
      updatedAt: new Date("2025-12-31T08:00:00.000Z"),
    });

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(1);

    const children = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.parentFollowUpId, `${prefix}_auto_recurring`));

    // The series must keep running: the next occurrence inherits the send
    // mode and the recurrence.
    expect(children).toHaveLength(1);
    expect(children[0].status).toBe("pending");
    expect(children[0].sendMode).toBe("automatic");
    expect(children[0].recurrence).toBe("weekly");
    expect(children[0].recurrenceCount).toBe(1);
    expect(children[0].dueAt.getTime()).toBeGreaterThan(Date.now());

    const secondRun = await processAutomaticFollowUpSends();
    expect(secondRun.sent).toBe(0);
    expect(sendFollowUpAutoSendEmail).toHaveBeenCalledTimes(1);
  });

  it("leaves the follow-up pending when the email could not be sent", async () => {
    vi.mocked(sendFollowUpAutoSendEmail).mockResolvedValue(false);

    const id = await insertAutomaticFollowUp("not_delivered");

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(0);

    const [row] = await testDb.select().from(followUps).where(eq(followUps.id, id));

    // Nothing reached the customer, so the task must stay open.
    expect(row.status).toBe("pending");
    expect(row.completionNote).toBeNull();
  });

  it("sends a quote follow-up with the quote template and the public link", async () => {
    const quoteId = `${prefix}_auto_quote`;
    const customerEmail = "quote-customer@example.com";

    await testDb
      .update(businesses)
      .set({ defaultEmailSignature: "Thanks, Workflow Business" })
      .where(eq(businesses.id, ids.businessId));

    await testDb.insert(quotes).values({
      id: quoteId,
      businessId: ids.businessId,
      quoteNumber: "Q-1",
      title: "Auto send quote",
      customerName: "Quote Customer",
      customerEmail,
      publicToken: `${quoteId}_token`,
      status: "sent",
      validUntil: "2099-12-31",
      sentAt: new Date("2026-01-01T12:00:00Z"),
    });

    await testDb.insert(followUps).values({
      id: `${prefix}_auto_quote_follow_up`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteId,
      assignedToUserId: ids.ownerUserId,
      createdByUserId: ids.ownerUserId,
      title: "Automatic quote follow-up",
      reason: "The customer has not responded.",
      category: "sales",
      channel: "email",
      sendMode: "automatic",
      dueAt: new Date("2026-01-01T08:00:00.000Z"),
      status: "pending",
      recurrence: "none",
      recurrenceCount: 0,
      createdAt: new Date("2025-12-31T08:00:00.000Z"),
      updatedAt: new Date("2025-12-31T08:00:00.000Z"),
    });

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(1);
    expect(sendQuoteAutoFollowUpEmail).toHaveBeenCalledTimes(1);

    const call = vi.mocked(sendQuoteAutoFollowUpEmail).mock.calls[0]?.[0];

    expect(call?.publicQuoteUrl).toContain(`${quoteId}_token`);
    expect(call?.emailSignature).toBe("Thanks, Workflow Business");
    // The key must be follow-up-scoped: two automatic follow-ups on the same
    // quote would otherwise share a key and the second email would be
    // swallowed by the outbox.
    expect(call?.idempotencyKey).toContain(`${prefix}_auto_quote_follow_up`);
  });

  it("sends both automatic follow-ups on the same quote", async () => {
    const quoteId = `${prefix}_auto_quote_two`;
    const customerEmail = "quote-two@example.com";

    await testDb.insert(quotes).values({
      id: quoteId,
      businessId: ids.businessId,
      quoteNumber: "Q-2",
      title: "Second auto send quote",
      customerName: "Quote Customer",
      customerEmail,
      publicToken: `${quoteId}_token`,
      status: "sent",
      validUntil: "2099-12-31",
      sentAt: new Date("2026-01-01T12:00:00Z"),
    });

    for (const suffix of ["a", "b"]) {
      await testDb.insert(followUps).values({
        id: `${prefix}_auto_quote_two_${suffix}`,
        businessId: ids.businessId,
        inquiryId: ids.inquiryId,
        quoteId,
        assignedToUserId: ids.ownerUserId,
        createdByUserId: ids.ownerUserId,
        title: "Automatic quote follow-up",
        reason: "The customer has not responded.",
        category: "sales",
        channel: "email",
        sendMode: "automatic",
        dueAt: new Date("2026-01-01T08:00:00.000Z"),
        status: "pending",
        recurrence: "none",
        recurrenceCount: 0,
        createdAt: new Date("2025-12-31T08:00:00.000Z"),
        updatedAt: new Date("2025-12-31T08:00:00.000Z"),
      });
    }

    const summary = await processAutomaticFollowUpSends();

    expect(summary.sent).toBe(2);
    expect(sendQuoteAutoFollowUpEmail).toHaveBeenCalledTimes(2);

    const keys = vi
      .mocked(sendQuoteAutoFollowUpEmail)
      .mock.calls.map((call) => call[0]?.idempotencyKey);

    expect(new Set(keys).size).toBe(2);
  });
});
