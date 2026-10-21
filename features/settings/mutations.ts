import "server-only";

import { and, asc, eq, isNull, ne } from "drizzle-orm";

import {
  normalizeBusinessType,
  type BusinessType,
} from "@/features/inquiries/business-types";
import { normalizeInquiryFormSlug } from "@/features/inquiries/inquiry-forms";
import {
  createInquiryFormConfigDefaults,
  getNormalizedInquiryFormConfig,
} from "@/features/inquiries/form-config";
import {
  createInquiryPageBusinessContact,
  createInquiryPageConfigDefaults,
  getNormalizedInquiryPageConfig,
} from "@/features/inquiries/page-config";
import type {
  BusinessAiAgentSettingsInput,
  BusinessDeleteInput,
  BusinessEmailTemplateSettingsInput,
  BusinessGeneralSettingsInput,
  BusinessInquiryFormCreateInput,
  BusinessInquiryFormPresetInput,
  BusinessInquiryFormSettingsInput,
  BusinessInquiryPageSettingsInput,
  BusinessNotificationSettingsInput,
  BusinessQuoteSettingsInput,
} from "@/features/settings/schemas";
import { resolveSafeContentType } from "@/lib/files";
import {
  sanitizeBusinessLogoFileName,
  businessLogoBucket,
  businessLogoExtensionToMimeType,
} from "@/features/settings/utils";
import {
  hasLiveServiceSlot,
  isUniqueViolation,
  lockServiceLimitEnforcement,
  resolveServicePlan,
} from "@/features/settings/service-limits";
import { resolveInquiryFormConfigForPlan } from "@/features/inquiries/plan-rules";
import { db } from "@/lib/db/client";
import {
  activityLogs,
  analyticsEvents,
  inquiries,
  businessInquiryForms,
  businesses,
} from "@/lib/db/schema";
import { appendRandomSlugSuffix } from "@/lib/slugs";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { newEntityId, prefixedId } from "@/lib/ids";

type UpdateBusinessGeneralSettingsInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessGeneralSettingsInput;
};

type UpdateBusinessQuoteSettingsInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessQuoteSettingsInput;
};

type UpdateBusinessNotificationSettingsInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessNotificationSettingsInput;
};

type UpdateBusinessAiAgentSettingsInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessAiAgentSettingsInput;
};

type UpdateBusinessEmailTemplateSettingsInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessEmailTemplateSettingsInput;
  templateKind?: "quote" | "invoice" | "follow-up";
};

type DeleteBusinessInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessDeleteInput;
};

type UpdateBusinessInquiryPageInput = {
  businessId: string;
  actorUserId: string;
  /** The service slug the action was bound to — the lookup key. */
  formSlug: string;
  values: BusinessInquiryPageSettingsInput;
};

type UpdateBusinessInquiryFormInput = {
  businessId: string;
  actorUserId: string;
  /** The service slug the action was bound to — the lookup key. */
  formSlug: string;
  values: BusinessInquiryFormSettingsInput;
};

type ApplyBusinessInquiryFormPresetInput = {
  businessId: string;
  actorUserId: string;
  /** The service slug the action was bound to — the lookup key. */
  formSlug: string;
  values: BusinessInquiryFormPresetInput;
};

type CreateBusinessInquiryFormInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessInquiryFormCreateInput & {
    /** Starter template the new service inherits from its business. */
    businessType: BusinessType;
  };
};

type TargetBusinessInquiryFormInput = {
  businessId: string;
  actorUserId: string;
  targetFormId: string;
};
type SetBusinessInquiryFormPublicStateInput = TargetBusinessInquiryFormInput & {
  publicInquiryEnabled: boolean;
};

type UpdateBusinessSettingsResult =
  | { ok: true; previousSlug: string; nextSlug: string }
  | { ok: false; reason: "not-found" | "slug-taken" };

type DeleteBusinessResult =
  | { ok: true; businessSlug: string }
  | { ok: false; reason: "not-found" | "confirmation-mismatch" };

type UpdateBusinessInquiryFormSettingsResult =
  | {
      ok: true;
      previousSlug: string;
      nextSlug: string;
      previousFormSlug: string;
      nextFormSlug: string;
    }
  | { ok: false; reason: "not-found" | "slug-taken" };

type UpdateBusinessInquiryPageSettingsResult =
  | {
      ok: true;
      previousSlug: string;
      nextSlug: string;
      previousFormSlug: string;
      nextFormSlug: string;
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "slug-taken"
        | "live-form-limit"
        | "invalid-target";
    };

type BusinessInquiryFormMutationResult =
  | { ok: true; businessSlug: string; formSlug: string }
  | {
      ok: false;
      reason:
        | "not-found"
        | "invalid-target"
        | "last-active"
        | "has-inquiries"
        | "has-analytics"
        | "live-form-limit";
    };

/**
 * Picks a slug that is free within the business. The lookup is a best-effort
 * reservation only — the `(business_id, slug)` unique index is the real
 * guarantee, so callers must retry with a fresh candidate on a unique
 * violation.
 */
