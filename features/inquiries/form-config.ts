import { z } from "zod";

import {
  getStarterTemplateBusinessType,
  type StarterTemplateBusinessType,
} from "@/features/businesses/starter-templates";
import {
  getRecommendedStarterWorkflow,
  type StarterWorkflowKey,
} from "@/features/businesses/starter-workflows";
import {
  businessTypes,
  normalizeBusinessType,
  type BusinessType,
} from "@/features/inquiries/business-types";

function emptyToUndefined(value: unknown) {
  if (value == null) {
    return undefined;
  }

  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }

  return value;
}

function optionalText(maxLength: number) {
  return z.preprocess(
    emptyToUndefined,
    z.string().trim().max(maxLength).optional(),
  );
}

export const inquiryCustomFieldTypes = [
  "short_text",
  "long_text",
  "select",
  "multi_select",
  "number",
  "date",
  "boolean",
] as const;

export type InquiryCustomFieldType = (typeof inquiryCustomFieldTypes)[number];

export const inquiryFieldKinds = ["contact", "system", "custom"] as const;
export type InquiryFieldKind = (typeof inquiryFieldKinds)[number];

export const inquiryContactFieldKeys = [
  "customerName",
  "email",
  "preferredContact",
] as const;

export type InquiryContactFieldKey = (typeof inquiryContactFieldKeys)[number];

/**
 * Fixed labels for contact fields in inquiry detail display.
 * These labels are used on the dashboard/detail side and cannot be renamed.
 * The form-facing labels (e.g. "Your name") remain editable for public form UX.
 */
export const contactFieldFixedLabels: Record<InquiryContactFieldKey, string> = {
  customerName: "Name",
  email: "Email",
  preferredContact: "Preferred Contact Method",
};

/**
 * Default labels for system (default inquiry) fields.
 * Used as fallback when no snapshot label is available.
 */
export const systemFieldDefaultLabels: Record<InquiryProjectSystemFieldKey, string> = {
  requestedDeadline: "Deadline",
  budgetText: "Budget",
  details: "Message",
  attachment: "Attachment",
};

export const inquiryContactMethods = [
  "email",
  "phone",
  "facebook",
  "instagram",
  "whatsapp",
  "other",
] as const;

export type InquiryContactMethod = (typeof inquiryContactMethods)[number];

export const inquiryContactMethodLabels: Record<InquiryContactMethod, string> = {
  email: "Email",
  phone: "Phone",
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  other: "Other",
};

const inquirySocialContactMeta = {
  facebook: {
    canonicalHost: "facebook.com",
    domains: ["facebook.com", "www.facebook.com", "m.facebook.com", "fb.com", "www.fb.com"],
    prefix: "facebook.com/",
  },
  instagram: {
    canonicalHost: "instagram.com",
    domains: ["instagram.com", "www.instagram.com"],
    prefix: "instagram.com/",
  },
} as const satisfies Partial<
  Record<
    InquiryContactMethod,
    {
      canonicalHost: string;
      domains: readonly string[];
      prefix: string;
    }
  >
>;

export function getInquiryContactHandleUrlPrefix(
  method: InquiryContactMethod,
) {
  return inquirySocialContactMeta[method as keyof typeof inquirySocialContactMeta]
    ?.prefix;
}

function parseContactHandleUrl(value: string) {
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(value)
    ? value
    : `https://${value}`;

  try {
    return new URL(candidate);
  } catch {
    return null;
  }
}

