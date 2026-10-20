import { describe, expect, it } from "vitest";

import { validatePublicInquiryAttachmentUpload } from "@/features/inquiries/attachments";
import { createInquiryFormConfigDefaults } from "@/features/inquiries/form-config";
import {
  createManualQuickInquiryFormConfig,
  inquiryListFiltersSchema,
  validateManualQuickInquirySubmission,
  validatePublicInquirySubmission,
} from "@/features/inquiries/schemas";

const baseConfig = createInquiryFormConfigDefaults({
  businessType: "general_project_services",
});

type InquiryValidationResult = ReturnType<typeof validatePublicInquirySubmission>;

function expectValidSubmission(result: InquiryValidationResult) {
  if (!result.success) {
    throw new Error("Expected inquiry submission validation to pass.");
  }

  return result.data;
}

function expectInvalidSubmission(result: InquiryValidationResult) {
  if (result.success) {
    throw new Error("Expected inquiry submission validation to fail.");
  }

  return result.error;
}

function validFormData() {
  const formData = new FormData();
  formData.set("customerName", "Taylor Nguyen");
  formData.set("customerEmail", "taylor@example.com");
  formData.set("customerContactMethod", "email");
  formData.set("customerContactHandle", "taylor@example.com");
  formData.set("requestedDeadline", "2026-05-15");
  formData.set("budgetText", "Around $1,500");
  formData.set(
    "details",
    "Need two storefront panels and a door decal for a spring launch.",
  );

  return formData;
}

describe("inquiry validation schemas", () => {
  it("normalizes public inquiry submissions and captures submitted field snapshots", () => {
    const result = validatePublicInquirySubmission(baseConfig, validFormData());
    const data = expectValidSubmission(result);

    expect(data).toEqual(
      expect.objectContaining({
        customerName: "Taylor Nguyen",
        customerEmail: "taylor@example.com",
        customerContactMethod: "email",
        customerContactHandle: "taylor@example.com",
        requestedDeadline: "2026-05-15",
        budgetText: "Around $1,500",
      }),
    );
    expect(data).not.toHaveProperty("serviceCategory");
    expect(data.submittedFieldSnapshot.fields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "details",
          displayValue:
            "Need two storefront panels and a door decal for a spring launch.",
        }),
      ]),
    );
    expect(data.submittedFieldSnapshot.fields).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: "serviceCategory" }),
      ]),
    );
  });

  it("rejects invalid email contact details before inquiry creation", () => {
    const formData = validFormData();
    formData.set("customerEmail", "not-an-email");

    const result = validatePublicInquirySubmission(baseConfig, formData);
    const error = expectInvalidSubmission(result);

    expect(error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["customerEmail"],
          message: "Enter a valid email address.",
        }),
      ]),
    );
  });

  it("normalizes social contact links to canonical profile URLs", () => {
    const facebookFormData = validFormData();
    facebookFormData.set("customerContactMethod", "facebook");
    facebookFormData.set(
      "customerContactHandle",
      "https://www.facebook.com/brightside.print/?ref=page",
    );

    const instagramFormData = validFormData();
    instagramFormData.set("customerContactMethod", "instagram");
    instagramFormData.set("customerContactHandle", "@brightside.print");

    expect(
      expectValidSubmission(
        validatePublicInquirySubmission(baseConfig, facebookFormData),
      ),
    ).toEqual(
      expect.objectContaining({
        customerEmail: "taylor@example.com",
        customerContactMethod: "facebook",
        customerContactHandle: "https://facebook.com/brightside.print",
      }),
    );
    expect(
      expectValidSubmission(
        validatePublicInquirySubmission(baseConfig, instagramFormData),
      ),
    ).toEqual(
      expect.objectContaining({
        customerEmail: "taylor@example.com",
        customerContactMethod: "instagram",
        customerContactHandle: "https://instagram.com/brightside.print",
      }),
    );
  });

  it("carries the signed upload token instead of the file", () => {
    const formData = validFormData();

    formData.set("attachment", "signed-upload-token");

    const data = expectValidSubmission(
      validatePublicInquirySubmission(baseConfig, formData),
    );

    expect(data.attachment).toBe("signed-upload-token");
  });

  it("rejects an unsupported uploaded attachment type", () => {
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

  it("applies plan-specific public inquiry attachment size limits", () => {
    const freeResult = validatePublicInquiryAttachmentUpload({
      fileName: "floor-plan.pdf",
      fileSize: 6 * 1024 * 1024,
      maxBytes: 5 * 1024 * 1024,
    });
    const proResult = validatePublicInquiryAttachmentUpload({
      fileName: "floor-plan.pdf",
      fileSize: 6 * 1024 * 1024,
      maxBytes: 25 * 1024 * 1024,
    });

    expect(freeResult).toEqual(
      expect.objectContaining({
        ok: false,
        error: "Upload a file that is 5 MB or smaller.",
      }),
    );
    expect(proResult.ok).toBe(true);
  });

  it("keeps manual quick inquiry validation focused on actionable intake fields", () => {
    const quickConfig = createManualQuickInquiryFormConfig(baseConfig);

    expect(
      quickConfig.projectFields.map((field) =>
        field.kind === "system" ? field.key : field.id,
      ),
    ).toEqual([
      "details",
      "requestedDeadline",
      "budgetText",
      // The quick-add editor renders an attachment section and submits a
      // file with the form, so the field must survive the quick config.
      "attachment",
    ]);

    const result = validateManualQuickInquirySubmission(
      baseConfig,
      validFormData(),
    );
    const data = expectValidSubmission(result);

    // The attachment field carries a signed upload token, so it is never
    // recorded in the submitted-field snapshot.
    expect(data.submittedFieldSnapshot.fields).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ id: "attachment" }),
      ]),
    );
  });
});

describe("inquiryListFiltersSchema unread filter", () => {
  it("parses ?unread=1 and ?unread=true as true", () => {
    expect(inquiryListFiltersSchema.parse({ unread: "1" }).unread).toBe(true);
    expect(inquiryListFiltersSchema.parse({ unread: "true" }).unread).toBe(
      true,
    );
  });

  it("defaults unread to false when absent or unrecognized", () => {
    expect(inquiryListFiltersSchema.parse({}).unread).toBe(false);
    expect(inquiryListFiltersSchema.parse({ unread: "yes" }).unread).toBe(
      false,
    );
  });
});
