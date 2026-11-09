import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  business: vi.fn(),
  create: vi.fn(),
  plan: vi.fn(),
  rateLimit: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirect");
  }),
}));

vi.mock("@/lib/db/business-access", () => ({
  getMemberBusinessActionContext: vi.fn(),
}));
vi.mock("@/lib/billing/subscription-service", () => ({
  getEffectivePlanForBusiness: mocks.plan,
}));
vi.mock("@/lib/rate-limit/redis-rate-limiter", () => ({
  assertPublicActionRateLimit: mocks.rateLimit,
}));
vi.mock("@/features/inquiries/queries", () => ({
  getPublicInquiryBusinessBySlug: mocks.business,
  getPublicInquiryBusinessByServiceSlug: vi.fn(),
}));
vi.mock("@/features/inquiries/mutations", () => ({
  createPublicInquirySubmission: mocks.create,
}));
vi.mock("@/lib/inngest/send", () => ({
  sendPushInquiryReceivedEvent: vi.fn(async () => undefined),
}));
vi.mock("@/lib/actions/run-record-action", () => ({
  runRecordAction: vi.fn(),
}));
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));

import { submitPublicInquiryAction } from "@/features/inquiries/actions";
import { signInquiryAttachmentUploadToken } from "@/features/inquiries/attachment-tokens";
import { createInquiryFormConfigDefaults } from "@/features/inquiries/form-config";

const business = {
  id: "business-1",
  name: "Test Business",
  slug: "test-business",
  inquiryFormConfig: createInquiryFormConfigDefaults(),
  form: {
    id: "form-1",
    slug: "general",
    name: "General inquiry",
    isDefault: true,
  },
};

function submission(token: string) {
  const data = new FormData();
  data.set("customerName", "Taylor Nguyen");
  data.set("customerEmail", "taylor@example.com");
  data.set("customerContactMethod", "email");
  data.set("customerContactHandle", "taylor@example.com");
  data.set("details", "Need a quote for a storefront sign.");
  data.set("attachment", token);
  return data;
}

function tokenFor(businessId: string) {
  return signInquiryAttachmentUploadToken({
    businessId,
    uploadId: "upload-1",
    storagePath: "uploads/upload-1/plan.pdf",
    fileName: "plan.pdf",
    size: 1024,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.redirect.mockImplementation(() => {
    throw new Error("redirect");
  });
  mocks.business.mockResolvedValue(business);
  mocks.plan.mockResolvedValue("free");
  mocks.rateLimit.mockResolvedValue(true);
  mocks.create.mockResolvedValue({
    inquiryId: "inquiry-1",
    attachmentName: "plan.pdf",
  });
});

describe("public inquiry attachment binding", () => {
  it("refuses an upload token issued for another business", async () => {
    const result = await submitPublicInquiryAction(
      business.slug,
      null,
      {},
      submission(tokenFor("business-2")),
    );

    expect(result.fieldErrors?.attachment).toEqual([
      "That file could not be used. Upload it again.",
    ]);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("accepts an upload token issued for the submitted business", async () => {
    await expect(
      submitPublicInquiryAction(
        business.slug,
        null,
        {},
        submission(tokenFor(business.id)),
      ),
    ).rejects.toThrow("redirect");

    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        submission: expect.objectContaining({
          attachmentUpload: expect.objectContaining({
            storagePath: "uploads/upload-1/plan.pdf",
          }),
        }),
      }),
    );
    expect(mocks.redirect).toHaveBeenCalledWith(
      "/inquire/test-business?submitted=1",
    );
  });
});
