import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";

const storage = vi.hoisted(() => ({ info: vi.fn(), download: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ storage: { from: () => storage } }),
}));

vi.mock("@/lib/db/client", async () => {
  const { testDb: mockedDb } = await import("../support/db");

  return { db: mockedDb };
});

vi.mock("next/cache", () => ({
  cacheLife: vi.fn(),
  cacheTag: vi.fn(),
  revalidateTag: vi.fn(),
}));

import {
  addInquiryNoteForBusiness,
  createManualInquirySubmission,
  createPublicInquirySubmission,
} from "@/features/inquiries/mutations";
import { getPublicInquiryBusinessBySlug } from "@/features/inquiries/queries";
import { validatePublicInquirySubmission } from "@/features/inquiries/schemas";
import {
  activityLogs,
  businessNotifications,
  inquiries,
  inquiryAttachments,
  inquiryNotes,
} from "@/lib/db/schema";

import { closeTestDb, testDb } from "@/tests/support/db";
import {
  cleanupWorkflowFixture,
  createWorkflowFixture,
  type WorkflowFixtureIds,
} from "@/tests/support/fixtures/workflow";

const prefix = "test_inquiry_workflow";
let ids: WorkflowFixtureIds;

type InquiryValidationResult = ReturnType<typeof validatePublicInquirySubmission>;

function expectValidSubmission(result: InquiryValidationResult) {
  if (!result.success) {
    throw new Error("Expected inquiry submission validation to pass.");
  }

  return result.data;
}

function inquiryFormData(email = "new-customer@example.com") {
  const formData = new FormData();
  formData.set("customerName", "New Customer");
  formData.set("customerEmail", email);
  formData.set("customerContactMethod", "email");
  formData.set("customerContactHandle", email);
  formData.set("budgetText", "Around $2,000");
  formData.set(
    "details",
    "Need new storefront graphics, window vinyl, and a small door decal.",
  );

  return formData;
}

