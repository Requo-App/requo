import {
  getRecommendedStarterWorkflow,
  type StarterWorkflowKey,
} from "@/features/businesses/starter-workflows";
import {
  resolveCurrencyForCountry,
} from "@/features/businesses/locale";
import type { BusinessType } from "@/features/inquiries/business-types";
import {
  createInquiryFormConfigDefaults,
} from "@/features/inquiries/form-config";
import { getDefaultServiceName } from "@/features/inquiries/service-presets";
import { createServicePreset } from "@/features/inquiries/service-presets";
import { createPublicInquiryPreviewBusiness } from "@/features/inquiries/preview-business";
import type { PublicInquiryBusiness } from "@/features/inquiries/types";

export const onboardingSessionStorageKey = "requo-onboarding-draft-v7";

/**
 * Clears the onboarding draft from sessionStorage.
 * Should be called when a user logs out to prevent data leaking to the next user.
 */
export function clearOnboardingDraft() {
  try {
    window.sessionStorage.removeItem(onboardingSessionStorageKey);
  } catch (error) {
    console.error("Failed to clear onboarding draft.", error);
  }
}

export type OnboardingDraftService = {
  name: string;
};

export type OnboardingDraft = {
  firstName: string;
  lastName: string;
  jobTitle: string;
  businessName: string;
  businessSlug: string;
  businessType: BusinessType | "";
  starterWorkflow: StarterWorkflowKey | "";
  countryCode: string;
  defaultCurrency: string;
  /** Matches `customerContactChannelValues` in onboarding/schemas when set. */
  customerContactChannel: string;
  companySize: string;
  referralSource: string;
  /** Named services for step 3. First entry pre-fills from the type preset. */
  services: OnboardingDraftService[];
};

/** Max rows the UI keeps around; plan limits are resolved at render/submit. */
export const onboardingServicesHardCap = 10;

/** The preset name for the first service, derived from the business type. */
export function getDefaultOnboardingServiceName(
  businessType: BusinessType | "",
): string {
  return businessType ? getDefaultServiceName(businessType) : "Project inquiry";
}

export function createEmptyOnboardingDraft(): OnboardingDraft {
  return {
    firstName: "",
    lastName: "",
    jobTitle: "",
    businessName: "",
    businessSlug: "",
    businessType: "",
    starterWorkflow: "",
    countryCode: "",
    defaultCurrency: "",
    customerContactChannel: "",
    companySize: "",
    referralSource: "",
    services: [{ name: "" }],
  };
}

/**
 * Keeps the first service's pre-filled name tracking the chosen business type
 * until the owner edits it themselves.
 */
export function resolveFirstServiceNameOnTypeChange({
  services,
  previousBusinessType,
  nextBusinessType,
}: {
  services: OnboardingDraftService[];
  previousBusinessType: BusinessType | "";
  nextBusinessType: BusinessType | "";
}): OnboardingDraftService[] {
  if (nextBusinessType === previousBusinessType || services.length === 0) {
    return services;
  }

  const [first, ...rest] = services;
  const previousDefaultName = getDefaultOnboardingServiceName(previousBusinessType);

  if (first.name.trim() && first.name !== previousDefaultName) {
    return services;
  }

  return [
    { ...first, name: getDefaultOnboardingServiceName(nextBusinessType) },
    ...rest,
  ];
}

export function getRecommendedStarterWorkflowForBusinessType(
  businessType: BusinessType | "",
): StarterWorkflowKey {
  return businessType
    ? getRecommendedStarterWorkflow(businessType)
    : "project_quote";
}

export function resolveOnboardingCurrencyChange({
  currentCurrency,
  previousCountryCode,
  nextCountryCode,
}: {
  currentCurrency: string;
  previousCountryCode: string;
  nextCountryCode: string;
}) {
  const previousCurrency = previousCountryCode
    ? resolveCurrencyForCountry(previousCountryCode)
    : null;
  const nextCurrency = nextCountryCode
    ? resolveCurrencyForCountry(nextCountryCode)
    : null;

  if (!nextCurrency) {
    return currentCurrency;
  }

  if (!currentCurrency || currentCurrency === previousCurrency) {
    return nextCurrency;
  }

  return currentCurrency;
}

export function createOnboardingPreviewBusiness(
  draft: OnboardingDraft,
): PublicInquiryBusiness {
  // Preview honors the picked starter workflow so it matches the services
  // actually created on finish (same config path as createBusinessRecordForUser).
  const selectedWorkflow =
    draft.starterWorkflow ||
    getRecommendedStarterWorkflowForBusinessType(draft.businessType);
  const businessName = draft.businessName.trim() || "Your business";
  const businessType = draft.businessType || "general_project_services";

  const preset = createServicePreset({
    businessType,
    businessName,
  });

  return createPublicInquiryPreviewBusiness({
    id: "preview-business",
    name: businessName,
    slug: "preview-business",
    plan: "free",
    businessType,
    form: {
      id: "preview-form",
      name: preset.name,
      slug: preset.slug,
      businessType,
    },
    inquiryFormConfig: createInquiryFormConfigDefaults({
      businessType,
      starterWorkflow: selectedWorkflow,
    }),
    inquiryPageConfig: preset.inquiryPageConfig,
  });
}