async function getAvailableBusinessInquiryFormSlug({
  businessId,
  baseSlug,
  excludeFormId,
}: {
  businessId: string;
  baseSlug: string;
  excludeFormId?: string;
}) {
  const normalizedBaseSlug = normalizeInquiryFormSlug(baseSlug);
  let candidate = normalizedBaseSlug;

  while (true) {
    const conditions = [
      eq(businessInquiryForms.businessId, businessId),
      eq(businessInquiryForms.slug, candidate),
    ];

    if (excludeFormId) {
      conditions.push(ne(businessInquiryForms.id, excludeFormId));
    }

    const [existingForm] = await db
      .select({ id: businessInquiryForms.id })
      .from(businessInquiryForms)
      .where(and(...conditions))
      .limit(1);

    if (!existingForm) {
      return candidate;
    }

    candidate = appendRandomSlugSuffix(normalizedBaseSlug, {
      fallback: "inquiry",
    });
  }
}

function createDuplicateInquiryFormName(name: string) {
  const nextName = `${name} copy`.trim();

  return nextName.slice(0, 80).trim() || name;
}

function createInquiryFormSeedValues({
  businessType,
  name,
  businessName,
  businessShortDescription,
}: {
  businessType: BusinessType;
  name: string;
  businessName: string;
  businessShortDescription?: string | null;
}) {
  const inquiryFormConfig = createInquiryFormConfigDefaults({
    businessType,
  });
  const inquiryPageConfig = createInquiryPageConfigDefaults({
    businessName,
    businessShortDescription,
    businessType,
  });

  return {
    name,
    businessType,
    publicInquiryEnabled: true,
    inquiryFormConfig,
    inquiryPageConfig: {
      ...inquiryPageConfig,
      formTitle: name,
    },
  };
}

