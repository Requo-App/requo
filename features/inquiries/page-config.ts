
import { z } from "zod";

import { getStarterTemplateBusinessType } from "@/features/businesses/starter-templates";
import {
  normalizeBusinessType,
  type BusinessType,
} from "@/features/inquiries/business-types";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type { PlanTier as plan } from "@/lib/plans/plans";

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
    z
      .string()
      .trim()
      .max(maxLength, `Use ${maxLength} characters or fewer.`)
      .optional(),
  );
}

function optionalEmail(maxLength = 320) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(maxLength, `Use ${maxLength} characters or fewer.`)
      .email("Enter a valid email address.")
      .optional(),
  );
}

function isValidExternalUrl(value: string) {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

function optionalExternalUrl(maxLength = 2000) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(maxLength, `Use ${maxLength} characters or fewer.`)
      .refine(isValidExternalUrl, "Enter a valid URL.")
      .optional(),
  );
}

export const inquiryPageTemplates = [
  "split",
  "showcase",
  "no_supporting_cards",
] as const;
export const inquiryPageMobileLayouts = [
  "full",
  "compact",
] as const;
export const inquiryPageShowcaseImageFrames = [
  "wide",
  "landscape",
  "square",
  "portrait",
] as const;
export const inquiryPageShowcaseImageSizes = [
  "compact",
  "standard",
  "large",
] as const;
export const maxInquiryPageCards = 6;
export const maxInquiryPageCardTitleLength = 48;
export const maxInquiryPageCardDescriptionLength = 120;

export type InquiryPageTemplate = (typeof inquiryPageTemplates)[number];
export type InquiryPageMobileLayout =
  (typeof inquiryPageMobileLayouts)[number];
export type InquiryPageShowcaseImageFrame =
  (typeof inquiryPageShowcaseImageFrames)[number];
export type InquiryPageShowcaseImageSize =
  (typeof inquiryPageShowcaseImageSizes)[number];

function normalizeInquiryPageTemplateValue(value: unknown) {
  if (value === "stacked") {
    return "no_supporting_cards";
  }

  return value;
}

export const inquiryPageTemplateSchema = z.preprocess(
  normalizeInquiryPageTemplateValue,
  z.enum(inquiryPageTemplates),
);

function normalizeInquiryPageMobileLayoutValue(value: unknown) {
  if (value === "default") {
    return "full";
  }

  return value;
}

export const inquiryPageMobileLayoutSchema = z.preprocess(
  normalizeInquiryPageMobileLayoutValue,
  z.enum(inquiryPageMobileLayouts).default("full"),
);

export const inquiryPageTemplateMeta: Record<
  InquiryPageTemplate,
  {
    label: string;
    description: string;
  }
> = {
  split: {
    label: "Split",
    description: "Story and supporting cards on the left, form on the right.",
  },
  showcase: {
    label: "Showcase",
    description: "A branded lead surface with supporting details beside the form.",
  },
  no_supporting_cards: {
    label: "No supporting cards",
    description: "Show the intro and inquiry form only, with no supporting card row.",
  },
};

export const inquiryPageMobileLayoutMeta: Record<
  InquiryPageMobileLayout,
  {
    label: string;
    description: string;
  }
> = {
  full: {
    label: "Full",
    description: "Form first, intro and supporting content below.",
  },
  compact: {
    label: "Form only",
    description: "Show just the form on mobile.",
  },
};

export const inquiryPageShowcaseImageFrameMeta: Record<
  InquiryPageShowcaseImageFrame,
  {
    label: string;
    description: string;
  }
> = {
  wide: {
    label: "Wide",
    description: "16:9",
  },
  landscape: {
    label: "Landscape",
    description: "4:3",
  },
  square: {
    label: "Square",
    description: "1:1",
  },
  portrait: {
    label: "Portrait",
    description: "4:5",
  },
};

export const inquiryPageShowcaseImageSizeMeta: Record<
  InquiryPageShowcaseImageSize,
  {
    label: string;
    description: string;
  }
> = {
  compact: {
    label: "Compact",
    description: "Smaller block",
  },
  standard: {
    label: "Standard",
    description: "Balanced size",
  },
  large: {
    label: "Large",
    description: "Full width",
  },
};

export const inquiryPageCardIconKeys = [
  "details",
  "upload",
  "owner",
  "schedule",
  "measurements",
  "package",
  "sparkles",
  "contact",
] as const;

export type InquiryPageCardIcon = (typeof inquiryPageCardIconKeys)[number];



