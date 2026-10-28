import type { PlanTier } from "@/lib/plans/plans";
import type { OnboardingDraft } from "@/features/onboarding/helpers";
import type {
  OnboardingActionState,
  OnboardingFieldName,
} from "@/features/onboarding/types";
import {
  onboardingBusinessBasicsSchema,
  onboardingServiceEntrySchema,
  onboardingStartingWorkflowSchema,
} from "@/features/onboarding/schemas";

export type OnboardingFormProps = {
  action: (
    state: OnboardingActionState,
    formData: FormData,
  ) => Promise<OnboardingActionState>;
  detectedCountryCode?: string;
  /** Resolved plan for the business being created; drives the service cap UI. */
  plan?: PlanTier;
  initialProfile?: {
    firstName: string;
    lastName: string;
    avatarUrl: string | null;
  };
  /**
   * True when the user qualifies for the last-name auto-skip (single-name
   * Google account with no stored last name). Last name stays required for
   * everyone else.
   */
  lastNameOptional?: boolean;
};

export type OnboardingStepId = "business" | "workflow" | "services";

export const onboardingSteps = [
  {
    id: "business" as const,
    label: "Business",
    description: "Set up your business identity.",
    title: "Set up your business",
    body: "Add your business name, service category, and how customers usually reach you.",
    fields: [
      "firstName",
      "lastName",
      "businessName",
      "businessSlug",
      "businessType",
      "customerContactChannel",
      "countryCode",
      "defaultCurrency",
    ] as const satisfies readonly OnboardingFieldName[],
  },
  {
    id: "workflow" as const,
    label: "Workflow",
    description: "Choose your starting inquiry workflow.",
    title: "How do you usually sell the work?",
    body: "We'll set up your services based on how you typically work. You can customize everything later.",
    fields: [
      "starterWorkflow",
    ] as const satisfies readonly OnboardingFieldName[],
  },
  {
    id: "services" as const,
    label: "Services",
    description: "Name what you sell.",
    title: "Which services do you offer?",
    body: "Each service gets its own public page and inbox. Add the ones you want to take inquiries for — you can add more later.",
    fields: [
      "services",
    ] as const satisfies readonly OnboardingFieldName[],
  },
] satisfies ReadonlyArray<{
  id: OnboardingStepId;
  label: string;
  description: string;
  title: string;
  body: string;
  fields: readonly OnboardingFieldName[];
}>;

export const lastOnboardingStepIndex = onboardingSteps.length - 1;

export const onboardingInputClassName = "h-9 text-sm";

export const onboardingComboboxButtonClassName = "h-9 text-sm";