export async function updateBusinessSettings({
  businessId,
  actorUserId,
  values,
}: UpdateBusinessGeneralSettingsInput): Promise<UpdateBusinessSettingsResult> {
  const [currentBusiness] = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
      shortDescription: businesses.shortDescription,
      website: businesses.website,
      logoStoragePath: businesses.logoStoragePath,
      logoContentType: businesses.logoContentType,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!currentBusiness) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const [conflictingBusiness] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .where(and(eq(businesses.slug, values.slug), ne(businesses.id, businessId)))
    .limit(1);

  if (conflictingBusiness) {
    return {
      ok: false,
      reason: "slug-taken",
    };
  }

  const now = new Date();
  const logoFile = values.logo;
  const storageClient = logoFile ? createSupabaseAdminClient() : null;
  const previousLogoStoragePath = currentBusiness.logoStoragePath;
  const nextLogoContentType = logoFile
    ? resolveSafeContentType(logoFile, {
        extensionToMimeType: businessLogoExtensionToMimeType,
        fallback: "application/octet-stream",
      })
    : null;
  const nextLogoStoragePath =
    logoFile && storageClient
      ? `${businessId}/logo/${prefixedId("asset")}-${sanitizeBusinessLogoFileName(
          logoFile.name,
        )}`
      : null;

  if (nextLogoStoragePath && storageClient && logoFile) {
    const { error } = await storageClient.storage
      .from(businessLogoBucket)
      .upload(nextLogoStoragePath, logoFile, {
        contentType: nextLogoContentType ?? "application/octet-stream",
        upsert: false,
      });

    if (error) {
      throw new Error(`Failed to upload business logo: ${error.message}`);
    }
  }

  try {
    await db.transaction(async (tx) => {
      const previousShortDescription = currentBusiness.shortDescription?.trim() || undefined;
      const nextShortDescription = values.shortDescription?.trim() || undefined;

      await tx
        .update(businesses)
        .set({
          name: values.name,
          slug: values.slug,
          countryCode: values.countryCode ?? null,
          shortDescription: values.shortDescription ?? null,
          contactEmail: values.contactEmail ?? null,
          website: values.website ?? null,
          logoStoragePath: values.removeLogo
            ? nextLogoStoragePath
            : nextLogoStoragePath ?? previousLogoStoragePath ?? null,
          logoContentType: values.removeLogo
            ? nextLogoContentType
            : nextLogoContentType ?? currentBusiness.logoContentType ?? null,
          defaultCurrency: values.defaultCurrency,
          defaultEmailSignature: values.defaultEmailSignature ?? null,
          updatedAt: now,
        })
        .where(eq(businesses.id, businessId));

      const inquiryForms = await tx
        .select({
          id: businessInquiryForms.id,
          inquiryPageConfig: businessInquiryForms.inquiryPageConfig,
        })
        .from(businessInquiryForms)
        .where(
          and(
            eq(businessInquiryForms.businessId, businessId),
            isNull(businessInquiryForms.archivedAt),
          ),
        );

      for (const form of inquiryForms) {
        const currentBrandTagline =
          form.inquiryPageConfig?.brandTagline?.trim() || undefined;
        const shouldSyncBrandTagline =
          currentBrandTagline === previousShortDescription ||
          currentBrandTagline === undefined;

        if (!shouldSyncBrandTagline || currentBrandTagline === nextShortDescription) {
          continue;
        }

        await tx
          .update(businessInquiryForms)
          .set({
            inquiryPageConfig: {
              ...form.inquiryPageConfig,
              brandTagline: nextShortDescription,
            },
            updatedAt: now,
          })
          .where(eq(businessInquiryForms.id, form.id));
      }

      await tx.insert(activityLogs).values({
        id: newEntityId(),
        businessId,
        actorUserId,
        type: "business.settings_updated",
        summary: "Business settings updated.",
        metadata: {
          slug: values.slug,
          countryCode: values.countryCode ?? null,
          defaultCurrency: values.defaultCurrency,
          hasLogo: Boolean(logoFile || previousLogoStoragePath) && !values.removeLogo,
        },
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (nextLogoStoragePath && storageClient) {
      const { error: cleanupError } = await storageClient.storage
        .from(businessLogoBucket)
        .remove([nextLogoStoragePath]);

      if (cleanupError) {
        console.error(
          "Failed to clean up uploaded business logo after a database error.",
          cleanupError,
        );
      }
    }

    throw error;
  }

  const shouldRemovePreviousLogo =
    previousLogoStoragePath &&
    ((Boolean(nextLogoStoragePath) && nextLogoStoragePath !== previousLogoStoragePath) ||
      (values.removeLogo && !nextLogoStoragePath));

  if (shouldRemovePreviousLogo) {
    const storageClient = createSupabaseAdminClient();
    const { error } = await storageClient.storage
      .from(businessLogoBucket)
      .remove([previousLogoStoragePath]);

    if (error) {
      console.error("Failed to clean up the previous business logo.", error);
    }
  }

  return {
    ok: true,
    previousSlug: currentBusiness.slug,
    nextSlug: values.slug,
  };
}

export async function updateBusinessQuoteSettings({
  businessId,
  actorUserId,
  values,
}: UpdateBusinessQuoteSettingsInput): Promise<UpdateBusinessSettingsResult> {
  const [business] = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        defaultQuoteNotes: values.defaultQuoteNotes ?? null,
        defaultQuoteTerms: values.defaultQuoteTerms ?? null,
        defaultQuoteValidityDays: values.defaultQuoteValidityDays,
        sendInquiryAckEmail: values.sendInquiryAckEmail,
        autoDraftQuoteOnQualify: values.autoDraftQuoteOnQualify,
        autoArchiveStaleInquiries: values.autoArchiveStaleInquiries,
        autoArchiveStaleInquiryDays: values.autoArchiveStaleInquiryDays,
        autoFollowUpOnQuoteViewed: values.autoFollowUpOnQuoteViewed,
        quoteViewedFollowUpDelayDays: values.quoteViewedFollowUpDelayDays,
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.quote_settings_updated",
      summary: "Quote settings updated.",
      metadata: {
        defaultQuoteValidityDays: values.defaultQuoteValidityDays,
        hasDefaultQuoteNotes: Boolean(values.defaultQuoteNotes?.trim()),
        hasDefaultQuoteTerms: Boolean(values.defaultQuoteTerms?.trim()),
        sendInquiryAckEmail: values.sendInquiryAckEmail,
        autoDraftQuoteOnQualify: values.autoDraftQuoteOnQualify,
        autoArchiveStaleInquiries: values.autoArchiveStaleInquiries,
        autoArchiveStaleInquiryDays: values.autoArchiveStaleInquiryDays,
        autoFollowUpOnQuoteViewed: values.autoFollowUpOnQuoteViewed,
        quoteViewedFollowUpDelayDays: values.quoteViewedFollowUpDelayDays,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    previousSlug: business.slug,
    nextSlug: business.slug,
  };
}

export async function updateBusinessEmailTemplateSettings({
  businessId,
  actorUserId,
  values,
  templateKind = "quote",
}: UpdateBusinessEmailTemplateSettingsInput): Promise<UpdateBusinessSettingsResult> {
  const [business] = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const emailTemplates = await import("@/features/settings/email-templates");

  const normalized =
    templateKind === "invoice"
      ? emailTemplates.normalizeInvoiceEmailTemplate({
          version: 2,
          subject: values.subject,
          blocks: values.blocks,
        })
      : templateKind === "follow-up"
        ? emailTemplates.normalizeQuoteFollowUpTemplate({
            version: 2,
            subject: values.subject,
            blocks: values.blocks,
          })
        : emailTemplates.normalizeQuoteEmailTemplate({
            version: 2,
            subject: values.subject,
            blocks: values.blocks,
          });
  const defaults =
    templateKind === "invoice"
      ? emailTemplates.defaultInvoiceEmailTemplate()
      : templateKind === "follow-up"
        ? emailTemplates.defaultQuoteFollowUpTemplate()
        : emailTemplates.defaultQuoteEmailTemplate();
  const hasAnyOverride =
    JSON.stringify(normalized) !== JSON.stringify(defaults);

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        ...(templateKind === "invoice"
          ? { invoiceEmailTemplate: hasAnyOverride ? normalized : null }
          : templateKind === "follow-up"
            ? { quoteFollowUpTemplate: hasAnyOverride ? normalized : null }
            : { quoteEmailTemplate: hasAnyOverride ? normalized : null }),
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.email_template_updated",
      summary: "Email template settings updated.",
      metadata: {
        templateKind,
        hasCustomTemplate: Boolean(hasAnyOverride),
        blockCount: normalized.blocks.length,
        hiddenBlockCount: normalized.blocks.filter(
          (block) => block.visible === false,
        ).length,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    previousSlug: business.slug,
    nextSlug: business.slug,
  };
}

export async function updateBusinessNotificationSettings({
  businessId,
  actorUserId,
  values,
}: UpdateBusinessNotificationSettingsInput): Promise<UpdateBusinessSettingsResult> {
  const [business] = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        notifyInAppOnNewInquiry: values.notifyInAppOnNewInquiry,
        notifyInAppOnQuoteSent: values.notifyInAppOnQuoteSent,
        notifyInAppOnQuoteResponse: values.notifyInAppOnQuoteResponse,
        notifyInAppOnMemberInviteResponse: values.notifyInAppOnMemberInviteResponse,
        notifyPushOnNewInquiry: values.notifyPushOnNewInquiry,
        notifyPushOnQuoteSent: values.notifyPushOnQuoteSent,
        notifyPushOnQuoteResponse: values.notifyPushOnQuoteResponse,
        notifyPushOnMemberInviteResponse: values.notifyPushOnMemberInviteResponse,
        notifyInAppOnFollowUpReminder: values.notifyInAppOnFollowUpReminder,
        notifyInAppOnQuoteExpiring: values.notifyInAppOnQuoteExpiring,
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.notification_settings_updated",
      summary: "Notification settings updated.",
      metadata: {
        notifyInAppOnNewInquiry: values.notifyInAppOnNewInquiry,
        notifyInAppOnQuoteSent: values.notifyInAppOnQuoteSent,
        notifyInAppOnQuoteResponse: values.notifyInAppOnQuoteResponse,
        notifyInAppOnMemberInviteResponse: values.notifyInAppOnMemberInviteResponse,
        notifyPushOnNewInquiry: values.notifyPushOnNewInquiry,
        notifyPushOnQuoteSent: values.notifyPushOnQuoteSent,
        notifyPushOnQuoteResponse: values.notifyPushOnQuoteResponse,
        notifyPushOnMemberInviteResponse: values.notifyPushOnMemberInviteResponse,
        notifyInAppOnFollowUpReminder: values.notifyInAppOnFollowUpReminder,
        notifyInAppOnQuoteExpiring: values.notifyInAppOnQuoteExpiring,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    previousSlug: business.slug,
    nextSlug: business.slug,
  };
}

export async function updateBusinessAiAgentSettings({
  businessId,
  actorUserId,
  values,
}: UpdateBusinessAiAgentSettingsInput): Promise<UpdateBusinessSettingsResult> {
  const [business] = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businesses)
      .set({
        aiAgentEnabled: values.aiAgentEnabled,
        aiAgentConfig: {
          tone: values.tone,
          // Omit rather than store an empty string: the prompt builders treat
          // an absent value as "no instructions" and skip the block entirely.
          ...(values.aiAgentInstructions
            ? { instructions: values.aiAgentInstructions }
            : {}),
        },
        updatedAt: now,
      })
      .where(eq(businesses.id, businessId));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.ai_agent_settings_updated",
      summary: "AI agent settings updated.",
      metadata: {
        aiAgentEnabled: values.aiAgentEnabled,
        tone: values.tone,
        hasInstructions: Boolean(values.aiAgentInstructions),
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    previousSlug: business.slug,
    nextSlug: business.slug,
  };
}

export async function deleteBusiness({
  businessId,
  actorUserId,
  values,
}: DeleteBusinessInput): Promise<DeleteBusinessResult> {
  void businessId;
  void actorUserId;
  void values;

  throw new Error(
    "Hard business deletion is no longer supported. Use the business lifecycle actions instead.",
  );
}

export async function updateBusinessInquiryPageSettings({
  businessId,
  actorUserId,
  formSlug,
  values,
}: UpdateBusinessInquiryPageInput): Promise<UpdateBusinessInquiryPageSettingsResult> {
  const [currentBusiness, currentForm] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
        name: businesses.name,
        shortDescription: businesses.shortDescription,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        isDefault: businessInquiryForms.isDefault,
        publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
        inquiryFormConfig: businessInquiryForms.inquiryFormConfig,
        inquiryPageConfig: businessInquiryForms.inquiryPageConfig,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.slug, formSlug),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .limit(1),
  ]);

  const business = currentBusiness[0];
  const form = currentForm[0];

  if (!business || !form) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  // The business default backs the shared `/inquire/<business>` URL. It has to
  // stay published, otherwise the business loses its public inquiry page.
  if (!values.publicInquiryEnabled && form.isDefault) {
    return {
      ok: false,
      reason: "invalid-target",
    };
  }

  if (values.slug !== form.slug) {
    const [conflictingForm] = await db
      .select({ id: businessInquiryForms.id })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.slug, values.slug),
          ne(businessInquiryForms.id, form.id),
        ),
      )
      .limit(1);

    if (conflictingForm) {
      return {
        ok: false,
        reason: "slug-taken",
      };
    }
  }

  const now = new Date();
  const inquiryFormConfig = getNormalizedInquiryFormConfig(form.inquiryFormConfig, {
    businessType: values.businessType,
  });
  const businessContact = createInquiryPageBusinessContact({
    phone: values.businessContactPhone,
    email: values.businessContactEmail,
    socialLinks: {
      facebook: values.businessFacebookUrl,
      instagram: values.businessInstagramUrl,
      twitterX: values.businessTwitterXUrl,
      linkedin: values.businessLinkedinUrl,
    },
  });
  const inquiryPageConfig = getNormalizedInquiryPageConfig(
    {
      ...form.inquiryPageConfig,
      template: values.template,
      mobileLayout: values.mobileLayout,
      showSupportingCards: values.showSupportingCards,
      showShowcaseImage: values.showShowcaseImage,
      showBusinessContact: values.showBusinessContact,
      eyebrow: values.eyebrow,
      headline: values.headline,
      description: values.description,
      brandTagline: values.brandTagline,
      formTitle: values.formTitle,
      formDescription: values.formDescription,
      businessContact,
      showcaseImage: values.showcaseImageUrl
        ? {
            url: values.showcaseImageUrl,
            frame: values.showcaseImageFrame,
            size: values.showcaseImageSize,
            crop: {
              x: values.showcaseImageCropX,
              y: values.showcaseImageCropY,
              zoom: values.showcaseImageCropZoom,
            },
          }
        : undefined,
      cards: values.cards,
      thankYouMessage: values.thankYouMessage,
    },
    {
      businessName: business.name,
      businessShortDescription: business.shortDescription,
      businessType: values.businessType,
    },
  );

  const plan = await resolveServicePlan(businessId);
  let limitExceeded = false;

  try {
    await db.transaction(async (tx) => {
      await lockServiceLimitEnforcement(tx, businessId);

      if (
        values.publicInquiryEnabled &&
        !form.publicInquiryEnabled &&
        !(await hasLiveServiceSlot(tx, businessId, plan, form.id))
      ) {
        limitExceeded = true;
        return;
      }

      await tx
        .update(businessInquiryForms)
        .set({
          name: values.name,
          slug: values.slug,
          businessType: values.businessType,
          publicInquiryEnabled: values.publicInquiryEnabled,
          inquiryFormConfig,
          inquiryPageConfig,
          updatedAt: now,
        })
        .where(
          and(
            eq(businessInquiryForms.businessId, businessId),
            eq(businessInquiryForms.id, form.id),
          ),
        );

      await tx.insert(activityLogs).values({
        id: newEntityId(),
        businessId,
        actorUserId,
        type: "business.inquiry_form_page_updated",
        summary: `Inquiry page updated for ${values.slug}.`,
        metadata: {
          inquiryFormId: form.id,
          inquiryFormSlug: values.slug,
          previousInquiryFormSlug: form.slug,
          businessType: values.businessType,
          publicInquiryEnabled: values.publicInquiryEnabled,
          template: values.template,
          showSupportingCards: values.showSupportingCards,
          showShowcaseImage: values.showShowcaseImage,
          showBusinessContact: values.showBusinessContact,
          cardCount: values.cards.length,
          hasBusinessContact: Boolean(businessContact),
          hasShowcaseImage: Boolean(values.showcaseImageUrl),
        },
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    // A concurrent rename can claim the slug between the pre-check and the
    // write; the unique index is the real arbiter.
    if (isUniqueViolation(error)) {
      return {
        ok: false,
        reason: "slug-taken",
      };
    }

    throw error;
  }

  if (limitExceeded) {
    return {
      ok: false,
      reason: "live-form-limit",
    };
  }

  return {
    ok: true,
    previousSlug: business.slug,
    nextSlug: business.slug,
    previousFormSlug: form.slug,
    nextFormSlug: values.slug,
  };
}

export async function updateBusinessInquiryFormSettings({
  businessId,
  actorUserId,
  formSlug,
  values,
}: UpdateBusinessInquiryFormInput): Promise<UpdateBusinessInquiryFormSettingsResult> {
  const [currentBusiness, currentForm] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        businessType: businessInquiryForms.businessType,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.slug, formSlug),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .limit(1),
  ]);

  const business = currentBusiness[0];
  const form = currentForm[0];

  if (!business || !form) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const now = new Date();
  const plan = await resolveServicePlan(businessId);
  const normalizedInquiryFormConfig = getNormalizedInquiryFormConfig(
    values.inquiryFormConfig,
    {
      businessType: normalizeBusinessType(form.businessType),
    },
  );
  // Apply the plan's custom-field allowance at write time so a crafted
  // request cannot persist fields the plan does not include. The render path
  // applies the same rule, so stored and rendered state stay in sync.
  const inquiryFormConfig = resolveInquiryFormConfigForPlan(
    normalizedInquiryFormConfig,
    plan,
  );
  const droppedCustomFieldCount =
    normalizedInquiryFormConfig.projectFields.length -
    inquiryFormConfig.projectFields.length;

  await db.transaction(async (tx) => {
    await tx
      .update(businessInquiryForms)
      .set({
        inquiryFormConfig,
        updatedAt: now,
      })
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, form.id),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_updated",
      summary: `Inquiry form updated for ${form.slug}.`,
      metadata: {
        inquiryFormId: form.id,
        inquiryFormSlug: form.slug,
        businessType: normalizeBusinessType(form.businessType),
        projectFieldCount: inquiryFormConfig.projectFields.length,
        droppedCustomFieldCount,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    previousSlug: business.slug,
    nextSlug: business.slug,
    previousFormSlug: form.slug,
    nextFormSlug: form.slug,
  };
}

export async function applyBusinessInquiryFormPreset({
  businessId,
  actorUserId,
  formSlug,
  values,
}: ApplyBusinessInquiryFormPresetInput): Promise<UpdateBusinessSettingsResult> {
  const [currentBusiness, currentForm] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
        name: businesses.name,
        shortDescription: businesses.shortDescription,
        inquiryHeadline: businesses.inquiryHeadline,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        name: businessInquiryForms.name,
        publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.slug, formSlug),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .limit(1),
  ]);

  const business = currentBusiness[0];
  const form = currentForm[0];

  if (!business || !form) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businessInquiryForms)
      .set({
        businessType: values.businessType,
        inquiryFormConfig: createInquiryFormConfigDefaults({
          businessType: values.businessType,
        }),
        inquiryPageConfig: {
          ...createInquiryPageConfigDefaults({
            businessName: business.name,
            businessShortDescription: business.shortDescription,
            legacyInquiryHeadline: business.inquiryHeadline,
            businessType: values.businessType,
          }),
          formTitle: form.name,
        },
        publicInquiryEnabled: form.publicInquiryEnabled,
        updatedAt: now,
      })
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, form.id),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_preset_applied",
      summary: `Inquiry preset applied to ${form.slug}.`,
      metadata: {
        inquiryFormId: form.id,
        inquiryFormSlug: form.slug,
        businessType: values.businessType,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    previousSlug: business.slug,
    nextSlug: business.slug,
  };
}