export const inquiryPageCardSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1, "Card id is required.")
    .max(120, "Card id is too long."),
  title: z
    .string()
    .trim()
    .min(1, "Card title is required.")
    .max(
      maxInquiryPageCardTitleLength,
      `Card title must be ${maxInquiryPageCardTitleLength} characters or fewer.`,
    ),
  description: z
    .string()
    .trim()
    .min(1, "Card description is required.")
    .max(
      maxInquiryPageCardDescriptionLength,
      `Card description must be ${maxInquiryPageCardDescriptionLength} characters or fewer.`,
    ),
  icon: z.enum(inquiryPageCardIconKeys),
});

export type InquiryPageCard = z.infer<typeof inquiryPageCardSchema>;

export const inquiryPageBusinessContactSocialKeys = [
  "facebook",
  "instagram",
  "twitterX",
  "linkedin",
] as const;

export type InquiryPageBusinessContactSocialKey =
  (typeof inquiryPageBusinessContactSocialKeys)[number];

export const inquiryPageBusinessContactSocialMeta: Record<
  InquiryPageBusinessContactSocialKey,
  {
    label: string;
    placeholder: string;
  }
> = {
  facebook: {
    label: "Facebook",
    placeholder: "https://facebook.com/your-business",
  },
  instagram: {
    label: "Instagram",
    placeholder: "https://instagram.com/your-business",
  },
  twitterX: {
    label: "X (Twitter)",
    placeholder: "https://x.com/your-business",
  },
  linkedin: {
    label: "LinkedIn",
    placeholder: "https://linkedin.com/company/your-business",
  },
};

const inquiryPageBusinessContactSocialLinksSchema = z.object({
  facebook: optionalExternalUrl(),
  instagram: optionalExternalUrl(),
  twitterX: optionalExternalUrl(),
  linkedin: optionalExternalUrl(),
});

export const inquiryPageBusinessContactSchema = z.object({
  phone: optionalText(40),
  email: optionalEmail(),
  socialLinks: inquiryPageBusinessContactSocialLinksSchema.optional(),
});

export type InquiryPageBusinessContact = z.infer<
  typeof inquiryPageBusinessContactSchema
>;

