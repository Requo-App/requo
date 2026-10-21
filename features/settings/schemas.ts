import { z } from "zod";

import {
  isSupportedBusinessCountryCode,
  isSupportedBusinessCurrencyCode,
  normalizeBusinessCountryCode,
  normalizeBusinessCurrencyCode,
} from "@/features/businesses/locale";
import { businessTypes } from "@/features/inquiries/business-types";
import { inquiryFormConfigSchema } from "@/features/inquiries/form-config";
import {
  inquiryPageCardSchema,
  inquiryPageImageUrlSchema,
  inquiryPageMobileLayoutSchema,
  inquiryPageShowcaseImageFrames,
  inquiryPageShowcaseImageSizes,
  inquiryPageTemplateSchema,
  maxInquiryPageCards,
} from "@/features/inquiries/page-config";
import { businessInstructionsMaxLength } from "@/lib/ai/business-instructions";
import { isAcceptedFileType } from "@/lib/files";
import {
  normalizePublicSlugInput,
  publicSlugMaxLength,
  publicSlugRegex,
} from "@/lib/slugs";
import {
  businessLogoAllowedExtensions,
  normalizeBusinessSlug,
  businessLogoAllowedMimeTypes,
  businessLogoMaxSize,
} from "@/features/settings/utils";

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

function optionalCountryCode() {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .transform(normalizeBusinessCountryCode)
      .refine(
        isSupportedBusinessCountryCode,
        "Choose a valid country.",
      )
      .optional(),
  );
}

function supportedCurrencyCode(defaultValue = "USD") {
  return z
    .string()
    .trim()
    .transform(normalizeBusinessCurrencyCode)
    .refine(
      isSupportedBusinessCurrencyCode,
      "Choose a supported currency.",
    )
    .default(defaultValue);
}

function optionalEmail(maxLength = 320) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(maxLength, `Email must be ${maxLength} characters or fewer.`)
      .email("Enter a valid email address.")
      .optional(),
  );
}

function optionalExternalUrl(maxLength = 2000) {
  return z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .max(maxLength, `Use ${maxLength} characters or fewer.`)
      .refine((value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      }, "Enter a valid URL.")
      .optional(),
  );
}

function formBoolean() {
  return z.preprocess(
    (value) => value === true || value === "true" || value === "on",
    z.boolean(),
  );
}

function formNumber({
  invalidMessage,
  max,
  min,
}: {
  invalidMessage: string;
  max: number;
  min: number;
}) {
  return z.preprocess(
    (value) => {
      if (typeof value === "number") {
        return value;
      }

      if (typeof value !== "string") {
        return value;
      }

      const normalized = value.trim();

      if (!normalized) {
        return Number.NaN;
      }

      return Number(normalized);
    },
    z
      .number({
        error: invalidMessage,
      })
      .finite(invalidMessage)
      .min(min)
      .max(max),
  );
}

function jsonField<T extends z.ZodTypeAny>(schema: T, emptyFallback: unknown) {
  return z.preprocess((value) => {
    if (typeof value !== "string") {
      return emptyFallback;
    }

    const trimmedValue = value.trim();

    if (!trimmedValue) {
      return emptyFallback;
    }

    try {
      return JSON.parse(trimmedValue);
    } catch {
      return Symbol.for("invalid-json-field");
    }
  }, schema);
}

const businessLogoSchema = z.preprocess(
  (value) => {
    if (!(value instanceof File)) {
      return undefined;
    }

    if (value.size === 0 || value.name.trim() === "") {
      return undefined;
    }

    return value;
  },
  z
    .instanceof(File)
    .refine(
      (file) => file.size <= businessLogoMaxSize,
      "Upload a logo that is 2 MB or smaller.",
    )
    .refine(
      (file) =>
        isAcceptedFileType(file, {
          allowedExtensions: businessLogoAllowedExtensions,
          allowedMimeTypes: businessLogoAllowedMimeTypes,
        }),
      "Upload a JPG, PNG, or WEBP logo.",
    )
    .optional(),
);

export const businessGeneralSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a business name.")
    .max(120, "Use 120 characters or fewer."),
  slug: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(publicSlugMaxLength, `Use ${publicSlugMaxLength} characters or fewer.`)
    .transform(normalizeBusinessSlug)
    .refine(
      (value) => publicSlugRegex.test(value),
      "Use lowercase letters, numbers, and hyphens only.",
  ),
  countryCode: optionalCountryCode(),
  shortDescription: optionalText(280),
  contactEmail: optionalEmail(),
  website: optionalExternalUrl(),
  defaultCurrency: supportedCurrencyCode(),
  defaultEmailSignature: optionalText(1200),
  logo: businessLogoSchema,
  removeLogo: formBoolean().default(false),
});