export async function createBusinessInquiryForm({
  businessId,
  actorUserId,
  values,
}: CreateBusinessInquiryFormInput): Promise<BusinessInquiryFormMutationResult> {
  const [business] = await db
    .select({
      id: businesses.id,
      slug: businesses.slug,
      name: businesses.name,
      shortDescription: businesses.shortDescription,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const now = new Date();
  const formId = newEntityId();
  const formSeed = createInquiryFormSeedValues({
    businessType: values.businessType,
    name: values.name,
    businessName: business.name,
    businessShortDescription: business.shortDescription,
  });
  const plan = await resolveServicePlan(businessId);
  let limitExceeded = false;
  let formSlug = "";

  // The slug lookup is a best-effort reservation; the unique index is the
  // arbiter, so a lost race retries with a fresh candidate.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateSlug = await getAvailableBusinessInquiryFormSlug({
      businessId,
      baseSlug: values.name,
    });

    try {
      await db.transaction(async (tx) => {
        await lockServiceLimitEnforcement(tx, businessId);

        if (!(await hasLiveServiceSlot(tx, businessId, plan))) {
          limitExceeded = true;
          return;
        }

        await tx.insert(businessInquiryForms).values({
          id: formId,
          businessId,
          name: formSeed.name,
          slug: candidateSlug,
          businessType: formSeed.businessType,
          isDefault: false,
          publicInquiryEnabled: formSeed.publicInquiryEnabled,
          inquiryFormConfig: formSeed.inquiryFormConfig,
          inquiryPageConfig: formSeed.inquiryPageConfig,
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(activityLogs).values({
          id: newEntityId(),
          businessId,
          actorUserId,
          type: "business.inquiry_form_created",
          summary: `Inquiry form created: ${formSeed.name}.`,
          metadata: {
            inquiryFormId: formId,
            inquiryFormSlug: candidateSlug,
            businessType: formSeed.businessType,
          },
          createdAt: now,
          updatedAt: now,
        });
      });

      formSlug = candidateSlug;
      break;
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue;
      }

      throw error;
    }
  }

  if (limitExceeded) {
    return {
      ok: false,
      reason: "live-form-limit",
    };
  }

  if (!formSlug) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  return {
    ok: true,
    businessSlug: business.slug,
    formSlug,
  };
}