describe("features/inquiries public and manual submissions", () => {
  beforeEach(async () => {
    vi.resetAllMocks();
    ids = await createWorkflowFixture(prefix);
  }, 30_000);

  afterAll(async () => {
    await cleanupWorkflowFixture(prefix);
    await closeTestDb();
  }, 30_000);

  it("creates public inquiries with field snapshots, activity, and owner notification", async () => {
    const business = await getPublicInquiryBusinessBySlug(ids.businessSlug);

    if (!business) {
      throw new Error("Expected seeded business to be public.");
    }

    const validation = validatePublicInquirySubmission(
      business.inquiryFormConfig,
      inquiryFormData(),
    );
    const submission = expectValidSubmission(validation);

    const created = await createPublicInquirySubmission({
      business,
      submission,
    });

    expect(created.inquiryId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(created.attachmentName).toBeNull();

    const [storedInquiry] = await testDb
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, created.inquiryId));

    expect(storedInquiry).toEqual(
      expect.objectContaining({
        businessId: ids.businessId,
        businessInquiryFormId: ids.formId,
        status: "new",
        source: "service_form",
        customerEmail: "new-customer@example.com",
        serviceCategory: null,
      }),
    );
    expect(storedInquiry.submittedFieldSnapshot?.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "details",
          displayValue:
            "Need new storefront graphics, window vinyl, and a small door decal.",
        }),
      ]),
    );

    const [activity] = await testDb
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.inquiryId, created.inquiryId));

    expect(activity).toEqual(
      expect.objectContaining({
        businessId: ids.businessId,
        actorUserId: null,
        type: "inquiry.submitted_public",
      }),
    );

    const [notification] = await testDb
      .select()
      .from(businessNotifications)
      .where(eq(businessNotifications.inquiryId, created.inquiryId));

    expect(notification).toEqual(
      expect.objectContaining({
        businessId: ids.businessId,
        type: "public_inquiry_submitted",
      }),
    );
  });

  it("creates manual inquiries as dashboard activity without public notifications", async () => {
    const business = await getPublicInquiryBusinessBySlug(ids.businessSlug);
    if (!business) {
      throw new Error("Expected seeded business to be public.");
    }

    const validation = validatePublicInquirySubmission(
      business.inquiryFormConfig,
      inquiryFormData("manual-customer@example.com"),
    );
    const submission = expectValidSubmission(validation);

    const created = await createManualInquirySubmission({
      business,
      submission,
      actorUserId: ids.ownerUserId,
    });

    const [storedInquiry] = await testDb
      .select()
      .from(inquiries)
      .where(eq(inquiries.id, created.inquiryId));

    expect(storedInquiry.source).toBe("manual");

    const [activity] = await testDb
      .select()
      .from(activityLogs)
      .where(eq(activityLogs.inquiryId, created.inquiryId));

    expect(activity).toEqual(
      expect.objectContaining({
        actorUserId: ids.ownerUserId,
        type: "inquiry.created_manual",
      }),
    );

    const notifications = await testDb
      .select()
      .from(businessNotifications)
      .where(eq(businessNotifications.inquiryId, created.inquiryId));

    expect(notifications).toHaveLength(0);
  });

  it("persists the MIME detected from bytes despite untrusted storage metadata", async () => {
    const business = await getPublicInquiryBusinessBySlug(ids.businessSlug);
    if (!business) throw new Error("Expected seeded business.");
    const bytes = Buffer.from("%PDF-1.7\nSample PDF\n%%EOF");
    storage.info.mockResolvedValue({ data: { size: bytes.length, contentType: "image/png" }, error: null });
    storage.download.mockResolvedValue({ data: new Blob([bytes]), error: null });
    const submission = expectValidSubmission(validatePublicInquirySubmission(business.inquiryFormConfig, inquiryFormData()));
    const created = await createPublicInquirySubmission({
      business,
      submission: { ...submission, maxAttachmentBytes: 5 * 1024 * 1024, attachmentUpload: {
        storagePath: "uploads/test/roof-plan.pdf", fileName: "Roof Plan.PDF", fileSize: bytes.length, contentType: "application/pdf",
      } },
    });
    const [attachment] = await testDb.select().from(inquiryAttachments).where(eq(inquiryAttachments.inquiryId, created.inquiryId));
    expect(attachment).toMatchObject({ contentType: "application/pdf", fileSize: bytes.length, fileName: "Roof Plan.PDF" });
  });

  it.each(["mismatched-bytes", "unavailable-object", "oversized-object"])("rejects %s before persisting an inquiry", async (failure) => {
    const business = await getPublicInquiryBusinessBySlug(ids.businessSlug);
    if (!business) throw new Error("Expected seeded business.");
    const bytes = Buffer.from("This text is not a PDF, despite the extension and metadata.");
    storage.info.mockResolvedValue({ data: { size: failure === "oversized-object" ? 6 * 1024 * 1024 : bytes.length, contentType: "application/pdf" }, error: null });
    storage.download.mockResolvedValue(failure === "unavailable-object" ? { data: null, error: new Error("missing") } : { data: new Blob([bytes]), error: null });
    const before = await testDb.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.businessId, ids.businessId));
    const submission = expectValidSubmission(validatePublicInquirySubmission(business.inquiryFormConfig, inquiryFormData()));
    await expect(createPublicInquirySubmission({ business, submission: {
      ...submission, maxAttachmentBytes: 5 * 1024 * 1024, attachmentUpload: {
        storagePath: "uploads/test/plan.pdf", fileName: "plan.pdf", fileSize: bytes.length, contentType: "application/pdf",
      },
    } })).rejects.toThrow();
    const after = await testDb.select({ id: inquiries.id }).from(inquiries).where(eq(inquiries.businessId, ids.businessId));
    expect(after).toEqual(before);
  });

  it("does not expose archived businesses for public inquiry intake", async () => {
    await expect(
      getPublicInquiryBusinessBySlug(ids.archivedBusinessSlug),
    ).resolves.toBeNull();
  });

  it("keeps inquiry notes scoped to the owning business", async () => {
    const wrongBusinessNote = await addInquiryNoteForBusiness({
      inquiryId: ids.inquiryId,
      businessId: ids.otherBusinessId,
      authorUserId: ids.outsiderUserId,
      body: "This should not attach across businesses.",
    });

    expect(wrongBusinessNote).toBeNull();

    const note = await addInquiryNoteForBusiness({
      businessId: ids.businessId,
      inquiryId: ids.inquiryId,
      authorUserId: ids.ownerUserId,
      body: "Customer prefers installation next week.",
    });

    expect(note?.noteId).toMatch(/^note_/);

    const storedNotes = await testDb
      .select()
      .from(inquiryNotes)
      .where(
        and(
          eq(inquiryNotes.businessId, ids.businessId),
          eq(inquiryNotes.inquiryId, ids.inquiryId),
        ),
      );

    expect(storedNotes).toHaveLength(1);
    expect(storedNotes[0]).toEqual(
      expect.objectContaining({
        businessId: ids.businessId,
      authorUserId: ids.ownerUserId,
        body: "Customer prefers installation next week.",
      }),
    );
  });
});