export const businessNotificationSettingsSchema = z.object({
  notifyInAppOnNewInquiry: z.boolean(),
  notifyInAppOnQuoteSent: z.boolean(),
  notifyInAppOnQuoteResponse: z.boolean(),
  notifyInAppOnMemberInviteResponse: z.boolean(),
  notifyPushOnNewInquiry: z.boolean(),
  notifyPushOnQuoteSent: z.boolean(),
  notifyPushOnQuoteResponse: z.boolean(),
  notifyPushOnMemberInviteResponse: z.boolean(),
  notifyInAppOnFollowUpReminder: z.boolean(),
  notifyInAppOnQuoteExpiring: z.boolean(),
});

export type BusinessGeneralSettingsInput = z.infer<
  typeof businessGeneralSettingsSchema
>;

export type BusinessNotificationSettingsInput = z.infer<
  typeof businessNotificationSettingsSchema
>;

export const businessQuoteSettingsSchema = z.object({
  defaultQuoteNotes: optionalText(1600),
  defaultQuoteTerms: optionalText(4000),
  defaultQuoteValidityDays: z.preprocess(
    (value) => {
      if (typeof value === "number") {
        return value;
      }

      if (typeof value !== "string") {
        return value;
      }

      const normalized = value.trim();

      if (!normalized) {
        return Number.NaN;
      }

      return Number(normalized);
    },
    z
      .number()
      .int("Enter a whole number of days.")
      .min(1, "Use at least 1 day.")
      .max(365, "Use 365 days or fewer."),
  ),
  sendInquiryAckEmail: formBoolean().default(true),
  autoDraftQuoteOnQualify: formBoolean().default(true),
  autoArchiveStaleInquiries: formBoolean().default(true),
  autoArchiveStaleInquiryDays: z.preprocess(
    (value) => {
      if (typeof value === "number") {
        return value;
      }

      if (typeof value !== "string") {
        return value;
      }

      const normalized = value.trim();

      if (!normalized) {
        return Number.NaN;
      }

      return Number(normalized);
    },
    z
      .number()
      .int("Enter a whole number of days.")
      .min(1, "Use at least 1 day.")
      .max(365, "Use 365 days or fewer."),
  ),
  autoFollowUpOnQuoteViewed: formBoolean().default(true),
  quoteViewedFollowUpDelayDays: z.preprocess(
    (value) => {
      if (typeof value === "number") {
        return value;
      }

      if (typeof value !== "string") {
        return value;
      }

      const normalized = value.trim();

      if (!normalized) {
        return Number.NaN;
      }

      return Number(normalized);
    },
    z
      .number()
      .int("Enter a whole number of days.")
      .min(1, "Use at least 1 day.")
      .max(90, "Use 90 days or fewer."),
  ),
});

export type BusinessQuoteSettingsInput = z.infer<
  typeof businessQuoteSettingsSchema
>;

const emailBlockIdSchema = z
  .string()
  .trim()
  .min(1, "Block id is required.")
  .max(64, "Block id is too long.")
  .regex(/^[A-Za-z0-9_-]+$/, "Block id contains invalid characters.");

const emailBlockContentSchema = z.preprocess(
  (value) => (value == null ? "" : value),
  z
    .string()
    .max(2000, "Use 2000 characters or fewer.")
    .optional()
    .default(""),
);

const emailBlockStyleSchema = z
  .object({
    align: z.enum(["left", "center", "right"]).optional(),
    fontSize: z.enum(["sm", "md", "lg"]).optional(),
    textColor: z
      .union([
        z.enum(["default", "muted"]),
        z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #008060."),
      ])
      .optional(),
    buttonColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #008060.")
      .optional(),
    buttonTextColor: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #ffffff.")
      .optional(),
    spacing: z.enum(["compact", "comfortable", "spacious"]).optional(),
  })
  .strict()
  .optional();

