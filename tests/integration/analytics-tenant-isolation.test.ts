import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import { getOverviewPeriodRows } from "@/features/analytics/queries";
import { analyticsEvents } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

const since = new Date("2026-04-20T00:00:00.000Z");
const until = new Date("2026-04-21T00:00:00.000Z");

/**
 * Analytics aggregates customer behaviour and revenue. A missing business
 * predicate would mix two tenants' visitors, inquiries, and totals into one
 * dashboard, so the period query is exercised against two populated
 * businesses.
 */
describe("analytics tenant isolation", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);

    await testDb.insert(analyticsEvents).values([
      {
        id: `${prefix}_view_own`,
        businessId: ids.businessId,
        serviceId: ids.serviceId,
        eventType: "inquiry_form_viewed",
        visitorHash: `${prefix}_visitor_own`,
        occurredAt: new Date("2026-04-20T10:00:00.000Z"),
      },
      {
        id: `${prefix}_view_foreign`,
        businessId: ids.otherBusinessId,
        serviceId: ids.otherServiceId,
        eventType: "inquiry_form_viewed",
        visitorHash: `${prefix}_visitor_foreign`,
        occurredAt: new Date("2026-04-20T10:00:00.000Z"),
      },
    ]);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("counts only the requested business's events and inquiries", async () => {
    const own = await getOverviewPeriodRows(ids.businessId, since, until);
    const foreign = await getOverviewPeriodRows(ids.otherBusinessId, since, until);

    expect(own.formViews).toBe(1);
    expect(own.visitors).toBe(1);
    expect(own.inquiries).toBe(2);

    expect(foreign.formViews).toBe(1);
    expect(foreign.visitors).toBe(1);
    expect(foreign.inquiries).toBe(1);
  });
});