export function getFieldValidationError(
  field: OnboardingFieldName,
  draft: OnboardingDraft,
  options?: { lastNameOptional?: boolean },
) {
  switch (field) {
    case "firstName": {
      const result = onboardingBusinessBasicsSchema.shape.firstName.safeParse(
        draft.firstName,
      );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "lastName": {
      if (!draft.lastName.trim()) {
        return options?.lastNameOptional
          ? undefined
          : "Enter your last name.";
      }
      const result = onboardingBusinessBasicsSchema.shape.lastName.safeParse(
        draft.lastName,
      );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "businessName": {
      const result = onboardingBusinessBasicsSchema.shape.businessName.safeParse(
        draft.businessName,
      );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "businessSlug": {
      const slug = draft.businessSlug.trim();
      if (!slug) return "Enter a URL slug.";
      if (slug.length < 2) return "Use at least 2 characters.";
      if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug))
        return "Use only lowercase letters, numbers, and hyphens.";
      return undefined;
    }
    case "businessType": {
      const result = onboardingBusinessBasicsSchema.shape.businessType.safeParse(
        draft.businessType,
      );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "countryCode": {
      const result = onboardingBusinessBasicsSchema.shape.countryCode.safeParse(
        draft.countryCode,
      );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "defaultCurrency": {
      const result =
        onboardingBusinessBasicsSchema.shape.defaultCurrency.safeParse(
          draft.defaultCurrency,
        );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "customerContactChannel": {
      const result =
        onboardingBusinessBasicsSchema.shape.customerContactChannel.safeParse(
          draft.customerContactChannel,
        );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "starterWorkflow": {
      const result =
        onboardingStartingWorkflowSchema.shape.starterWorkflow.safeParse(
          draft.starterWorkflow,
        );
      return result.success ? undefined : result.error.issues[0]?.message;
    }
    case "services": {
      // Strict naming: the first row is always kept (it pre-fills), extra
      // rows must carry a name or are dropped silently at submit.
      const keptServices = draft.services.filter(
        (service, index) => index === 0 || service.name.trim().length > 0,
      );

      for (const service of keptServices) {
        const result = onboardingServiceEntrySchema.shape.name.safeParse(
          service.name,
        );

        if (!result.success) {
          return result.error.issues[0]?.message;
        }
      }

      return undefined;
    }
    case "jobTitle":
    case "companySize":
    case "referralSource":
      return undefined;
  }
}

export function sanitizeDraft(
  value: Partial<OnboardingDraft> | undefined,
): Partial<OnboardingDraft> {
  if (!value) {
    return {};
  }

  // Map old starterTemplateBusinessType to new starterWorkflow if present
  let starterWorkflow = "";
  if (typeof value.starterWorkflow === "string") {
    starterWorkflow = value.starterWorkflow;
  } else if ("starterTemplateBusinessType" in value) {
    // Legacy draft migration: map old template types to new workflows
    const oldTemplate = (value as Record<string, unknown>).starterTemplateBusinessType;
    if (oldTemplate === "cleaning_services") {
      starterWorkflow = "recurring_service";
    } else if (oldTemplate === "consulting_professional_services") {
      starterWorkflow = "consultation_proposal";
    } else if (oldTemplate) {
      starterWorkflow = "project_quote";
    }
  }

  const services = Array.isArray(value.services)
    ? value.services
        .slice(0, 10)
        .map((service) => ({
          name:
            service && typeof service === "object" && typeof (service as { name?: unknown }).name === "string"
              ? (service as { name: string }).name
              : "",
        }))
    : [{ name: "" }];

  return {
    services,
    firstName: typeof value.firstName === "string" ? value.firstName : "",
    lastName: typeof value.lastName === "string" ? value.lastName : "",
    jobTitle: typeof value.jobTitle === "string" ? value.jobTitle : "",
    businessName:
      typeof value.businessName === "string" ? value.businessName : "",
    businessSlug:
      typeof value.businessSlug === "string" ? value.businessSlug : "",
    businessType:
      typeof value.businessType === "string"
        ? (value.businessType as OnboardingDraft["businessType"])
        : "",
    starterWorkflow:
      starterWorkflow as OnboardingDraft["starterWorkflow"],
    countryCode: typeof value.countryCode === "string" ? value.countryCode : "",
    defaultCurrency:
      typeof value.defaultCurrency === "string" ? value.defaultCurrency : "",
    customerContactChannel:
      typeof value.customerContactChannel === "string"
        ? value.customerContactChannel
        : "",
    companySize:
      typeof value.companySize === "string" ? value.companySize : "",
    referralSource:
      typeof value.referralSource === "string" ? value.referralSource : "",
  };
}

export function mapServerFieldErrors(
  fieldErrors: OnboardingActionState["fieldErrors"],
): Partial<Record<OnboardingFieldName, string>> {
  return Object.fromEntries(
    Object.entries(fieldErrors ?? {}).flatMap(([field, errors]) => {
      const message = errors?.[0];

      return message ? [[field, message]] : [];
    }),
  ) as Partial<Record<OnboardingFieldName, string>>;
}

export function clampStepIndex(value: number, maxStepIndex: number) {
  return Math.min(Math.max(value, 0), maxStepIndex);
}

export function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((segment) => segment[0]?.toUpperCase())
    .join("");
}
