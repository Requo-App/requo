import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

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
  getInquiryAttachmentForBusiness,
  getInquiryDetailForBusiness,
  getInquiryExportRowsForBusiness,
} from "@/features/inquiries/queries";
import {
  changeInquiryStatusForBusiness,
  deleteInquiryForBusiness,
} from "@/features/inquiries/mutations";
import { inquiries, inquiryAttachments } from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";
import { derivePerFilePrefix } from "@/tests/support/prefix";

const prefix = derivePerFilePrefix(import.meta.url);
let ids: WorkflowFixtureIds;

const listFilters = {
  view: "active" as const,
  status: "all" as const,
  form: "all" as const,
  source: "all" as const,
  sort: "newest" as const,
  escalated: false,
  unread: false,
};

/**
 * Inquiries hold untrusted customer text and attachment paths. Every read and
 * write must be filtered by `businessId` in the application because the app's
 * Postgres role bypasses row-level security.
 */
describe("inquiry tenant isolation", () => {
  beforeEach(async () => {
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("does not read another business's inquiry or attachment", async () => {
    await testDb.insert(inquiryAttachments).values({
      id: `${prefix}_attachment`,
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      fileName: "brief.pdf",
      contentType: "application/pdf",
      fileSize: 1024,
      storagePath: `${ids.businessId}/${ids.inquiryId}/brief.pdf`,
    });

    expect(
      await getInquiryDetailForBusiness({
        businessId: ids.otherBusinessId,
        inquiryId: ids.inquiryId,
      }),
    ).toBeNull();

    expect(
      await getInquiryAttachmentForBusiness({
        businessId: ids.otherBusinessId,
        inquiryId: ids.inquiryId,
        attachmentId: `${prefix}_attachment`,
      }),
    ).toBeNull();

    // The owning business still sees both.
    expect(
      await getInquiryDetailForBusiness({
        businessId: ids.businessId,
        inquiryId: ids.inquiryId,
      }),
    ).not.toBeNull();
    expect(
      await getInquiryAttachmentForBusiness({
        businessId: ids.businessId,
        inquiryId: ids.inquiryId,
        attachmentId: `${prefix}_attachment`,
      }),
    ).not.toBeNull();
  });

  it("does not export another business's inquiries", async () => {
    const rows = await getInquiryExportRowsForBusiness({
      businessId: ids.businessId,
      filters: listFilters,
    });

    const exportedIds = rows.map((row) => row.id);
    expect(exportedIds).toContain(ids.inquiryId);
    expect(exportedIds).toContain(ids.waitingInquiryId);
    expect(exportedIds).not.toContain(ids.otherInquiryId);
  });

  it("does not change or delete another business's inquiry", async () => {
    const statusChange = await changeInquiryStatusForBusiness({
      businessId: ids.otherBusinessId,
      inquiryId: ids.inquiryId,
      actorUserId: ids.outsiderUserId,
      nextStatus: "won",
    });
    expect(statusChange).toBeNull();

    const deletion = await deleteInquiryForBusiness({
      businessId: ids.otherBusinessId,
      inquiryId: ids.inquiryId,
      actorUserId: ids.outsiderUserId,
    });
    expect(deletion).toBeNull();

    const [stored] = await testDb
      .select({ status: inquiries.status, deletedAt: inquiries.deletedAt })
      .from(inquiries)
      .where(eq(inquiries.id, ids.inquiryId))
      .limit(1);

    expect(stored.status).toBe("new");
    expect(stored.deletedAt).toBeNull();
  });
});