export async function duplicateBusinessInquiryForm({
  businessId,
  actorUserId,
  targetFormId,
}: TargetBusinessInquiryFormInput): Promise<BusinessInquiryFormMutationResult> {
  const [businessRows, sourceFormRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
        plan: businesses.plan,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        name: businessInquiryForms.name,
        businessType: businessInquiryForms.businessType,
        publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
        inquiryFormConfig: businessInquiryForms.inquiryFormConfig,
        inquiryPageConfig: businessInquiryForms.inquiryPageConfig,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .limit(1),
  ]);

  const business = businessRows[0];
  const sourceForm = sourceFormRows[0];

  if (!business || !sourceForm) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const now = new Date();
  const nextName = createDuplicateInquiryFormName(sourceForm.name);
  const formId = newEntityId();
  const sourceFormBusinessType = normalizeBusinessType(sourceForm.businessType);
  const sourceInquiryFormConfig = getNormalizedInquiryFormConfig(
    sourceForm.inquiryFormConfig,
    {
      businessType: sourceFormBusinessType,
    },
  );
  const plan = await resolveServicePlan(businessId);
  let limitExceeded = false;
  let formSlug = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateSlug = await getAvailableBusinessInquiryFormSlug({
      businessId,
      baseSlug: nextName,
    });

    try {
      await db.transaction(async (tx) => {
        await lockServiceLimitEnforcement(tx, businessId);

        if (
          sourceForm.publicInquiryEnabled &&
          !(await hasLiveServiceSlot(tx, businessId, plan))
        ) {
          limitExceeded = true;
          return;
        }

        await tx.insert(businessInquiryForms).values({
          id: formId,
          businessId,
          name: nextName,
          slug: candidateSlug,
          businessType: sourceFormBusinessType,
          isDefault: false,
          publicInquiryEnabled: sourceForm.publicInquiryEnabled,
          inquiryFormConfig: sourceInquiryFormConfig,
          inquiryPageConfig: {
            ...sourceForm.inquiryPageConfig,
            formTitle: nextName,
          },
          createdAt: now,
          updatedAt: now,
        });

        await tx.insert(activityLogs).values({
          id: newEntityId(),
          businessId,
          actorUserId,
          type: "business.inquiry_form_duplicated",
          summary: `Inquiry form duplicated: ${nextName}.`,
          metadata: {
            inquiryFormId: formId,
            inquiryFormSlug: candidateSlug,
            sourceInquiryFormId: targetFormId,
          },
          createdAt: now,
          updatedAt: now,
        });
      });

      formSlug = candidateSlug;
      break;
    } catch (error) {
      if (isUniqueViolation(error)) {
        continue;
      }

      throw error;
    }
  }

  if (limitExceeded) {
    return {
      ok: false,
      reason: "live-form-limit",
    };
  }

  if (!formSlug) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  return {
    ok: true,
    businessSlug: business.slug,
    formSlug,
  };
}