function safeDecodePathname(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function normalizeInquiryContactHandleEditableValue(
  method: InquiryContactMethod,
  value: string,
) {
  const trimmedValue = value.trim();
  const socialMeta =
    inquirySocialContactMeta[method as keyof typeof inquirySocialContactMeta];

  if (!trimmedValue || !socialMeta) {
    return trimmedValue;
  }

  const withoutHandleMarker = trimmedValue.replace(/^@+/, "").replace(/^\/+/, "");
  const parsedUrl = parseContactHandleUrl(withoutHandleMarker);
  const hostName = parsedUrl?.hostname.toLowerCase();

  if (
    !parsedUrl ||
    !hostName ||
    !socialMeta.domains.some((domain) => domain === hostName)
  ) {
    return withoutHandleMarker;
  }

  return safeDecodePathname(parsedUrl.pathname)
    .split("/")
    .filter(Boolean)
    .join("/")
    .replace(/^@+/, "");
}

export function normalizeInquiryContactHandleSubmissionValue(
  method: InquiryContactMethod,
  value: string,
) {
  const socialMeta =
    inquirySocialContactMeta[method as keyof typeof inquirySocialContactMeta];
  const editableValue = normalizeInquiryContactHandleEditableValue(method, value);

  if (!editableValue || !socialMeta) {
    return editableValue;
  }

  return `https://${socialMeta.canonicalHost}/${editableValue}`;
}

/**
 * Canonical profile URL for a stored contact handle, or null.
 *
 * Social handles are persisted as canonical URLs (see
 * `normalizeInquiryContactHandleSubmissionValue`), so they must not be
 * prefixed a second time — that produced links like
 * `https://facebook.com/https://facebook.com/…`.
 */
export function getInquiryContactHandleUrl(
  method: InquiryContactMethod,
  handle: string,
): string | null {
  const trimmedHandle = handle.trim();

  if (!trimmedHandle) {
    return null;
  }

  const socialMeta =
    inquirySocialContactMeta[method as keyof typeof inquirySocialContactMeta];

  if (socialMeta) {
    if (/^https?:\/\//i.test(trimmedHandle)) {
      try {
        const url = new URL(trimmedHandle);
        const host = url.hostname.toLowerCase();
        const allowedDomains: readonly string[] = socialMeta.domains;

        return allowedDomains.includes(host) ? url.toString() : null;
      } catch {
        return null;
      }
    }

    return `https://${socialMeta.canonicalHost}/${trimmedHandle}`;
  }

  if (method === "whatsapp") {
    const phoneDigits = trimmedHandle.replace(/[^0-9+]/g, "");

    return phoneDigits ? `https://wa.me/${phoneDigits}` : null;
  }

  return null;
}

export const inquiryProjectSystemFieldKeys = [
  "requestedDeadline",
  "budgetText",
  "details",
  "attachment",
] as const;

export type InquiryProjectSystemFieldKey =
  (typeof inquiryProjectSystemFieldKeys)[number];

export const inquiryCustomFieldTypeMeta: Record<
  InquiryCustomFieldType,
  { label: string }
> = {
  short_text: { label: "Short text" },
  long_text: { label: "Long text" },
  select: { label: "Select" },
  multi_select: { label: "Multi-select" },
  number: { label: "Number" },
  date: { label: "Date" },
  boolean: { label: "Yes / No" },
};

export type InquiryFieldOption = {
  id: string;
  label: string;
  value: string;
};

export type InquiryContactFieldConfig = {
  label: string;
  placeholder?: string;
  enabled: boolean;
  required: boolean;
};

export type InquiryFormSystemFieldDefinition = {
  kind: "system";
  key: InquiryProjectSystemFieldKey;
  label: string;
  placeholder?: string;
  enabled: boolean;
  required: boolean;
};

export type InquiryFormCustomFieldDefinition = {
  kind: "custom";
  id: string;
  fieldType: InquiryCustomFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: InquiryFieldOption[];
};

export type InquiryFormFieldDefinition =
  | InquiryFormSystemFieldDefinition
  | InquiryFormCustomFieldDefinition;

export type InquiryFormGroupLabels = {
  contact: string;
  project: string;
};

export type InquiryFormContactFields = {
  customerName: InquiryContactFieldConfig;
  email?: InquiryContactFieldConfig;
  preferredContact: InquiryContactFieldConfig;
};

export type InquiryFormConfig = {
  version: 1;
  businessType: BusinessType;
  groupLabels: InquiryFormGroupLabels;
  contactFields: InquiryFormContactFields;
  projectFields: InquiryFormFieldDefinition[];
};

export type InquirySubmittedFieldSnapshotField = {
  id: string;
  label: string;
  value: string | string[] | boolean | null;
  displayValue: string;
  /** Added for field grouping in inquiry detail display. Optional for backward compat with old snapshots. */
  fieldKind?: InquiryFieldKind;
};

export type InquirySubmittedFieldSnapshot = {
  version: 1;
  businessType: BusinessType;
  fields: InquirySubmittedFieldSnapshotField[];
};

function normalizeInquiryFormConfigValue(
  value: unknown,
  fallbackBusinessType: BusinessType,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return {
    ...value,
    businessType: normalizeBusinessType(
      (value as { businessType?: unknown }).businessType,
      fallbackBusinessType,
    ),
  };
}

function normalizeInquirySubmittedFieldSnapshotValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  return {
    ...value,
    businessType: normalizeBusinessType(
      (value as { businessType?: unknown }).businessType,
    ),
  };
}

const inquiryFieldOptionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(80),
  value: z.string().trim().min(1).max(80),
});

const inquiryContactFieldConfigSchema = z.object({
  label: z.string().trim().min(1).max(80),
  placeholder: optionalText(160),
  enabled: z.boolean(),
  required: z.boolean(),
});

