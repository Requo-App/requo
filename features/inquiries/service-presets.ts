import { getStarterTemplateBusinessType } from "@/features/businesses/starter-templates";
import type { BusinessType } from "@/features/inquiries/business-types";
import { createInquiryFormConfigDefaults } from "@/features/inquiries/form-config";
import { createInquiryPageConfigDefaults } from "@/features/inquiries/page-config";
import type { PlanTier as plan } from "@/lib/plans/plans";
import { slugifyPublicName } from "@/lib/slugs";

function slugify(value: string) {
  return slugifyPublicName(value, {
    fallback: "inquiry",
  });
}

export function normalizeServiceSlug(value: string) {
  return slugify(value);
}

export function getDefaultServiceName(
  businessType: BusinessType,
) {
  switch (getStarterTemplateBusinessType(businessType)) {
    case "consulting_professional_services":
      return "Discovery inquiry";
    case "event_services_rentals":
      return "Event inquiry";
    case "cleaning_services":
      return "Service inquiry";
    case "contractor_home_improvement":
    case "creative_marketing_services":
    case "general_project_services":
    default:
      return "Project inquiry";
  }
}

type CreateServicePresetInput = {
  businessType: BusinessType;
  businessName: string;
  businessShortDescription?: string | null;
  legacyInquiryHeadline?: string | null;
  templateName?: string;
  plan?: plan;
};

export function createServicePreset({
  businessType,
  businessName,
  businessShortDescription,
  legacyInquiryHeadline,
  plan,
}: CreateServicePresetInput) {
  const name = getDefaultServiceName(businessType);

  return {
    name,
    slug: normalizeServiceSlug(name),
    businessType,
    publicInquiryEnabled: true,
    inquiryFormConfig: createInquiryFormConfigDefaults({
      businessType,
    }),
    inquiryPageConfig: createInquiryPageConfigDefaults({
      businessName,
      businessShortDescription,
      legacyInquiryHeadline,
      businessType,
      plan,
    }),
  };
}