const emailTemplateBlockSchema = z
  .object({
    id: emailBlockIdSchema,
    type: z.enum([
      "greeting",
      "intro",
      "text",
      "cta",
      "summary",
      "line-items",
      "totals",
      "notes",
      "payment-terms",
      "signature",
      "closing",
      "divider",
      "spacer",
    ]),
    content: emailBlockContentSchema,
    visible: z.preprocess(
      (value) => (value === undefined ? true : value),
      z.boolean(),
    ),
    style: emailBlockStyleSchema,
  })
  .strict()
  .superRefine((block, ctx) => {
    const maxForType =
      block.type === "greeting"
        ? 200
        : block.type === "cta"
          ? 60
          : block.type === "intro" || block.type === "text" || block.type === "closing"
            ? 400
            : 2000;
    if ((block.content ?? "").length > maxForType) {
      ctx.addIssue({
        code: "too_big",
        origin: "string",
        maximum: maxForType,
        inclusive: true,
        message: `Use ${maxForType} characters or fewer.`,
        path: ["content"],
      });
    }
  });

const SINGLETON_BLOCK_TYPES = new Set([
  "greeting",
  "intro",
  "summary",
  "line-items",
  "totals",
  "notes",
  "payment-terms",
  "signature",
  "closing",
  "cta",
]);

function makeEmailTemplateSettingsSchema({
  forbiddenTypes = [],
  requireCta,
  allowCta,
}: {
  forbiddenTypes?: string[];
  requireCta: boolean;
  allowCta: boolean;
}) {
  const forbidden = new Set(forbiddenTypes);
  return z
    .object({
      subject: z
        .string()
        .trim()
        .min(1, "Enter a subject line.")
        .max(200, "Use 200 characters or fewer."),
      blocks: z
        .array(emailTemplateBlockSchema)
        .min(1, "Add at least one block.")
        .max(20, "Use 20 blocks or fewer."),
    })
    .strict()
    .superRefine((value, ctx) => {
      const singletonCounts = new Map<string, number>();
      let ctaCount = 0;
      value.blocks.forEach((block) => {
        if (forbidden.has(block.type)) {
          ctx.addIssue({
            code: "custom",
            message: `The ${block.type} block is not available in this template.`,
            path: ["blocks"],
          });
        }
        if (SINGLETON_BLOCK_TYPES.has(block.type)) {
          singletonCounts.set(
            block.type,
            (singletonCounts.get(block.type) ?? 0) + 1,
          );
        }
        if (block.type === "cta") {
          ctaCount += 1;
          if (!allowCta) {
            ctx.addIssue({
              code: "custom",
              message: "This template does not support a call-to-action block.",
              path: ["blocks"],
            });
          }
          if (block.visible === false) {
            ctx.addIssue({
              code: "custom",
              message: "The call-to-action block must stay visible.",
              path: ["blocks"],
            });
          }
          if (!block.content?.trim()) {
            ctx.addIssue({
              code: "custom",
              message: "Enter a button label.",
              path: ["blocks"],
            });
          }
        }
      });
      for (const [type, count] of singletonCounts) {
        if (count > 1) {
          ctx.addIssue({
            code: "custom",
            message: `Only one ${type} block is allowed.`,
            path: ["blocks"],
          });
        }
      }
      if (requireCta && ctaCount === 0) {
        ctx.addIssue({
          code: "custom",
          message: "The template needs exactly one call-to-action block.",
          path: ["blocks"],
        });
      }
      if (ctaCount > 1) {
        ctx.addIssue({
          code: "custom",
          message: "Only one call-to-action block is allowed.",
          path: ["blocks"],
        });
      }
    });
}

export const businessEmailTemplateSettingsSchema =
  makeEmailTemplateSettingsSchema({
    forbiddenTypes: ["payment-terms"],
    requireCta: true,
    allowCta: true,
  });

export const businessInvoiceEmailTemplateSettingsSchema =
  makeEmailTemplateSettingsSchema({
    forbiddenTypes: [],
    requireCta: false,
    allowCta: true,
  });

export const businessQuoteFollowUpTemplateSettingsSchema =
  makeEmailTemplateSettingsSchema({
    forbiddenTypes: ["summary", "line-items", "totals", "notes", "payment-terms"],
    requireCta: true,
    allowCta: true,
  });

export const emailTemplateKindSchema = z.enum(["quote", "invoice", "follow-up"]);

export function getEmailTemplateSettingsSchemaForKind(
  kind: "quote" | "invoice" | "follow-up",
) {
  if (kind === "invoice") return businessInvoiceEmailTemplateSettingsSchema;
  if (kind === "follow-up") return businessQuoteFollowUpTemplateSettingsSchema;
  return businessEmailTemplateSettingsSchema;
}

export type BusinessEmailTemplateSettingsInput = z.infer<
  typeof businessEmailTemplateSettingsSchema
>;