const inquiryFormGroupLabelsSchema = z
  .object({
    contact: z.string().trim().min(1).max(40),
    project: z.string().trim().min(1).max(40),
  })
  .partial();

export const inquiryFormSystemFieldSchema = z.object({
  kind: z.literal("system"),
  key: z.enum(inquiryProjectSystemFieldKeys),
  label: z.string().trim().min(1).max(80),
  placeholder: optionalText(160),
  enabled: z.boolean(),
  required: z.boolean(),
});

const inquiryFormCustomFieldBaseSchema = z.object({
  kind: z.literal("custom"),
  id: z.string().trim().min(1).max(120),
  fieldType: z.enum(inquiryCustomFieldTypes),
  label: z.string().trim().min(1).max(80),
  placeholder: optionalText(160),
  required: z.boolean(),
});

const inquiryFormCustomFieldOptionsSchema =
  inquiryFormCustomFieldBaseSchema.extend({
    fieldType: z.enum(["select", "multi_select"]),
    options: z.array(inquiryFieldOptionSchema).min(1).max(12),
  });

const inquiryFormCustomFieldSimpleSchema =
  inquiryFormCustomFieldBaseSchema.extend({
    fieldType: z.enum(["short_text", "long_text", "number", "date", "boolean"]),
    options: z.undefined().optional(),
  });

export const inquiryFormCustomFieldSchema = z.union([
  inquiryFormCustomFieldOptionsSchema,
  inquiryFormCustomFieldSimpleSchema,
]);

export const inquiryFormFieldSchema = z.union([
  inquiryFormSystemFieldSchema,
  inquiryFormCustomFieldSchema,
]);

export const inquirySubmittedFieldSnapshotFieldSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120),
  value: z.union([z.string(), z.array(z.string()), z.boolean(), z.null()]),
  displayValue: z.string().trim().min(1).max(2000),
  fieldKind: z.enum(inquiryFieldKinds).optional(),
});

export const inquirySubmittedFieldSnapshotSchema = z.object({
  version: z.literal(1),
  businessType: z.enum(businessTypes),
  fields: z.array(inquirySubmittedFieldSnapshotFieldSchema).max(40),
});

export const inquiryFormConfigSchema = z
  .object({
    version: z.literal(1),
    businessType: z.enum(businessTypes),
    groupLabels: inquiryFormGroupLabelsSchema.optional(),
    contactFields: z.object({
      customerName: inquiryContactFieldConfigSchema,
      email: inquiryContactFieldConfigSchema.optional(),
      preferredContact: inquiryContactFieldConfigSchema,
    }),
    projectFields: z.array(inquiryFormFieldSchema).max(24),
  })
  .superRefine((value, context) => {
    const detailsFields = value.projectFields.filter(
      (field) => field.kind === "system" && field.key === "details",
    );

    if (detailsFields.length !== 1) {
      context.addIssue({
        code: "custom",
        message: "Include exactly one details field.",
        path: ["projectFields"],
      });
    }

    // Legacy configs may still carry a serviceCategory field from before the
    // Service-owned form refactor. It is no longer a customer-facing question
    // and must not be present going forward.
    const legacyServiceFields = value.projectFields.filter(
      (field) =>
        (field.kind === "system" &&
          (field as { key?: string }).key === "serviceCategory") ||
        (field.kind === "custom" &&
          ((field as { id?: string }).id === "serviceCategory" ||
            getInquiryFormFieldInputName(field as never) ===
              "serviceCategory")),
    );

    if (legacyServiceFields.length > 0) {
      context.addIssue({
        code: "custom",
        message:
          "Service selection is owned by the Service form and must not be a customer-facing field.",
        path: ["projectFields"],
      });
    }

    for (const contactKey of ["customerName", "preferredContact"] as const) {
      const field = value.contactFields[contactKey as keyof typeof value.contactFields];

      if (!field?.enabled || !field?.required) {
        context.addIssue({
          code: "custom",
          message: "Name and preferred contact must stay enabled and required.",
          path: ["contactFields", contactKey],
        });
      }
    }

    if (value.contactFields.email && (!value.contactFields.email.enabled || !value.contactFields.email.required)) {
      context.addIssue({
        code: "custom",
        message: "Email must stay enabled and required.",
        path: ["contactFields", "email"],
      });
    }

    const ids = new Set<string>();

    for (const field of value.projectFields) {
      const id = field.kind === "system" ? field.key : field.id;

      if (ids.has(id)) {
        context.addIssue({
          code: "custom",
          message: "Each inquiry field must be unique.",
          path: ["projectFields"],
        });
      }

      ids.add(id);

      if (field.kind === "system") {
        if (field.key === "details" && (!field.enabled || !field.required)) {
          context.addIssue({
            code: "custom",
            message: "Details must stay enabled and required.",
            path: ["projectFields"],
          });
        }

        if (field.key === "attachment" && field.required) {
          context.addIssue({
            code: "custom",
            message: "Attachment cannot be required.",
            path: ["projectFields"],
          });
        }
      }
    }
  });

