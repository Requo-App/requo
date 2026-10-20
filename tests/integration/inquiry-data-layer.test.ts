import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

/**
 * DB-backed regression tests for the inquiry data layer.
 *
 * Covers the behaviours that were previously wrong and could not be proven
 * without a database: case-insensitive duplicate detection, the bulk
 * "select all matching filters" id set, and attachment access after a
 * soft delete.
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
  getRecentInquiriesForDuplicateCheck,
} from "@/features/inquiries/qualification/queries";
import {
  getInquiryAttachmentForBusiness,
  getInquiryIdsMatchingFiltersForBusiness,
} from "@/features/inquiries/queries";
import {
  deleteInquiryForBusiness,
  markInquiryViewedForBusiness,
} from "@/features/inquiries/mutations";
import { inquiries, inquiryAttachments } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(__filename);
let ids: WorkflowFixtureIds;

describe("features/inquiries data layer", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("matches duplicate candidates case-insensitively", async () => {
    await testDb
      .update(inquiries)
      .set({ customerEmail: "Taylor@Example.com", submittedAt: new Date() })
      .where(eq(inquiries.id, ids.inquiryId));

    const candidates = await getRecentInquiriesForDuplicateCheck({
      businessId: ids.businessId,
      customerEmail: "taylor@example.com",
      excludeInquiryId: ids.waitingInquiryId,
      windowDays: 30,
    });

    // A case-sensitive SQL pre-filter would have returned nothing here.
    expect(candidates.map((row) => row.id)).toContain(ids.inquiryId);
  });

  it("keeps duplicate candidates inside the owning business", async () => {
    await testDb
      .update(inquiries)
      .set({ customerEmail: "scoped@example.com", submittedAt: new Date() })
      .where(eq(inquiries.id, ids.inquiryId));
    await testDb
      .update(inquiries)
      .set({ customerEmail: "scoped@example.com", submittedAt: new Date() })
      .where(eq(inquiries.id, ids.otherInquiryId));

    const candidates = await getRecentInquiriesForDuplicateCheck({
      businessId: ids.businessId,
      customerEmail: "scoped@example.com",
      excludeInquiryId: ids.waitingInquiryId,
      windowDays: 30,
    });

    const candidateIds = candidates.map((row) => row.id);
    expect(candidateIds).toContain(ids.inquiryId);
    expect(candidateIds).not.toContain(ids.otherInquiryId);
  });

  it("returns the ids matching the current filters for bulk selection", async () => {
    const matchingIds = await getInquiryIdsMatchingFiltersForBusiness({
      businessId: ids.businessId,
      filters: {
        view: "active",
        status: "all",
        form: "all",
        source: "all",
        sort: "newest",
        escalated: false,
        unread: false,
      },
      limit: 50,
    });

    expect(matchingIds).toContain(ids.inquiryId);
    expect(matchingIds).toContain(ids.waitingInquiryId);
    expect(matchingIds).not.toContain(ids.otherInquiryId);
  });

  it("never returns more ids than the requested limit", async () => {
    const matchingIds = await getInquiryIdsMatchingFiltersForBusiness({
      businessId: ids.businessId,
      filters: {
        view: "active",
        status: "all",
        form: "all",
        source: "all",
        sort: "newest",
        escalated: false,
        unread: false,
      },
      limit: 1,
    });

    expect(matchingIds.length).toBeLessThanOrEqual(1);
  });

  it("does not serve an attachment belonging to a deleted inquiry", async () => {
    await testDb.insert(inquiryAttachments).values({
      id: `${prefix}_attachment`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      fileName: "quote.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      storagePath: `${ids.businessId}/${ids.inquiryId}/quote.pdf`,
    });

    const beforeDelete = await getInquiryAttachmentForBusiness({
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      attachmentId: `${prefix}_attachment`,
    });
    expect(beforeDelete).not.toBeNull();

    await deleteInquiryForBusiness({
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      actorUserId: ids.ownerUserId,
    });

    const afterDelete = await getInquiryAttachmentForBusiness({
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      attachmentId: `${prefix}_attachment`,
    });

    // The row is kept for audit, but the customer's file must not stay
    // downloadable.
    expect(afterDelete).toBeNull();
  });

  it("marks a first view once and then reports it as already viewed", async () => {
    const first = await markInquiryViewedForBusiness({
      businessId: ids.businessId,
      inquiryId: ids.waitingInquiryId,
      actorUserId: ids.ownerUserId,
    });
    const second = await markInquiryViewedForBusiness({
      businessId: ids.businessId,
      inquiryId: ids.waitingInquiryId,
      actorUserId: ids.ownerUserId,
    });

    expect(first.marked).toBe(true);
    expect(second.marked).toBe(false);
  });
});