export const businessAiAgentSettingsSchema = z.object({
  aiAgentEnabled: formBoolean().default(false),
  tone: z.enum(["friendly", "professional", "casual"]).default("friendly"),
  aiAgentInstructions: optionalText(businessInstructionsMaxLength),
});

export type BusinessAiAgentSettingsInput = z.infer<
  typeof businessAiAgentSettingsSchema
>;

export const businessDeleteSchema = z.object({
  confirmation: z
    .string()
    .trim()
    .min(1, "Type the confirmation text.")
    .max(120, "Use 120 characters or fewer."),
});

export type BusinessDeleteInput = z.infer<typeof businessDeleteSchema>;

export const businessInquiryPageSettingsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a service name.")
    .max(80, "Use 80 characters or fewer."),
  slug: z
    .string()
    .trim()
    .min(2, "Use at least 2 characters.")
    .max(publicSlugMaxLength, `Use ${publicSlugMaxLength} characters or fewer.`)
    .transform(normalizePublicSlugInput)
    .refine(
      (value) => publicSlugRegex.test(value),
      "Use lowercase letters, numbers, and hyphens only.",
    )
    .refine(
      (value) =>
        !value.startsWith("-") &&
        !value.endsWith("-") &&
        !/^-+$/.test(value),
      "Start and end with a letter or number.",
    ),
  businessType: z.enum(businessTypes),
  publicInquiryEnabled: formBoolean(),
  template: inquiryPageTemplateSchema,
  mobileLayout: inquiryPageMobileLayoutSchema,
  showSupportingCards: formBoolean(),
  showShowcaseImage: formBoolean(),
  showBusinessContact: formBoolean(),
  eyebrow: optionalText(48),
  headline: z
    .string()
    .trim()
    .min(1, "Enter a headline.")
    .max(120, "Use 120 characters or fewer."),
  description: optionalText(280),
  brandTagline: optionalText(120),
  formTitle: z
    .string()
    .trim()
    .min(1, "Enter a form title.")
    .max(80, "Use 80 characters or fewer."),
  formDescription: optionalText(200),
  thankYouMessage: optionalText(280),
  businessContactPhone: optionalText(40),
  businessContactEmail: optionalEmail(),
  businessFacebookUrl: optionalExternalUrl(),
  businessInstagramUrl: optionalExternalUrl(),
  businessTwitterXUrl: optionalExternalUrl(),
  businessLinkedinUrl: optionalExternalUrl(),
  showcaseImageUrl: inquiryPageImageUrlSchema,
  showcaseImageFrame: z.enum(inquiryPageShowcaseImageFrames),
  showcaseImageSize: z.enum(inquiryPageShowcaseImageSizes),
  showcaseImageCropX: formNumber({
    invalidMessage: "Save the page again after cropping the image.",
    min: -4,
    max: 4,
  }),
  showcaseImageCropY: formNumber({
    invalidMessage: "Save the page again after cropping the image.",
    min: -4,
    max: 4,
  }),
  showcaseImageCropZoom: formNumber({
    invalidMessage: "Save the page again after cropping the image.",
    min: 1,
    max: 4,
  }),
  cards: jsonField(
    z
      .array(inquiryPageCardSchema)
      .max(
        maxInquiryPageCards,
        `Use ${maxInquiryPageCards} supporting cards or fewer.`,
      ),
    [],
  ),
});

export type BusinessInquiryPageSettingsInput = z.infer<
  typeof businessInquiryPageSettingsSchema
>;

export const businessInquiryFormSettingsSchema = z.object({
  businessType: z.enum(businessTypes),
  inquiryFormConfig: jsonField(inquiryFormConfigSchema, Symbol.for("invalid-json-field")),
});

export type BusinessInquiryFormSettingsInput = z.infer<
  typeof businessInquiryFormSettingsSchema
>;

export const businessInquiryFormPresetSchema = z.object({
  businessType: z.enum(businessTypes),
});

export type BusinessInquiryFormPresetInput = z.infer<
  typeof businessInquiryFormPresetSchema
>;

export const businessInquiryFormCreateSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a service name.")
    .max(80, "Use 80 characters or fewer."),
});

export type BusinessInquiryFormCreateInput = z.infer<
  typeof businessInquiryFormCreateSchema
>;

export const businessInquiryFormTargetSchema = z.object({
  targetFormId: z
    .string()
    .trim()
    .min(1, "Target form id is required.")
    .max(128, "Target form id is too long."),
});

export type BusinessInquiryFormTargetInput = z.infer<
  typeof businessInquiryFormTargetSchema
>;