type CreateInquiryFormConfigDefaultsInput = {
  businessType?: BusinessType;
  /**
   * Explicit workflow selection for generating inquiry form fields.
   * When provided, this determines the field pattern directly.
   * When absent, the workflow is derived from businessType for backward compatibility.
   */
  starterWorkflow?: StarterWorkflowKey;
};

function getDefaultInquiryFormGroupLabels(
  businessType: BusinessType,
): InquiryFormGroupLabels {
  const contact = "Contact details";

  switch (getStarterTemplateBusinessType(businessType)) {
    case "creative_marketing_services":
      return { contact, project: "Project brief" };
    case "consulting_professional_services":
      return { contact, project: "Discovery details" };
    case "contractor_home_improvement":
      return { contact, project: "Project details" };
    case "event_services_rentals":
      return { contact, project: "Event details" };
    case "cleaning_services":
      return { contact, project: "Service details" };
    case "general_project_services":
    default:
      return { contact, project: "Inquiry details" };
  }
}


function createOption(value: string, label?: string): InquiryFieldOption {
  return {
    id: value,
    label: label ?? value,
    value,
  };
}

function createSystemField(
  key: InquiryProjectSystemFieldKey,
  {
    label,
    placeholder,
    enabled = true,
    required = false,
  }: {
    label: string;
    placeholder?: string;
    enabled?: boolean;
    required?: boolean;
  },
): InquiryFormSystemFieldDefinition {
  return {
    kind: "system",
    key,
    label,
    placeholder,
    enabled,
    required,
  };
}

function createCustomField(
  id: string,
  fieldType: InquiryCustomFieldType,
  {
    label,
    placeholder,
    required = false,
    options,
  }: {
    label: string;
    placeholder?: string;
    required?: boolean;
    options?: InquiryFieldOption[];
  },
): InquiryFormCustomFieldDefinition {
  return {
    kind: "custom",
    id,
    fieldType,
    label,
    placeholder,
    required,
    options,
  };
}

// Centralized placeholder definitions by business type category
const placeholderDefinitions = {
  // Contact field placeholders by business type
  contact: {
    // For professional/consulting services - more formal
    consulting_professional_services: {
      customerName: "e.g. Taylor Smith",
      email: "taylor@company.com",
      preferredContact: "How should we reach you?",
    },
    // For contractors/home services - practical, on-site focused
    contractor_home_improvement: {
      customerName: "e.g. Alex Rivera",
      email: "alex@email.com",
      preferredContact: "Best way to reach you?",
    },
    // For creative services - friendly, project-focused
    creative_marketing_services: {
      customerName: "e.g. Jordan Lee",
      email: "jordan@brand.com",
      preferredContact: "How should we reach you?",
    },
    // For event/production services
    event_services_rentals: {
      customerName: "e.g. Sam Torres",
      email: "sam@events.com",
      preferredContact: "Best way to reach you?",
    },
    // For recurring/cleaning services
    cleaning_services: {
      customerName: "e.g. Lisa Chen",
      email: "lisa@email.com",
      preferredContact: "Best way to reach you?",
    },
    // Default / general services
    general_project_services: {
      customerName: "e.g. Casey Jones",
      email: "you@example.com",
      preferredContact: "e.g. Email",
    },
  },

  // Project field placeholders by field key and business type
  project: {
    details: {
      contractor_home_improvement: "Describe the project, site conditions, materials, and timeline...",
      creative_marketing_services: "Share the goal, audience, deliverables, and creative direction...",
      consulting_professional_services: "Describe the challenge, goals, timeline, and desired outcomes...",
      event_services_rentals: "Describe the event, style, requirements, and any special requests...",
      cleaning_services: "Describe the space, any problem areas, and special requirements...",
      general_project_services: "Tell us about your project, timeline, and any specific requirements...",
    },
    budgetText: {
      contractor_home_improvement: "e.g. 50,000 - 100,000",
      creative_marketing_services: "e.g. 25,000 - 50,000",
      consulting_professional_services: "e.g. 20,000 - 40,000",
      event_services_rentals: "e.g. 15,000 - 50,000",
      cleaning_services: "e.g. 2,000 - 5,000 per visit",
      general_project_services: "Your budget range",
    },
    requestedDeadline: {
      contractor_home_improvement: "When do you need this completed?",
      creative_marketing_services: "When do you need this delivered?",
      consulting_professional_services: "Preferred start or completion date",
      event_services_rentals: "When is the event?",
      cleaning_services: "When would you like to start?",
      general_project_services: "When do you need this done?",
    },
    // Custom field placeholders
    location: {
      contractor_home_improvement: "Street address, city, or area",
      creative_marketing_services: "City, region, or remote",
      consulting_professional_services: "City or preferred meeting location",
      event_services_rentals: "Venue name and address",
      cleaning_services: "Street address, city, or area",
      general_project_services: "City or service area",
    },
  },
} as const;

