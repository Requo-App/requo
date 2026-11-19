import { describe, expect, it } from "vitest";

import {
  createInquiryFormConfigDefaults,
  getRecipeCriticalFieldId,
  getRecipeCriticalFieldIdForLabel,
  requireCriticalInquiryFields,
} from "@/features/inquiries/form-config";

describe("recipe critical field ids", () => {
  it("distinguishes labels that slugify to the same legacy id", () => {
    const first = "Site size (sq ft)";
    const second = "Site size sq ft";

    expect(getRecipeCriticalFieldId(first)).toBe(
      getRecipeCriticalFieldId(second),
    );
    expect(getRecipeCriticalFieldIdForLabel(first)).not.toBe(
      getRecipeCriticalFieldIdForLabel(second),
    );
    expect(getRecipeCriticalFieldIdForLabel(first)).toMatch(
      new RegExp(`^${getRecipeCriticalFieldId(first)}-[a-z0-9]{1,7}$`),
    );
  });

  it("keeps non-Latin labels distinct instead of collapsing to one id", () => {
    const first = "敷地の広さ";
    const second = "予算";

    expect(getRecipeCriticalFieldId(first)).toBe(
      getRecipeCriticalFieldId(second),
    );
    expect(getRecipeCriticalFieldIdForLabel(first)).not.toBe(
      getRecipeCriticalFieldIdForLabel(second),
    );
  });

  it("adds both colliding labels to the form instead of dropping the second", () => {
    const config = createInquiryFormConfigDefaults();
    const required = requireCriticalInquiryFields(config, [
      "Site size (sq ft)",
      "Site size sq ft",
    ]);

    const labels = required.projectFields.map((field) => field.label);

    expect(labels).toContain("Site size (sq ft)");
    expect(labels).toContain("Site size sq ft");

    const ids = required.projectFields
      .filter((field) => field.kind === "custom")
      .map((field) => field.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never drops required questions past the owner form's 24-field cap", () => {
    const config = createInquiryFormConfigDefaults();
    const labels = Array.from(
      { length: 30 },
      (_, index) => `Recipe question ${index + 1}`,
    );
    const required = requireCriticalInquiryFields(config, labels);
    const formLabels = new Set(
      required.projectFields.map((field) => field.label),
    );

    for (const label of labels) {
      expect(formLabels.has(label)).toBe(true);
    }

    const recipeFields = required.projectFields.filter((field) =>
      field.kind === "custom" && field.id.startsWith("recipe-"),
    );
    expect(recipeFields).toHaveLength(30);
    expect(recipeFields.every((field) => field.required)).toBe(true);
  });
});
