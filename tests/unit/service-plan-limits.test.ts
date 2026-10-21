import { describe, expect, it } from "vitest";

import { getUsageLimit } from "@/lib/plans/usage-limits";
import {
  countInquiryCustomFields,
  getInquiryCustomFieldLimit,
  resolveInquiryFormConfigForPlan,
} from "@/features/inquiries/plan-rules";
import {
  createInquiryFormConfigDefaults,
  type InquiryFormConfig,
  type InquiryFormFieldDefinition,
} from "@/features/inquiries/form-config";

function buildConfigWithCustomFields(count: number): InquiryFormConfig {
  const config = createInquiryFormConfigDefaults({
    businessType: "general_project_services",
  });

  const customFields: InquiryFormFieldDefinition[] = Array.from(
    { length: count },
    (_, index) => ({
      id: `custom-${index}`,
      kind: "custom",
      label: `Field ${index}`,
      required: false,
      fieldType: "short_text",
      placeholder: "",
    }),
  );

  return {
    ...config,
    projectFields: [...config.projectFields, ...customFields],
  };
}

describe("live service limits", () => {
  it("gives every plan a finite live-service allowance", () => {
    expect(getUsageLimit("free", "liveFormsPerBusiness")).toBe(1);
    expect(getUsageLimit("pro", "liveFormsPerBusiness")).toBe(5);
    expect(getUsageLimit("business", "liveFormsPerBusiness")).toBe(10);
  });
});

describe("custom field limits", () => {
  it("scales the custom-field allowance with the plan", () => {
    expect(getInquiryCustomFieldLimit("free")).toBe(3);
    expect(getInquiryCustomFieldLimit("pro")).toBe(10);
    expect(getInquiryCustomFieldLimit("business")).toBe(24);
  });

  it("counts only custom fields against the limit", () => {
    const config = buildConfigWithCustomFields(2);
    const baseline = countInquiryCustomFields(
      createInquiryFormConfigDefaults({
        businessType: "general_project_services",
      }),
    );

    expect(countInquiryCustomFields(config)).toBe(baseline + 2);
  });

  it("drops custom fields beyond the plan allowance when resolving for a plan", () => {
    const config = buildConfigWithCustomFields(8);
    const resolved = resolveInquiryFormConfigForPlan(config, "free");

    expect(countInquiryCustomFields(resolved)).toBe(3);
    // The built-in fields are never dropped.
    expect(resolved.projectFields.length).toBeGreaterThan(3);
  });

  it("keeps every custom field on a plan that allows them", () => {
    const config = buildConfigWithCustomFields(8);
    const resolved = resolveInquiryFormConfigForPlan(config, "pro");

    expect(countInquiryCustomFields(resolved)).toBe(
      countInquiryCustomFields(config),
    );
  });
});