function getContactPlaceholders(
  businessType: StarterTemplateBusinessType,
): { customerName: string; email: string; preferredContact: string } {
  return placeholderDefinitions.contact[businessType] ?? placeholderDefinitions.contact.general_project_services;
}

function getProjectPlaceholder(
  fieldKey: keyof typeof placeholderDefinitions.project,
  businessType: StarterTemplateBusinessType,
): string | undefined {
  const fieldPlaceholders = placeholderDefinitions.project[fieldKey];
  if (!fieldPlaceholders) return undefined;
  return fieldPlaceholders[businessType] ?? fieldPlaceholders.general_project_services;
}

function createContactFieldConfig(
  businessType: StarterTemplateBusinessType = "general_project_services",
): Record<InquiryContactFieldKey, InquiryContactFieldConfig> {
  const placeholders = getContactPlaceholders(businessType);

  return {
    customerName: {
      label: "Your name",
      placeholder: placeholders.customerName,
      enabled: true,
      required: true,
    },
    email: {
      label: "Email",
      placeholder: placeholders.email,
      enabled: true,
      required: true,
    },
    preferredContact: {
      label: "Preferred contact method",
      placeholder: placeholders.preferredContact,
      enabled: true,
      required: true,
    },
  };
}

function createGeneralProjectServicesFields(
  businessType: StarterTemplateBusinessType = "general_project_services",
) {
  return [
    createSystemField("details", {
      label: "What do you need help with?",
      placeholder: getProjectPlaceholder("details", businessType),
      required: true,
    }),
    createCustomField("site-location", "short_text", {
      label: "Service location",
      placeholder: getProjectPlaceholder("location", businessType),
    }),
    createSystemField("requestedDeadline", {
      label: "Preferred timing",
      placeholder: getProjectPlaceholder("requestedDeadline", businessType),
      enabled: true,
    }),
    createSystemField("budgetText", {
      label: "Budget range",
      placeholder: getProjectPlaceholder("budgetText", businessType),
      enabled: true,
    }),
    createSystemField("attachment", {
      label: "Reference files",
      enabled: true,
    }),
  ] satisfies InquiryFormFieldDefinition[];
}

function normalizeLegacyContactFieldLabel(
  field: InquiryContactFieldConfig,
): InquiryContactFieldConfig {
  return field;
}

function createContractorHomeImprovementFields() {
  const businessType: StarterTemplateBusinessType = "contractor_home_improvement";

  return [
    createSystemField("details", {
      label: "Describe the project or work needed",
      placeholder: getProjectPlaceholder("details", businessType),
      required: true,
    }),
    createCustomField("service-address", "short_text", {
      label: "Service location",
      placeholder: getProjectPlaceholder("location", businessType),
    }),
    createCustomField("property-type", "select", {
      label: "Location type",
      options: [
        createOption("house", "House"),
        createOption("condo", "Condo"),
        createOption("apartment", "Apartment"),
        createOption("commercial", "Commercial"),
      ],
    }),
    createCustomField("preferred-visit", "date", {
      label: "Preferred visit or start date",
    }),
    createCustomField("access-notes", "short_text", {
      label: "Access notes",
      placeholder: "Gate code, parking, unit number",
    }),
    createSystemField("requestedDeadline", {
      label: "Target completion",
      placeholder: getProjectPlaceholder("requestedDeadline", businessType),
      enabled: true,
    }),
    createSystemField("budgetText", {
      label: "Budget range",
      placeholder: getProjectPlaceholder("budgetText", businessType),
      enabled: true,
    }),
    createSystemField("attachment", {
      label: "Photos or plans",
      enabled: true,
    }),
  ] satisfies InquiryFormFieldDefinition[];
}