export async function setDefaultBusinessInquiryForm({
  businessId,
  actorUserId,
  targetFormId,
}: TargetBusinessInquiryFormInput): Promise<BusinessInquiryFormMutationResult> {
  const [businessRows, targetFormRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .limit(1),
  ]);

  const business = businessRows[0];
  const targetForm = targetFormRows[0];

  if (!business || !targetForm) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  // The default service backs the shared `/inquire/<business>` URL, so it has
  // to be published.
  if (!targetForm.publicInquiryEnabled) {
    return {
      ok: false,
      reason: "invalid-target",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businessInquiryForms)
      .set({
        isDefault: false,
        updatedAt: now,
      })
      .where(eq(businessInquiryForms.businessId, businessId));

    await tx
      .update(businessInquiryForms)
      .set({
        isDefault: true,
        updatedAt: now,
      })
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_default_changed",
      summary: `Default inquiry form set to ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetFormId,
        inquiryFormSlug: targetForm.slug,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    formSlug: targetForm.slug,
  };
}

export async function archiveBusinessInquiryForm({
  businessId,
  actorUserId,
  targetFormId,
}: TargetBusinessInquiryFormInput): Promise<BusinessInquiryFormMutationResult> {
  const [businessRows, targetFormRows, activeForms] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        isDefault: businessInquiryForms.isDefault,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          isNull(businessInquiryForms.archivedAt),
        ),
      ),
  ]);

  const business = businessRows[0];
  const targetForm = targetFormRows[0];

  if (!business || !targetForm) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  if (targetForm.isDefault) {
    return {
      ok: false,
      reason: "invalid-target",
    };
  }

  if (activeForms.length <= 1) {
    return {
      ok: false,
      reason: "last-active",
    };
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(businessInquiryForms)
      .set({
        archivedAt: now,
        isDefault: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_archived",
      summary: `Inquiry form archived: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetFormId,
        inquiryFormSlug: targetForm.slug,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    formSlug: targetForm.slug,
  };
}

