import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));

import {
  bulkCompleteFollowUpsForBusiness,
  completeFollowUpForBusiness,
  createFollowUpForBusiness,
  deleteFollowUpForBusiness,
  editFollowUpForBusiness,
  FollowUpCreateValidationError,
  reassignFollowUpForBusiness,
  skipFollowUpForBusiness,
  snoozeFollowUpForBusiness,
  terminateRecurringFollowUpsForRecords,
} from "@/features/follow-ups/mutations";
import { voidQuoteForBusiness } from "@/features/quotes/mutations";
import { activityLogs, businesses, followUps, quotes } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

type CreateOverrides = Partial<{
  title: string;
  reason: string;
  channel: "email" | "phone" | "sms" | "whatsapp" | "messenger" | "instagram" | "other";
  category: "sales" | "post_win";
  sendMode: "manual" | "automatic";
  dueDate: string;
  recurrence: "none" | "daily" | "every_3_days" | "weekly" | "biweekly" | "monthly";
  recurrenceLimit: number | null;
  terminationCondition: "count" | "terminal_status" | null;
}>;

async function createFollowUp(
  overrides: CreateOverrides = {},
  businessId = ids.businessId,
  inquiryId: string | null = ids.inquiryId,
) {
  return createFollowUpForBusiness({
    businessId,
    inquiryId,
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
    timezone: "Europe/Berlin",
  });
}