function createCreativeMarketingServicesFields() {
  const businessType: StarterTemplateBusinessType = "creative_marketing_services";

  return [
    createSystemField("details", {
      label: "Tell us about the project",
      placeholder: getProjectPlaceholder("details", businessType),
      required: true,
    }),
    createCustomField("project-timing", "date", {
      label: "Target date",
    }),
    createCustomField("delivery-focus", "multi_select", {
      label: "Where this will be used",
      options: [
        createOption("web", "Web"),
        createOption("social", "Social"),
        createOption("print", "Print"),
        createOption("email", "Email"),
        createOption("video", "Video"),
      ],
    }),
    createSystemField("budgetText", {
      label: "Budget",
      placeholder: getProjectPlaceholder("budgetText", businessType),
      enabled: true,
    }),
    createSystemField("attachment", {
      label: "Reference files",
      enabled: true,
    }),
  ] satisfies InquiryFormFieldDefinition[];
}

function createConsultingProfessionalServicesFields() {
  const businessType: StarterTemplateBusinessType = "consulting_professional_services";

  return [
    createSystemField("details", {
      label: "What are you trying to solve?",
      placeholder: getProjectPlaceholder("details", businessType),
      required: true,
    }),
    createCustomField("format", "select", {
      label: "Preferred format",
      options: [
        createOption("online", "Online"),
        createOption("in-person", "In person"),
        createOption("either", "Either"),
      ],
    }),
    createCustomField("participant-count", "number", {
      label: "Participant count",
    }),
    createCustomField("desired-start", "date", {
      label: "Desired start date",
    }),
    createSystemField("budgetText", {
      label: "Budget",
      placeholder: getProjectPlaceholder("budgetText", businessType),
      enabled: true,
    }),
    createSystemField("attachment", {
      label: "Reference files",
      enabled: true,
    }),
  ] satisfies InquiryFormFieldDefinition[];
}

function createEventServicesFields() {
  const businessType: StarterTemplateBusinessType = "event_services_rentals";

  return [
    createSystemField("details", {
      label: "Tell us about your event",
      placeholder: getProjectPlaceholder("details", businessType),
      required: true,
    }),
    createCustomField("event-date", "date", {
      label: "Event or shoot date",
      required: true,
    }),
    createCustomField("venue-location", "short_text", {
      label: "Venue or location",
      placeholder: getProjectPlaceholder("location", businessType),
      required: true,
    }),
    createCustomField("duration", "select", {
      label: "Duration",
      options: [
        createOption("1-2h", "1–2 hours"),
        createOption("3-4h", "3–4 hours"),
        createOption("half-day", "Half day"),
        createOption("full-day", "Full day"),
        createOption("multi-day", "Multiple days"),
      ],
    }),
    createCustomField("guest-count", "number", {
      label: "Guest or attendee count",
    }),
    createSystemField("budgetText", {
      label: "Budget",
      placeholder: getProjectPlaceholder("budgetText", businessType),
      enabled: true,
    }),
    createSystemField("attachment", {
      label: "Reference files",
      enabled: true,
    }),
  ] satisfies InquiryFormFieldDefinition[];
}

function createRecurringServiceFields() {
  const businessType: StarterTemplateBusinessType = "cleaning_services";

  return [
    createSystemField("details", {
      label: "What service do you need?",
      placeholder: getProjectPlaceholder("details", businessType),
      required: true,
    }),
    createCustomField("service-address", "short_text", {
      label: "Service location",
      placeholder: getProjectPlaceholder("location", businessType),
      required: true,
    }),
    createCustomField("property-size", "select", {
      label: "Property size",
      options: [
        createOption("small", "Small (studio / 1 bed)"),
        createOption("medium", "Medium (2–3 bed)"),
        createOption("large", "Large (4+ bed)"),
        createOption("commercial", "Commercial space"),
      ],
    }),
    createCustomField("frequency", "select", {
      label: "Frequency",
      options: [
        createOption("one-time", "One-time"),
        createOption("weekly", "Weekly"),
        createOption("biweekly", "Every 2 weeks"),
        createOption("monthly", "Monthly"),
        createOption("custom", "Custom schedule"),
      ],
    }),
    createCustomField("preferred-start", "date", {
      label: "Preferred start date",
    }),
    createCustomField("access-notes", "short_text", {
      label: "Access notes",
      placeholder: "Gate code, parking, unit number",
    }),
    createSystemField("attachment", {
      label: "Photos",
      enabled: true,
    }),
  ] satisfies InquiryFormFieldDefinition[];
}

