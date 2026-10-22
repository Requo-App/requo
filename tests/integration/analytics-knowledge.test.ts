/**
 * The knowledge usage meter counts both uploaded files and manually
 * maintained entries. The live SQL aliases the entry count as
 * `knowledge_entries`; reading it under a camelCase key silently drops every
 * manual entry from the total.
 */
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

import { getOperationsData } from "@/features/analytics/queries";
import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import {
  businessKnowledgeFiles,
  knowledgeEntries,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "analytics_knowledge";
let ids: WorkflowFixtureIds;

const window: AnalyticsWindow = {
  preset: "custom",
  since: new Date("2026-02-10T00:00:00.000Z"),
  until: new Date("2026-02-11T00:00:00.000Z"),
  bucket: "day",
  label: "Feb 10, 2026",
  comparison: null,
  clamped: false,
  cappedAllTime: false,
};

describe("analytics knowledge sources", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("counts uploaded files and manual knowledge entries together", async () => {
    await testDb.insert(knowledgeEntries).values({
      id: `${prefix}_entry`,
      businessId: ids.businessId,
      title: "Installation exclusions",
      content: "Do not include disposal of old materials.",
      category: "business_rules",
    });

    await testDb.insert(businessKnowledgeFiles).values({
      id: `${prefix}_file`,
      businessId: ids.businessId,
      originalFileName: "service-terms.pdf",
      storagePath: `${prefix}/service-terms.pdf`,
      mimeType: "application/pdf",
      status: "ready",
    });

    const data = await getOperationsData({
      businessId: ids.businessId,
      window,
      plan: "pro",
    });

    expect(data.knowledge.sources).toBe(2);
    expect(data.knowledge.limit).toBe(25);
  }, 30_000);
});
