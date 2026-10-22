import { z } from "zod";

import {
  isSupportedBusinessCountryCode,
  isSupportedBusinessCurrencyCode,
  normalizeBusinessCountryCode,
  normalizeBusinessCurrencyCode,
} from "@/features/businesses/locale";
import {
  starterWorkflowKeys,
  type StarterWorkflowKey,
} from "@/features/businesses/starter-workflows";
import {
  businessServiceEntrySchema,
  parseBusinessServiceNames,
} from "@/features/businesses/schemas";
import {
  businessTypes,
  type BusinessType,
} from "@/features/inquiries/business-types";

export const jobTitleValues = [
  "Owner",
  "Founder",
  "Co-founder",
  "CEO",
  "Director",
  "Manager",
  "Operations Manager",
  "Project Manager",
  "Account Manager",
  "Sales Manager",
  "Admin",
  "Freelancer",
  "Consultant",
  "Other",
] as const;

export const jobTitleOptions = jobTitleValues.map((value) => ({
  value,
  label: value,
}));

export const companySizeValues = [
  "Just me",
  "2-5 people",
  "6-10 people",
  "11-25 people",
  "26-50 people",
  "51+ people",
] as const;

export const companySizeOptions = companySizeValues.map((value) => ({
  value,
  label: value,
}));

export const referralSourceValues = [
  "Google Search",
  "Product Hunt",
  "YouTube",
  "LinkedIn",
  "X / Twitter",
  "Reddit",
  "Facebook",
  "Instagram",
  "TikTok",
  "Friend or colleague",
  "Community",
  "Newsletter or blog",
  "Other",
] as const;

export const referralSourceOptions = referralSourceValues.map((value) => ({
  value,
  label: value,
}));

export const customerContactChannelValues = [
  "phone",
  "text_sms",
  "email",
  "website_form",
  "whatsapp",
  "social_dms",
  "in_person",
  "other",
] as const;

export const customerContactChannelOptions = (
  [
    ["phone", "Phone calls"],
    ["text_sms", "Text / SMS"],
    ["email", "Email"],
    ["website_form", "Website form"],
    ["whatsapp", "WhatsApp"],
    ["social_dms", "Social DMs"],
    ["in_person", "In person"],
    ["other", "Other"],
  ] as const
).map(([value, label]) => ({
  value,
  label,
}));

/**
 * Step 1: Business Basics
 * Combines essential business info with owner name (if not already in profile).
 */
export const onboardingBusinessBasicsSchema = z.object({
  businessName: z
    .string()
    .trim()
    .min(2, "Enter a business name.")
    .max(80, "Use 80 characters or fewer."),
  businessSlug: z
    .string()
    .trim()
    .min(2, "Enter a URL slug.")
    .max(60, "Use 60 characters or fewer.")
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Use only lowercase letters, numbers, and hyphens.")
    .optional(),
  businessType: z.enum(businessTypes),
  customerContactChannel: z.enum(customerContactChannelValues),
  countryCode: z
    .string()
    .trim()
    .min(1, "Choose a country.")
    .transform(normalizeBusinessCountryCode)
    .refine(isSupportedBusinessCountryCode, "Choose a valid country."),
  defaultCurrency: z
    .string()
    .trim()
    .min(1, "Choose a currency.")
    .transform(normalizeBusinessCurrencyCode)
    .refine(isSupportedBusinessCurrencyCode, "Choose a supported currency."),
  firstName: z
    .string()
    .trim()
    .min(1, "Enter your first name.")
    .max(60, "Use 60 characters or fewer."),
  // Last name is required by default; single-name Google users are granted an
  // auto-skip (empty string) which the server action authorizes per-user.
  // Keeping the base schema permissive lets the action own that decision.
  lastName: z
    .string()
    .trim()
    .max(60, "Use 60 characters or fewer.")
    .default(""),
});

/**
 * Step 2: Starting Workflow
 * Selects one of three workflow patterns for the initial service.
 */
export const onboardingStartingWorkflowSchema = z.object({
  starterWorkflow: z.enum(starterWorkflowKeys),
});

/**
 * Step 3: Services
 * Named services created during onboarding. Re-exports the shared entry
 * schema from businesses/schemas (services are a business-creation concern;
 * the hub's create form uses the same rules).
 */
export const onboardingServiceEntrySchema = businessServiceEntrySchema;

/** Re-export shared parser for onboarding tests and call sites. */
export const parseOnboardingServices = parseBusinessServiceNames;


/**
 * Complete onboarding submission schema.
 * Merges all steps plus optional deferred fields. Services are parsed and
 * validated separately in the action (JSON blob, mirrors the
 * inquiryFormConfigOverride pattern).
 */
export const completeOnboardingSchema = z.object({
  ...onboardingBusinessBasicsSchema.shape,
  ...onboardingStartingWorkflowSchema.shape,
  // Deferred optional fields (not shown in blocking onboarding)
  jobTitle: z.enum(jobTitleValues).optional(),
  companySize: z.string().optional(),
  referralSource: z.string().optional(),
});

export type OnboardingBusinessType = BusinessType;
export type OnboardingStarterWorkflow = StarterWorkflowKey;
