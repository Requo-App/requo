import type { InquiryFormConfig } from "@/features/inquiries/form-config";
import type { InquiryPageConfig } from "@/features/inquiries/page-config";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type { PlanTier as plan } from "@/lib/plans/plans";
import {
  formatUsageLimitValue,
  getUsageLimit,
} from "@/lib/plans/usage-limits";

export function getInquiryCustomFieldLimit(plan: plan): number {
  return getUsageLimit(plan, "customFieldsPerService") ?? Number.POSITIVE_INFINITY;
}

export function getPublicInquiryAttachmentMaxBytes(
  plan: plan,
): number {
  return (
    getUsageLimit(plan, "publicInquiryAttachmentMaxBytes") ??
    50 * 1024 * 1024
  );
}

export function getPublicInquiryAttachmentLimitLabel(
  plan: plan,
): string {
  return formatUsageLimitValue(
    "publicInquiryAttachmentMaxBytes",
    getPublicInquiryAttachmentMaxBytes(plan),
  );
}

export function getPublicInquiryAttachmentHelpText(
  plan: plan,
): string {
  return `PDF, DOC, DOCX, JPG, PNG, WEBP, or TXT up to ${getPublicInquiryAttachmentLimitLabel(plan)}`;
}

export function countInquiryCustomFields(
  config: Pick<InquiryFormConfig, "projectFields">,
): number {
  return config.projectFields.filter((field) => field.kind === "custom").length;
}

export function resolveInquiryFormConfigForPlan(
  config: InquiryFormConfig,
  plan: plan,
): InquiryFormConfig {
  const customFieldLimit = getInquiryCustomFieldLimit(plan);
  let customFieldCount = 0;

  return {
    ...config,
    projectFields: config.projectFields.filter((field) => {
      if (field.kind !== "custom") {
        return true;
      }

      customFieldCount += 1;
      return customFieldCount <= customFieldLimit;
    }),
  };
}

export function resolveInquiryPageConfigForPlan(
  config: InquiryPageConfig,
  plan: plan,
): InquiryPageConfig {
  if (hasFeatureAccess(plan, "servicePageCustomization")) {
    return config;
  }

  return {
    ...config,
    template: "no_supporting_cards",
    showSupportingCards: false,
    showShowcaseImage: false,
  };
}

export function isInquiryPageCustomizationLocked(plan: plan): boolean {
  return !hasFeatureAccess(plan, "servicePageCustomization");
}