function isValidInquiryPageImageUrl(value: string) {
  if (value.startsWith("/")) {
    return true;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const inquiryPageImageUrlValueSchema = z
  .string()
  .trim()
  .max(2000, "Use 2000 characters or fewer.")
  .refine(isValidInquiryPageImageUrl, "Enter a valid image URL.");

export const inquiryPageImageUrlSchema = z.preprocess(
  emptyToUndefined,
  inquiryPageImageUrlValueSchema.optional(),
);

export const inquiryPageShowcaseImageCropSchema = z.object({
  x: z.number().min(-4).max(4),
  y: z.number().min(-4).max(4),
  zoom: z.number().min(1).max(4),
});

export type InquiryPageShowcaseImageCrop = z.infer<
  typeof inquiryPageShowcaseImageCropSchema
>;

export const inquiryPageShowcaseImageSchema = z.object({
  url: inquiryPageImageUrlValueSchema,
  frame: z.enum(inquiryPageShowcaseImageFrames),
  size: z.enum(inquiryPageShowcaseImageSizes),
  crop: inquiryPageShowcaseImageCropSchema.optional(),
});

export type InquiryPageShowcaseImage = z.infer<
  typeof inquiryPageShowcaseImageSchema
>;

export const inquiryPageConfigSchema = z.object({
  template: inquiryPageTemplateSchema,
  mobileLayout: inquiryPageMobileLayoutSchema,
  showSupportingCards: z.boolean().default(true),
  showShowcaseImage: z.boolean().default(false),
  showBusinessContact: z.boolean().default(true),
  eyebrow: optionalText(48),
  headline: z
    .string()
    .trim()
    .min(1, "Enter a headline.")
    .max(120, "Headline must be 120 characters or fewer."),
  description: optionalText(280),
  brandTagline: optionalText(120),
  formTitle: z
    .string()
    .trim()
    .min(1, "Enter a form title.")
    .max(80, "Form title must be 80 characters or fewer."),
  formDescription: optionalText(200),
  businessContact: inquiryPageBusinessContactSchema.optional(),
  cards: z
    .array(inquiryPageCardSchema)
    .max(
      maxInquiryPageCards,
      `Use ${maxInquiryPageCards} supporting cards or fewer.`,
    ),
  showcaseImage: inquiryPageShowcaseImageSchema.optional(),
  thankYouMessage: optionalText(280),
});

export type InquiryPageConfig = z.infer<typeof inquiryPageConfigSchema>;

export function createInquiryPageBusinessContact(input: {
  phone?: string | null | undefined;
  email?: string | null | undefined;
  socialLinks?: Partial<
    Record<InquiryPageBusinessContactSocialKey, string | null | undefined>
  >;
}): InquiryPageBusinessContact | undefined {
  const phone = normalizeOptionalString(input.phone);
  const email = normalizeOptionalString(input.email);
  const socialLinks = Object.fromEntries(
    inquiryPageBusinessContactSocialKeys.flatMap((key) => {
      const value = normalizeOptionalString(input.socialLinks?.[key]);
      return value ? [[key, value]] : [];
    }),
  ) as Partial<Record<InquiryPageBusinessContactSocialKey, string>>;

  if (!phone && !email && !Object.keys(socialLinks).length) {
    return undefined;
  }

  return {
    ...(phone ? { phone } : {}),
    ...(email ? { email } : {}),
    ...(Object.keys(socialLinks).length ? { socialLinks } : {}),
  };
}

type InquiryPageConfigDefaultsInput = {
  businessName: string;
  businessShortDescription?: string | null;
  legacyInquiryHeadline?: string | null;
  businessType?: BusinessType;
  template?: InquiryPageTemplate;
  plan?: plan;
};

function createDefaultInquiryPageCards(
  businessType: BusinessType,
): InquiryPageCard[] {
  switch (getStarterTemplateBusinessType(businessType)) {
    case "creative_marketing_services":
      return [
        {
          id: "details",
          title: "Share the brief",
          description: "Tell us the goal, scope, and deliverables that matter most.",
          icon: "sparkles",
        },
        {
          id: "upload",
          title: "Send references",
          description: "Upload briefs, references, or files before we quote.",
          icon: "upload",
        },
        {
          id: "schedule",
          title: "Call out timing",
          description: "Tell us the target date or timeline up front.",
          icon: "schedule",
        },
      ];
    case "consulting_professional_services":
      return [
        {
          id: "details",
          title: "Share the goal",
          description: "Tell us the challenge, scope, or outcome you want.",
          icon: "details",
        },
        {
          id: "upload",
          title: "Add context",
          description: "Upload notes or files if they help us qualify the work.",
          icon: "upload",
        },
        {
          id: "schedule",
          title: "Pick a start point",
          description: "Tell us when you want to begin.",
          icon: "schedule",
        },
      ];
    case "contractor_home_improvement":
      return [
        {
          id: "details",
          title: "Describe the scope",
          description: "Tell us the project, site, and work needed.",
          icon: "details",
        },
        {
          id: "upload",
          title: "Add photos or plans",
          description: "Photos and plans help us qualify the job before pricing.",
          icon: "upload",
        },
        {
          id: "schedule",
          title: "Share timing",
          description: "Tell us the target schedule or preferred visit window.",
          icon: "schedule",
        },
      ];
    case "event_services_rentals":
      return [
        {
          id: "details",
          title: "Describe the event",
          description: "Tell us the date, venue, and what you need covered.",
          icon: "details",
        },
        {
          id: "upload",
          title: "Share references",
          description: "Upload mood boards, venue photos, or event plans.",
          icon: "upload",
        },
        {
          id: "schedule",
          title: "Confirm the date",
          description: "Lock in the event date so we can check availability.",
          icon: "schedule",
        },
      ];
    case "cleaning_services":
      return [
        {
          id: "details",
          title: "Describe the space",
          description: "Tell us the property type, size, and what needs attention.",
          icon: "details",
        },
        {
          id: "upload",
          title: "Add photos",
          description: "Photos help us estimate time and price accurately.",
          icon: "upload",
        },
        {
          id: "schedule",
          title: "Pick a schedule",
          description: "Tell us how often you need service and when to start.",
          icon: "schedule",
        },
      ];
    case "general_project_services":
    default:
      return [
        {
          id: "details",
          title: "Share the essentials",
          description: "Tell us the service, timing, and scope.",
          icon: "details",
        },
        {
          id: "upload",
          title: "Add files if helpful",
          description: "Upload files, photos, or notes that help us review.",
          icon: "upload",
        },
        {
          id: "schedule",
          title: "Call out the timing",
          description: "Tell us when you need a reply, quote, or delivery window.",
          icon: "schedule",
        },
      ];
  }
}

export function createInquiryPageConfigDefaults(
  input: InquiryPageConfigDefaultsInput,
): InquiryPageConfig {
  const {
    businessName,
    legacyInquiryHeadline,
    businessType = "general_project_services",
    plan,
    template,
  } = input;
  const resolvedBusinessType = normalizeBusinessType(businessType);
  const starterTemplateBusinessType =
    getStarterTemplateBusinessType(resolvedBusinessType);
  const defaultTemplate =
    starterTemplateBusinessType === "creative_marketing_services"
      ? "showcase"
      : starterTemplateBusinessType === "consulting_professional_services"
        ? "no_supporting_cards"
        : starterTemplateBusinessType === "event_services_rentals"
          ? "showcase"
          : "split";
  const resolvedTemplate =
    plan && !hasFeatureAccess(plan, "servicePageCustomization")
      ? "no_supporting_cards"
      : (template ?? defaultTemplate);

  let eyebrow = "Inquiry";
  let headline = `Tell ${businessName} what you need help with.`;
  let description =
    legacyInquiryHeadline?.trim() ||
    `Share the key details so ${businessName} can review the fit before quoting.`;
  let formTitle = "Start inquiry";
  const formDescription = `Your inquiry goes straight to ${businessName}. They can review the details before pricing.`;

  switch (starterTemplateBusinessType) {
    case "creative_marketing_services":
      eyebrow = "Project inquiry";
      headline = `Send your project brief to ${businessName}.`;
      description =
        legacyInquiryHeadline?.trim() ||
        `Share the scope, deliverables, timing, and references so ${businessName} can qualify the work before quoting.`;
      formTitle = "Start project inquiry";
      break;
    case "consulting_professional_services":
      eyebrow = "Discovery inquiry";
      headline = `Start your discovery inquiry with ${businessName}.`;
      description =
        legacyInquiryHeadline?.trim() ||
        `Share the goal, business context, and preferred timing so ${businessName} can scope the right next step before pricing.`;
      formTitle = "Start discovery inquiry";
      break;
    case "contractor_home_improvement":
      eyebrow = "Project inquiry";
      headline = `Tell ${businessName} about the project or service you need.`;
      description =
        legacyInquiryHeadline?.trim() ||
        `Share the project scope, site, timing, and photos so ${businessName} can review before pricing.`;
      formTitle = "Start project inquiry";
      break;
    case "event_services_rentals":
      eyebrow = "Event inquiry";
      headline = `Tell ${businessName} about your event or shoot.`;
      description =
        legacyInquiryHeadline?.trim() ||
        `Share the date, venue, and requirements so ${businessName} can check availability and quote.`;
      formTitle = "Start event inquiry";
      break;
    case "cleaning_services":
      eyebrow = "Service inquiry";
      headline = `Request a quote from ${businessName}.`;
      description =
        legacyInquiryHeadline?.trim() ||
        `Share the property details, schedule, and requirements so ${businessName} can price the service.`;
      formTitle = "Start service inquiry";
      break;
    case "general_project_services":
      eyebrow = "Service inquiry";
      headline = `Tell ${businessName} what you need help with.`;
      description =
        legacyInquiryHeadline?.trim() ||
        `Share the service need, timing, budget, and files so ${businessName} can review before quoting.`;
      formTitle = "Start inquiry";
      break;
    default:
      break;
  }

  return {
    template: resolvedTemplate,
    mobileLayout: "full" as const,
    showSupportingCards: resolvedTemplate !== "no_supporting_cards",
    showShowcaseImage: false,
    showBusinessContact: true,
    eyebrow,
    headline,
    description,
    brandTagline: undefined,
    formTitle,
    formDescription,
    businessContact: undefined,
    cards: createDefaultInquiryPageCards(resolvedBusinessType),
    showcaseImage: undefined,
    thankYouMessage: undefined,
  };
}

export function getNormalizedInquiryPageConfig(
  value: unknown,
  defaults: InquiryPageConfigDefaultsInput,
) {
  const fallback = createInquiryPageConfigDefaults(defaults);
  const parsed = inquiryPageConfigSchema.safeParse(value);

  if (!parsed.success) {
    return fallback;
  }

  const rawValue = isRecord(value) ? value : null;

  return {
    ...parsed.data,
    showSupportingCards:
      typeof rawValue?.showSupportingCards === "boolean"
        ? parsed.data.showSupportingCards
        : fallback.showSupportingCards,
    showShowcaseImage:
      typeof rawValue?.showShowcaseImage === "boolean"
        ? parsed.data.showShowcaseImage
        : Boolean(parsed.data.showcaseImage?.url),
    showBusinessContact:
      typeof rawValue?.showBusinessContact === "boolean"
        ? parsed.data.showBusinessContact
        : fallback.showBusinessContact,
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  const trimmedValue = value?.trim();
  return trimmedValue ? trimmedValue : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
