import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

vi.mock("@/lib/db/client", async () => ({
  db: (await import("../support/db")).testDb,
}));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("@/lib/env", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/env")>()),
  isFollowUpReminderEmailEnabled: false,
}));

import { processFollowUpReminders } from "@/features/follow-ups/jobs/reminders";
import { businesses, businessNotifications, followUps } from "@/lib/db/schema";
import { closeTestDb, testDb } from "@/tests/support/db";
import { derivePerFilePrefix } from "@/tests/support/prefix";
import { cleanupWorkflowFixture, createWorkflowFixture, type WorkflowFixtureIds } from "@/tests/support/fixtures/workflow";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

beforeEach(async () => {
  ids = await createWorkflowFixture(prefix);
  await testDb.update(businesses).set({ notifyInAppOnFollowUpReminder: true })
    .where(eq(businesses.id, ids.businessId));
  await testDb.insert(followUps).values({
    id: `${prefix}_overdue`, businessId: ids.businessId, inquiryId: ids.inquiryId,
    title: "Overdue follow-up", reason: "Check in", channel: "email",
    dueAt: new Date("2020-01-01T09:00:00Z"), status: "pending",
    reminderSentAt: new Date("2020-01-01T09:00:00Z"),
  });
});

afterAll(async () => {
  await cleanupWorkflowFixture(prefix);
  await closeTestDb();
});

describe("overdue reminder claim", () => {
  it.each(["completed", "deleted"] as const)("rejects a row %s after selection", async (transition) => {
    const originalTransaction = testDb.transaction.bind(testDb);
    const transaction = vi.spyOn(testDb, "transaction").mockImplementationOnce(async (callback, config) => {
      // Simulate an owner clearing the row after the job's SELECT, before
      // its conditional UPDATE claims the overdue notification.
      await testDb.update(followUps).set(transition === "deleted"
        ? { deletedAt: new Date() } : { status: "completed" })
        .where(eq(followUps.id, `${prefix}_overdue`));
      return originalTransaction(callback, config);
    });

    try {
      await processFollowUpReminders();
      const notices = await testDb.select().from(businessNotifications)
        .where(eq(businessNotifications.businessId, ids.businessId));
      expect(notices).toHaveLength(0);
      const [row] = await testDb.select().from(followUps)
        .where(eq(followUps.id, `${prefix}_overdue`));
      expect(row.overdueNotifiedAt).toBeNull();
    } finally {
      transaction.mockRestore();
    }
  });

  it("notifies a pending row only once per day", async () => {
    await processFollowUpReminders();
    await processFollowUpReminders();
    const notices = await testDb.select().from(businessNotifications)
      .where(eq(businessNotifications.businessId, ids.businessId));
    expect(notices).toHaveLength(1);
  });
});
