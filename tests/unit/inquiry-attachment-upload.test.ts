import { describe, expect, it } from "vitest";

import {
  buildPublicInquiryAttachmentUploadPath,
  validatePublicInquiryAttachmentUpload,
} from "@/features/inquiries/attachments";

describe("inquiry attachment upload contract", () => {
  it("scopes an upload path to a server-issued upload id", () => {
    const path = buildPublicInquiryAttachmentUploadPath({
      uploadId: "upload-1",
      fileName: "Roof Quote (final).pdf",
    });

    expect(path).toBe("uploads/upload-1/roof-quote-final-.pdf");
  });

  it("keeps two uploads apart", () => {
    const first = buildPublicInquiryAttachmentUploadPath({
      uploadId: "upload-1",
      fileName: "quote.pdf",
    });
    const second = buildPublicInquiryAttachmentUploadPath({
      uploadId: "upload-2",
      fileName: "quote.pdf",
    });

    expect(first).not.toBe(second);
  });

  it("rejects an unsupported file type", () => {
    const result = validatePublicInquiryAttachmentUpload({
      fileName: "malware.exe",
      fileSize: 1024,
      maxBytes: 5 * 1024 * 1024,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: "Upload a PDF, common document file, or image.",
      }),
    );
  });

  it("rejects a file over the plan limit", () => {
    const result = validatePublicInquiryAttachmentUpload({
      fileName: "floor-plan.pdf",
      fileSize: 6 * 1024 * 1024,
      maxBytes: 5 * 1024 * 1024,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: false,
        error: "Upload a file that is 5 MB or smaller.",
      }),
    );
  });

  it("rejects an empty file", () => {
    const result = validatePublicInquiryAttachmentUpload({
      fileName: "floor-plan.pdf",
      fileSize: 0,
      maxBytes: 5 * 1024 * 1024,
    });

    expect(result.ok).toBe(false);
  });

  it("accepts a file within the plan limit", () => {
    const result = validatePublicInquiryAttachmentUpload({
      fileName: "floor-plan.pdf",
      fileSize: 1024,
      maxBytes: 5 * 1024 * 1024,
    });

    expect(result).toEqual(
      expect.objectContaining({
        ok: true,
        attachment: expect.objectContaining({
          fileName: "floor-plan.pdf",
          fileSize: 1024,
          contentType: "application/pdf",
        }),
      }),
    );
  });
});