export async function deleteBusinessInquiryForm({
  businessId,
  actorUserId,
  targetFormId,
}: TargetBusinessInquiryFormInput): Promise<BusinessInquiryFormMutationResult> {
  const [businessRows, targetFormRows, activeFormRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        isDefault: businessInquiryForms.isDefault,
        archivedAt: businessInquiryForms.archivedAt,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
        ),
      )
      .limit(1),
    db
      .select({ id: businessInquiryForms.id })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          isNull(businessInquiryForms.archivedAt),
        ),
      ),
  ]);

  const business = businessRows[0];
  const targetForm = targetFormRows[0];

  if (!business || !targetForm) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  // The business always needs one active service — it backs the shared
  // `/inquire/<business>` URL and the "public inquiry" indicator.
  if (!targetForm.archivedAt && activeFormRows.length <= 1) {
    return {
      ok: false,
      reason: "last-active",
    };
  }

  // Block deletion when the form still has linked inquiries.
  const [linkedInquiry] = await db
    .select({ id: inquiries.id })
    .from(inquiries)
    .where(eq(inquiries.businessInquiryFormId, targetFormId))
    .limit(1);

  if (linkedInquiry) {
    return {
      ok: false,
      reason: "has-inquiries",
    };
  }

  // The analytics foreign key is `ON DELETE SET NULL`, so deleting a service
  // that collected page views would silently drop that history from the
  // per-service report. Archive it instead.
  const [linkedAnalyticsEvent] = await db
    .select({ id: analyticsEvents.id })
    .from(analyticsEvents)
    .where(eq(analyticsEvents.businessInquiryFormId, targetFormId))
    .limit(1);

  if (linkedAnalyticsEvent) {
    return {
      ok: false,
      reason: "has-analytics",
    };
  }

  const now = new Date();

  const deleted = await db.transaction(async (tx) => {
    // If deleting the default form, promote another published active form to
    // default so the shared public URL keeps resolving.
    if (targetForm.isDefault) {
      const [nextDefault] = await tx
        .select({ id: businessInquiryForms.id })
        .from(businessInquiryForms)
        .where(
          and(
            eq(businessInquiryForms.businessId, businessId),
            isNull(businessInquiryForms.archivedAt),
            eq(businessInquiryForms.publicInquiryEnabled, true),
            ne(businessInquiryForms.id, targetFormId),
          ),
        )
        .orderBy(asc(businessInquiryForms.name))
        .limit(1);

      if (!nextDefault) {
        return false;
      }

      // Clear the outgoing default first: the database enforces at most one
      // default per business, so the two updates cannot overlap.
      await tx
        .update(businessInquiryForms)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(businessInquiryForms.businessId, businessId),
            eq(businessInquiryForms.id, targetFormId),
          ),
        );

      await tx
        .update(businessInquiryForms)
        .set({ isDefault: true, updatedAt: now })
        .where(eq(businessInquiryForms.id, nextDefault.id));
    }

    await tx
      .delete(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_deleted",
      summary: `Inquiry form deleted: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetFormId,
        inquiryFormSlug: targetForm.slug,
      },
      createdAt: now,
      updatedAt: now,
    });
    return true;
  });

  if (!deleted) {
    return { ok: false, reason: "invalid-target" };
  }

  return {
    ok: true,
    businessSlug: business.slug,
    formSlug: targetForm.slug,
  };
}

export async function setBusinessInquiryFormPublicState({
  businessId,
  actorUserId,
  targetFormId,
  publicInquiryEnabled,
}: SetBusinessInquiryFormPublicStateInput): Promise<BusinessInquiryFormMutationResult> {
  const [businessRows, targetFormRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
        plan: businesses.plan,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        isDefault: businessInquiryForms.isDefault,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
          isNull(businessInquiryForms.archivedAt),
        ),
      )
      .limit(1),
  ]);

  const business = businessRows[0];
  const targetForm = targetFormRows[0];

  if (!business || !targetForm) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  if (!publicInquiryEnabled && targetForm.isDefault) {
    return {
      ok: false,
      reason: "invalid-target",
    };
  }

  const plan = await resolveServicePlan(businessId);
  const now = new Date();
  let limitExceeded = false;

  await db.transaction(async (tx) => {
    await lockServiceLimitEnforcement(tx, businessId);

    if (
      publicInquiryEnabled &&
      !(await hasLiveServiceSlot(tx, businessId, plan, targetFormId))
    ) {
      limitExceeded = true;
      return;
    }

    await tx
      .update(businessInquiryForms)
      .set({
        publicInquiryEnabled,
        updatedAt: now,
      })
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_page_updated",
      summary: publicInquiryEnabled
        ? `Inquiry form published: ${targetForm.slug}.`
        : `Inquiry form unpublished: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetFormId,
        inquiryFormSlug: targetForm.slug,
        publicInquiryEnabled,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  if (limitExceeded) {
    return {
      ok: false,
      reason: "live-form-limit",
    };
  }

  return {
    ok: true,
    businessSlug: business.slug,
    formSlug: targetForm.slug,
  };
}