export function createInquiryFormConfigDefaults({
  businessType = "general_project_services",
  starterWorkflow,
}: CreateInquiryFormConfigDefaultsInput = {}): InquiryFormConfig {
  const resolvedBusinessType = normalizeBusinessType(businessType);

  // Determine workflow: explicit selection takes precedence,
  // otherwise derive from businessType for backward compatibility
  const effectiveWorkflow =
    starterWorkflow ?? getRecommendedStarterWorkflow(resolvedBusinessType);

  // Map workflow to the legacy template type for field generation
  // This preserves existing field builders while using new workflow concept
  let starterTemplateBusinessType: StarterTemplateBusinessType;

  switch (effectiveWorkflow) {
    case "recurring_service":
      starterTemplateBusinessType = "cleaning_services";
      break;
    case "consultation_proposal":
      starterTemplateBusinessType = "consulting_professional_services";
      break;
    case "project_quote":
    default:
      // For project_quote, use general project fields if business type normally
      // maps to recurring or consultation, otherwise use the business-type-specific
      // template to preserve vertical-appropriate field patterns
      if (
        getRecommendedStarterWorkflow(resolvedBusinessType) !== "project_quote"
      ) {
        // This business type normally uses a different workflow,
        // so use general project fields for project_quote
        starterTemplateBusinessType = "general_project_services";
      } else {
        // This business type naturally uses project_quote workflow,
        // so use its specific template
        starterTemplateBusinessType = getStarterTemplateBusinessType(resolvedBusinessType);
      }
      break;
  }

  let projectFields: InquiryFormFieldDefinition[];

  switch (starterTemplateBusinessType) {
    case "creative_marketing_services":
      projectFields = createCreativeMarketingServicesFields();
      break;
    case "consulting_professional_services":
      projectFields = createConsultingProfessionalServicesFields();
      break;
    case "contractor_home_improvement":
      projectFields = createContractorHomeImprovementFields();
      break;
    case "event_services_rentals":
      projectFields = createEventServicesFields();
      break;
    case "cleaning_services":
      projectFields = createRecurringServiceFields();
      break;
    case "general_project_services":
    default:
      projectFields = createGeneralProjectServicesFields(starterTemplateBusinessType);
      break;
  }

  return {
    version: 1,
    businessType: resolvedBusinessType,
    groupLabels: getDefaultInquiryFormGroupLabels(resolvedBusinessType),
    contactFields: createContactFieldConfig(starterTemplateBusinessType),
    projectFields,
  };
}

/**
 * Strips the legacy `serviceCategory` customer-facing field from persisted
 * configs. The Service is now owned by the parent Service form
 * (`businessInquiryFormId`), so asking the customer to select it is redundant.
 */
function stripLegacyServiceCategoryField(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as { projectFields?: unknown };

  if (!Array.isArray(record.projectFields)) {
    return value;
  }

  return {
    ...record,
    projectFields: record.projectFields.filter((field) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) {
        return true;
      }

      const candidate = field as { kind?: unknown; key?: unknown; id?: unknown };

      if (candidate.kind === "system" && candidate.key === "serviceCategory") {
        return false;
      }

      if (candidate.id === "serviceCategory") {
        return false;
      }

      return true;
    }),
  };
}

/**
 * Custom field ids removed from the starter templates because they duplicated
 * the required `details` brief or asked a redundant question next to the
 * direct file upload. Persisted configs that still carry them are cleaned on
 * read so existing businesses stop showing the old fields. Historical inquiry
 * answers are unaffected (they live in snapshot rows, not the form config).
 */
const removedLegacyCustomFieldIds = new Set([
  "deliverables",
  "goal",
  "reference-materials-ready",
]);

function stripRemovedLegacyCustomFields(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }

  const record = value as { projectFields?: unknown };

  if (!Array.isArray(record.projectFields)) {
    return value;
  }

  return {
    ...record,
    projectFields: record.projectFields.filter((field) => {
      if (!field || typeof field !== "object" || Array.isArray(field)) {
        return true;
      }

      const candidate = field as { kind?: unknown; id?: unknown };

      if (
        candidate.kind === "custom" &&
        typeof candidate.id === "string" &&
        removedLegacyCustomFieldIds.has(candidate.id)
      ) {
        return false;
      }

      return true;
    }),
  };
}

export function getNormalizedInquiryFormConfig(
  value: unknown,
  defaults?: CreateInquiryFormConfigDefaultsInput,
) {
  const fallback = createInquiryFormConfigDefaults(defaults);
  const normalizedValue = stripRemovedLegacyCustomFields(
    stripLegacyServiceCategoryField(
      normalizeInquiryFormConfigValue(value, fallback.businessType),
    ),
  );
  const parsed = inquiryFormConfigSchema.safeParse(normalizedValue);

  if (!parsed.success) {
    return fallback;
  }

  return {
    ...parsed.data,
    groupLabels: {
      ...fallback.groupLabels,
      ...(parsed.data.groupLabels ?? {}),
    },
    contactFields: {
      customerName: normalizeLegacyContactFieldLabel(
        parsed.data.contactFields.customerName,
      ),
      email: parsed.data.contactFields.email
        ? normalizeLegacyContactFieldLabel(parsed.data.contactFields.email)
        : { label: "Email", placeholder: "you@example.com", enabled: true, required: true },
      preferredContact: normalizeLegacyContactFieldLabel(
        parsed.data.contactFields.preferredContact,
      ),
    },
  } satisfies InquiryFormConfig;
}