describe("follow-up lifecycle", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("creates a pending follow-up scoped to the business", async () => {
    const created = await createFollowUp();

    expect(created).not.toBeNull();
    expect(created?.status).toBe("pending");

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.businessId).toBe(ids.businessId);
    expect(row.deletedAt).toBeNull();
  });

  it("refuses to create a follow-up against another business's inquiry", async () => {
    const created = await createFollowUp({}, ids.otherBusinessId, ids.inquiryId);

    expect(created).toBeNull();
  });

  it("does not complete a follow-up of another business", async () => {
    const created = await createFollowUp();
    const result = await completeFollowUpForBusiness({
      businessId: ids.otherBusinessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
    });

    expect(result).toBeNull();

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.status).toBe("pending");
  });

  it("does not delete a follow-up of another business", async () => {
    const created = await createFollowUp();
    const result = await deleteFollowUpForBusiness({
      businessId: ids.otherBusinessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
    });

    expect(result).toBeNull();

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.deletedAt).toBeNull();
  });

  it("completes a follow-up and records the activity once", async () => {
    const created = await createFollowUp();
    const result = await completeFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
      completionNote: "Left a voicemail",
    });

    expect(result?.changed).toBe(true);

    const logs = await testDb
      .select()
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.businessId, ids.businessId),
          eq(activityLogs.type, "follow_up.completed"),
        ),
      );

    expect(logs).toHaveLength(1);
  });

  it("creates exactly one recurring child for a double completion", async () => {
    const created = await createFollowUp({ recurrence: "weekly" });

    // Two concurrent completions of the same recurring follow-up.
    const results = await Promise.all([
      completeFollowUpForBusiness({
        businessId: ids.businessId,
        followUpId: created!.followUpId,
        actorUserId: ids.ownerUserId,
      }),
      completeFollowUpForBusiness({
        businessId: ids.businessId,
        followUpId: created!.followUpId,
        actorUserId: ids.ownerUserId,
      }),
    ]);

    expect(results.filter((result) => result?.changed)).toHaveLength(1);

    const children = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.parentFollowUpId, created!.followUpId));

    expect(children).toHaveLength(1);

    const logs = await testDb
      .select()
      .from(activityLogs)
      .where(
        and(
          eq(activityLogs.businessId, ids.businessId),
          eq(activityLogs.type, "follow_up.completed"),
        ),
      );

    expect(logs).toHaveLength(1);
  });

  it("keeps the recurrence chain alive through a bulk completion", async () => {
    const created = await createFollowUp({ recurrence: "weekly" });

    const result = await bulkCompleteFollowUpsForBusiness({
      businessId: ids.businessId,
      followUpIds: [created!.followUpId],
      actorUserId: ids.ownerUserId,
    });

    expect(result.affected).toBe(1);

    const children = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.parentFollowUpId, created!.followUpId));

    expect(children).toHaveLength(1);
    expect(children[0].status).toBe("pending");
  });

  it("stops the series once the count limit is reached", async () => {
    const created = await createFollowUp({
      recurrence: "weekly",
      recurrenceLimit: 1,
      terminationCondition: "count",
    });

    await completeFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
    });

    const children = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.parentFollowUpId, created!.followUpId));

    expect(children).toHaveLength(1);

    // Completing the child must not spawn a grandchild: the limit is reached.
    await completeFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: children[0].id,
      actorUserId: ids.ownerUserId,
    });

    const grandchildren = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.parentFollowUpId, children[0].id));

    expect(grandchildren).toHaveLength(0);
  });

  it("terminates a terminal-status series when the inquiry is won", async () => {
    const created = await createFollowUp({
      recurrence: "weekly",
      terminationCondition: "terminal_status",
    });

    const terminated = await terminateRecurringFollowUpsForRecords({
      businessId: ids.businessId,
      records: [{ inquiryId: ids.inquiryId, newStatus: "won" }],
    });

    expect(terminated).toBe(1);

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.status).toBe("skipped");
  });

  it("leaves a non-terminal inquiry alone", async () => {
    const created = await createFollowUp({
      recurrence: "weekly",
      terminationCondition: "terminal_status",
    });

    const terminated = await terminateRecurringFollowUpsForRecords({
      businessId: ids.businessId,
      records: [{ inquiryId: ids.inquiryId, newStatus: "quoted" }],
    });

    expect(terminated).toBe(0);

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.status).toBe("pending");
  });

  it("terminates a quote-linked series when the quote is voided", async () => {
    const quoteId = `${prefix}_terminating_quote`;

    await testDb.insert(quotes).values({
      id: quoteId,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteNumber: "Q-TERM",
      title: "Terminating quote",
      customerName: "Quote Customer",
      customerEmail: "quote@example.com",
      publicToken: `${quoteId}_token`,
      status: "sent",
      validUntil: "2099-12-31",
      sentAt: new Date("2026-01-01T12:00:00Z"),
    });

    const created = await createFollowUpForBusiness({
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteId,
      actorUserId: ids.ownerUserId,
      followUp: {
        title: "Call about the quote",
        reason: "They asked for a callback.",
        channel: "email",
        category: "sales",
        sendMode: "manual",
        dueDate: "2026-02-01",
        recurrence: "weekly",
        recurrenceLimit: null,
        terminationCondition: "terminal_status",
      },
      timezone: "Europe/Berlin",
    });

    expect(created).not.toBeNull();

    const terminated = await terminateRecurringFollowUpsForRecords({
      businessId: ids.businessId,
      records: [{ quoteId, newStatus: "voided" }],
    });

    expect(terminated).toBe(1);

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.status).toBe("skipped");
  });

  it("terminates recurring follow-ups when voiding first expires a sent quote", async () => {
    const quoteId = `${prefix}_expired_quote`;
    await testDb.insert(quotes).values({
      id: quoteId,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      quoteNumber: "Q-EXPIRED",
      title: "Expired quote",
      customerName: "Quote Customer",
      customerEmail: "quote@example.com",
      publicToken: `${quoteId}_token`,
      status: "sent",
      validUntil: "2020-01-01",
      sentAt: new Date("2019-12-01T12:00:00Z"),
    });
    const created = await createFollowUp({
      recurrence: "weekly", terminationCondition: "terminal_status",
    });
    await testDb.update(followUps).set({ quoteId })
      .where(eq(followUps.id, created!.followUpId));

    const result = await voidQuoteForBusiness({
      businessId: ids.businessId, quoteId, actorUserId: ids.ownerUserId,
    });

    expect(result).toMatchObject({ changed: false, status: "expired", expiredInThisCall: true });
    const [row] = await testDb.select().from(followUps)
      .where(eq(followUps.id, created!.followUpId));
    expect(row.status).toBe("skipped");
    const second = await voidQuoteForBusiness({
      businessId: ids.businessId, quoteId, actorUserId: ids.ownerUserId,
    });
    expect(second).toMatchObject({ changed: false, expiredInThisCall: false });
  });

  it("rejects an assignee who is not a member of the business", async () => {
    const created = await createFollowUp();

    await expect(
      reassignFollowUpForBusiness({
        businessId: ids.businessId,
        followUpId: created!.followUpId,
        actorUserId: ids.ownerUserId,
        reassign: { assignedToUserId: ids.outsiderUserId },
      }),
    ).rejects.toBeInstanceOf(FollowUpCreateValidationError);

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.assignedToUserId).toBe(ids.ownerUserId);
  });

  it("reassigns to a member of the business", async () => {
    const created = await createFollowUp();

    const result = await reassignFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
      reassign: { assignedToUserId: ids.staffUserId },
    });

    expect(result?.changed).toBe(true);

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.assignedToUserId).toBe(ids.staffUserId);
  });

  it("refuses an automatic follow-up on a plan without the entitlement", async () => {
    // The free-plan business has no `autoFollowUps` entitlement.
    await testDb
      .update(businesses)
      .set({ plan: "free" })
      .where(eq(businesses.id, ids.businessId));

    await expect(
      createFollowUp({ sendMode: "automatic" }),
    ).rejects.toBeInstanceOf(FollowUpCreateValidationError);

    const rows = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.businessId, ids.businessId));

    expect(rows).toHaveLength(0);
  });

  it("allows an automatic follow-up on a plan with the entitlement", async () => {
    // A future due date keeps the row away from the global auto-send job,
    // which scans every business in the database.
    const created = await createFollowUp({
      sendMode: "automatic",
      dueDate: "2099-01-01",
    });

    expect(created).not.toBeNull();
  });

  it("refuses to switch an existing follow-up to automatic on a free plan", async () => {
    const created = await createFollowUp();

    await testDb
      .update(businesses)
      .set({ plan: "free" })
      .where(eq(businesses.id, ids.businessId));

    await expect(
      editFollowUpForBusiness({
        businessId: ids.businessId,
        followUpId: created!.followUpId,
        actorUserId: ids.ownerUserId,
        followUp: {
          title: "Call the customer",
          reason: "They asked for a callback.",
          channel: "email",
          category: "sales",
          sendMode: "automatic",
          dueDate: "2026-02-01",
          recurrence: "none",
          recurrenceLimit: null,
          terminationCondition: null,
        },
        timezone: "Europe/Berlin",
      }),
    ).rejects.toBeInstanceOf(FollowUpCreateValidationError);
  });

  it("cannot skip a follow-up twice", async () => {
    const created = await createFollowUp();

    const first = await skipFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
    });
    const second = await skipFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
    });

    expect(first?.changed).toBe(true);
    expect(second?.changed).toBe(false);
  });

  it("keeps the due date when a follow-up is snoozed", async () => {
    const created = await createFollowUp();
    const snoozedUntil = new Date("2026-02-05T08:00:00.000Z");

    const result = await snoozeFollowUpForBusiness({
      businessId: ids.businessId,
      followUpId: created!.followUpId,
      actorUserId: ids.ownerUserId,
      snoozedUntil,
    });

    expect(result?.changed).toBe(true);

    const [row] = await testDb
      .select()
      .from(followUps)
      .where(eq(followUps.id, created!.followUpId));

    expect(row.snoozedUntil?.toISOString()).toBe(snoozedUntil.toISOString());
    expect(row.dueAt.toISOString()).toBe("2026-02-01T08:00:00.000Z");
  });
});