export async function unarchiveBusinessInquiryForm({
  businessId,
  actorUserId,
  targetFormId,
}: TargetBusinessInquiryFormInput): Promise<BusinessInquiryFormMutationResult> {
  const [businessRows, targetFormRows] = await Promise.all([
    db
      .select({
        id: businesses.id,
        slug: businesses.slug,
        plan: businesses.plan,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: businessInquiryForms.id,
        slug: businessInquiryForms.slug,
        publicInquiryEnabled: businessInquiryForms.publicInquiryEnabled,
      })
      .from(businessInquiryForms)
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
        ),
      )
      .limit(1),
  ]);

  const business = businessRows[0];
  const targetForm = targetFormRows[0];

  if (!business || !targetForm) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  const plan = await resolveServicePlan(businessId);
  const now = new Date();
  let limitExceeded = false;

  await db.transaction(async (tx) => {
    await lockServiceLimitEnforcement(tx, businessId);

    if (
      targetForm.publicInquiryEnabled &&
      !(await hasLiveServiceSlot(tx, businessId, plan))
    ) {
      limitExceeded = true;
      return;
    }

    await tx
      .update(businessInquiryForms)
      .set({
        archivedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(businessInquiryForms.businessId, businessId),
          eq(businessInquiryForms.id, targetFormId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_updated",
      summary: `Inquiry form unarchived: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetFormId,
        inquiryFormSlug: targetForm.slug,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  if (limitExceeded) {
    return {
      ok: false,
      reason: "live-form-limit",
    };
  }

  return {
    ok: true,
    businessSlug: business.slug,
    formSlug: targetForm.slug,
  };
}