export function getNormalizedInquirySubmittedFieldSnapshot(value: unknown) {
  const parsed = inquirySubmittedFieldSnapshotSchema.safeParse(
    normalizeInquirySubmittedFieldSnapshotValue(value),
  );

  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

export function getInquiryFormFieldInputName(
  field: InquiryFormFieldDefinition | InquiryContactFieldKey,
) {
  if (typeof field === "string") {
    return field;
  }

  if (field.kind === "system") {
    return field.key;
  }

  return `custom_${field.id}`;
}

export function getInquirySubmittedFieldValueDisplay(
  value: string | string[] | boolean | null,
) {
  if (Array.isArray(value)) {
    return value.length ? value.join(", ") : "Not provided";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  if (typeof value === "string") {
    return value.trim() || "Not provided";
  }

  return "Not provided";
}


function resolveFieldKind(field: InquirySubmittedFieldSnapshotField): InquiryFieldKind {
  if (field.fieldKind) {
    return field.fieldKind;
  }

  if ((inquiryContactFieldKeys as readonly string[]).includes(field.id)) {
    return "contact";
  }

  if ((inquiryProjectSystemFieldKeys as readonly string[]).includes(field.id)) {
    return "system";
  }

  // Legacy snapshots may still carry a serviceCategory field.
  if (field.id === "serviceCategory") {
    return "system";
  }

  return "custom";
}

/**
 * @deprecated Use `getCustomSubmittedFields()` instead.
 */
export function getAdditionalInquirySubmittedFields(
  snapshot: InquirySubmittedFieldSnapshot | null | undefined,
) {
  return getCustomSubmittedFields(snapshot);
}

/** Contact fields from the submitted snapshot. */
export function getContactSubmittedFields(
  snapshot: InquirySubmittedFieldSnapshot | null | undefined,
) {
  if (!snapshot) {
    return [];
  }

  return snapshot.fields.filter((field) => resolveFieldKind(field) === "contact");
}

/**
 * Summary-level system fields (budget, deadline).
 * Excludes details and attachment which are displayed in their own sections.
 */
const summaryFieldIds = new Set<string>(["requestedDeadline", "budgetText"]);

export function getSummarySubmittedFields(
  snapshot: InquirySubmittedFieldSnapshot | null | undefined,
) {
  if (!snapshot) {
    return [];
  }

  return snapshot.fields.filter(
    (field) => resolveFieldKind(field) === "system" && summaryFieldIds.has(field.id),
  );
}

/**
 * Detail-level system fields (details/message, and any other system fields not in summary).
 * Excludes attachment which is displayed in its own section.
 */
export function getDetailSubmittedFields(
  snapshot: InquirySubmittedFieldSnapshot | null | undefined,
) {
  if (!snapshot) {
    return [];
  }

  return snapshot.fields.filter(
    (field) =>
      resolveFieldKind(field) === "system" &&
      !summaryFieldIds.has(field.id) &&
      field.id !== "attachment",
  );
}

/** Custom fields from the submitted snapshot. Displayed under "Additional Details". */
export function getCustomSubmittedFields(
  snapshot: InquirySubmittedFieldSnapshot | null | undefined,
) {
  if (!snapshot) {
    return [];
  }

  return snapshot.fields.filter((field) => resolveFieldKind(field) === "custom");
}

/**
 * Returns the best display label for a submitted field.
 * Fallback chain: snapshot label → current field label → default label → humanized key.
 */
export function getFieldDisplayLabel(
  snapshotField: InquirySubmittedFieldSnapshotField | undefined,
  fieldKey: string,
  currentLabel?: string,
) {
  if (snapshotField?.label) {
    return snapshotField.label;
  }

  if (currentLabel) {
    return currentLabel;
  }

  const systemDefault = systemFieldDefaultLabels[fieldKey as InquiryProjectSystemFieldKey];

  if (systemDefault) {
    return systemDefault;
  }

  const contactDefault = contactFieldFixedLabels[fieldKey as InquiryContactFieldKey];

  if (contactDefault) {
    return contactDefault;
  }

  // Humanize: "budgetText" → "Budget Text", "service-address" → "Service Address"
  return fieldKey
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
