import { describe, expect, it } from "vitest";

import {
  signInquiryAttachmentUploadToken,
  verifyInquiryAttachmentUploadToken,
} from "@/features/inquiries/attachment-tokens";

function buildPayload(overrides?: Partial<{
  businessId: string;
  uploadId: string;
  storagePath: string;
  fileName: string;
  size: number;
  expiresAt: number;
}>) {
  return {
    businessId: "business_1",
    uploadId: "upload_1",
    storagePath: "uploads/upload_1/quote.pdf",
    fileName: "quote.pdf",
    size: 1024,
    expiresAt: Math.floor(Date.now() / 1000) + 600,
    ...overrides,
  };
}

describe("inquiry attachment upload token", () => {
  it("round-trips a signed payload", () => {
    const payload = buildPayload();
    const token = signInquiryAttachmentUploadToken(payload);

    expect(verifyInquiryAttachmentUploadToken(token)).toEqual(payload);
  });

  it("refuses a tampered payload", () => {
    const token = signInquiryAttachmentUploadToken(buildPayload());
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ ...buildPayload(), businessId: "business_2" }),
    ).toString("base64url");

    expect(verifyInquiryAttachmentUploadToken(`${forged}.${signature}`)).toBeNull();
    expect(verifyInquiryAttachmentUploadToken(`${payload}.${signature}`)).toEqual(
      expect.objectContaining({ businessId: "business_1" }),
    );
  });

  it("refuses an expired token", () => {
    const token = signInquiryAttachmentUploadToken(
      buildPayload({ expiresAt: Math.floor(Date.now() / 1000) - 60 }),
    );

    expect(verifyInquiryAttachmentUploadToken(token)).toBeNull();
  });

  it("refuses a malformed token", () => {
    expect(verifyInquiryAttachmentUploadToken(null)).toBeNull();
    expect(verifyInquiryAttachmentUploadToken(undefined)).toBeNull();
    expect(verifyInquiryAttachmentUploadToken("")).toBeNull();
    expect(verifyInquiryAttachmentUploadToken("not-a-token")).toBeNull();
  });
});
