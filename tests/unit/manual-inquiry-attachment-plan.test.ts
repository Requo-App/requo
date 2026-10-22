import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), plan: vi.fn(), form: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/db/business-access", () => ({ getMemberBusinessActionContext: mocks.access }));
vi.mock("@/lib/billing/subscription-service", () => ({ getEffectivePlanForBusiness: mocks.plan }));
vi.mock("@/features/inquiries/queries", () => ({ getInquiryEditorServiceForBusiness: mocks.form }));
vi.mock("@/features/inquiries/mutations", () => ({ createManualInquirySubmission: mocks.create }));
vi.mock("next/cache", () => ({ revalidateTag: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: () => { throw new Error("redirect"); } }));

import { createManualInquiryAction } from "@/features/inquiries/actions";
import { signInquiryAttachmentUploadToken } from "@/features/inquiries/attachment-tokens";
import { createInquiryFormConfigDefaults } from "@/features/inquiries/form-config";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.form.mockResolvedValue({ id: "form-1", slug: "general", name: "General", inquiryFormConfig: createInquiryFormConfigDefaults() });
  mocks.create.mockResolvedValue({ inquiryId: "inquiry-1" });
});

function submission() {
  const data = new FormData();
  data.set("serviceSlug", "general");
  data.set("customerName", "Taylor Nguyen");
  data.set("customerEmail", "taylor@example.com");
  data.set("customerContactMethod", "email");
  data.set("customerContactHandle", "taylor@example.com");
  data.set("details", "Need a roof quote with a plan.");
  data.set("attachment", signInquiryAttachmentUploadToken({ businessId: "business-1", uploadId: "upload-1", storagePath: "uploads/upload-1/plan.pdf", fileName: "plan.pdf", size: 6 * 1024 * 1024, expiresAt: Math.floor(Date.now() / 1000) + 600 }));
  return data;
}

describe("manual inquiry effective attachment limit", () => {
  it("uses an upgraded effective plan when the cached business plan is free", async () => {
    mocks.access.mockResolvedValue({ ok: true, user: { id: "owner" }, businessContext: { business: { id: "business-1", slug: "test", name: "Test", plan: "free" } } });
    mocks.plan.mockResolvedValue("pro");
    await expect(createManualInquiryAction({}, submission())).rejects.toThrow("redirect");
    expect(mocks.plan).toHaveBeenCalledWith("business-1");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ submission: expect.objectContaining({ maxAttachmentBytes: 25 * 1024 * 1024 }) }));
  });

  it("rejects over-limit uploads when the effective plan is lower than the cache", async () => {
    mocks.access.mockResolvedValue({ ok: true, user: { id: "owner" }, businessContext: { business: { id: "business-1", slug: "test", plan: "pro" } } });
    mocks.plan.mockResolvedValue("free");
    const result = await createManualInquiryAction({}, submission());
    expect(result.fieldErrors?.attachment).toEqual(["Upload a file that is 5 MB or smaller."]);
    expect(mocks.create).not.toHaveBeenCalled();
  });
});
