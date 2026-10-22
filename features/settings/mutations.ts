import "server-only";

import { and, asc, eq, isNull, ne } from "drizzle-orm";

import {
  normalizeBusinessType,
  type BusinessType,
} from "@/features/inquiries/business-types";
import { normalizeServiceSlug } from "@/features/inquiries/service-presets";
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
  BusinessAgentSettingsInput,
  BusinessDeleteInput,
  BusinessEmailTemplateSettingsInput,
  BusinessGeneralSettingsInput,
  ServiceCreateInput,
  ServicePresetInput,
  ServiceSettingsInput,
  ServicePageSettingsInput,
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
  services,
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

type UpdateBusinessAgentSettingsInput = {
  businessId: string;
  actorUserId: string;
  values: BusinessAgentSettingsInput;
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

type UpdateServicePageInput = {
  businessId: string;
  actorUserId: string;
  /** The service slug the action was bound to — the lookup key. */
  serviceSlug: string;
  values: ServicePageSettingsInput;
};

type UpdateServiceInput = {
  businessId: string;
  actorUserId: string;
  /** The service slug the action was bound to — the lookup key. */
  serviceSlug: string;
  values: ServiceSettingsInput;
};

type ApplyServicePresetInput = {
  businessId: string;
  actorUserId: string;
  /** The service slug the action was bound to — the lookup key. */
  serviceSlug: string;
  values: ServicePresetInput;
};

type CreateServiceInput = {
  businessId: string;
  actorUserId: string;
  values: ServiceCreateInput & {
    /** Starter template the new service inherits from its business. */
    businessType: BusinessType;
  };
};

type TargetServiceInput = {
  businessId: string;
  actorUserId: string;
  targetServiceId: string;
};
type SetServicePublicStateInput = TargetServiceInput & {
  publicInquiryEnabled: boolean;
};

type UpdateBusinessSettingsResult =
  | { ok: true; previousSlug: string; nextSlug: string }
  | { ok: false; reason: "not-found" | "slug-taken" };

type DeleteBusinessResult =
  | { ok: true; businessSlug: string }
  | { ok: false; reason: "not-found" | "confirmation-mismatch" };

type UpdateServiceSettingsResult =
  | {
      ok: true;
      previousSlug: string;
      nextSlug: string;
      previousServiceSlug: string;
      nextServiceSlug: string;
    }
  | { ok: false; reason: "not-found" | "slug-taken" };

type UpdateServicePageSettingsResult =
  | {
      ok: true;
      previousSlug: string;
      nextSlug: string;
      previousServiceSlug: string;
      nextServiceSlug: string;
    }
  | {
      ok: false;
      reason:
        | "not-found"
        | "slug-taken"
        | "live-form-limit"
        | "invalid-target";
    };

type ServiceMutationResult =
  | { ok: true; businessSlug: string; serviceSlug: string }
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
async function getAvailableServiceSlug({
  businessId,
  baseSlug,
  excludeServiceId,
}: {
  businessId: string;
  baseSlug: string;
  excludeServiceId?: string;
}) {
  const normalizedBaseSlug = normalizeServiceSlug(baseSlug);
  let candidate = normalizedBaseSlug;

  while (true) {
    const conditions = [
      eq(services.businessId, businessId),
      eq(services.slug, candidate),
    ];

    if (excludeServiceId) {
      conditions.push(ne(services.id, excludeServiceId));
    }

    const [existingForm] = await db
      .select({ id: services.id })
      .from(services)
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

function createDuplicateServiceName(name: string) {
  const nextName = `${name} copy`.trim();

  return nextName.slice(0, 80).trim() || name;
}

function createServiceSeedValues({
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

      const serviceRows = await tx
        .select({
          id: services.id,
          inquiryPageConfig: services.inquiryPageConfig,
        })
        .from(services)
        .where(
          and(
            eq(services.businessId, businessId),
            isNull(services.archivedAt),
          ),
        );

      for (const service of serviceRows) {
        const currentBrandTagline =
          service.inquiryPageConfig?.brandTagline?.trim() || undefined;
        const shouldSyncBrandTagline =
          currentBrandTagline === previousShortDescription ||
          currentBrandTagline === undefined;

        if (!shouldSyncBrandTagline || currentBrandTagline === nextShortDescription) {
          continue;
        }

        await tx
          .update(services)
          .set({
            inquiryPageConfig: {
              ...service.inquiryPageConfig,
              brandTagline: nextShortDescription,
            },
            updatedAt: now,
          })
          .where(eq(services.id, service.id));
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

export async function updateBusinessAgentSettings({
  businessId,
  actorUserId,
  values,
}: UpdateBusinessAgentSettingsInput): Promise<UpdateBusinessSettingsResult> {
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
        agentEnabled: values.agentEnabled,
        agentConfig: {
          tone: values.tone,
          // Omit rather than store an empty string: the prompt builders treat
          // an absent value as "no instructions" and skip the block entirely.
          ...(values.agentInstructions
            ? { instructions: values.agentInstructions }
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
      summary: "Agent settings updated.",
      metadata: {
        // Persisted key from the AI-agent naming era. Keep it stable for
        // historical activity rows and external audit queries.
        aiAgentEnabled: values.agentEnabled,
        tone: values.tone,
        hasInstructions: Boolean(values.agentInstructions),
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

export async function updateServicePageSettings({
  businessId,
  actorUserId,
  serviceSlug,
  values,
}: UpdateServicePageInput): Promise<UpdateServicePageSettingsResult> {
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
        id: services.id,
        slug: services.slug,
        isDefault: services.isDefault,
        publicInquiryEnabled: services.publicInquiryEnabled,
        inquiryFormConfig: services.inquiryFormConfig,
        inquiryPageConfig: services.inquiryPageConfig,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.slug, serviceSlug),
          isNull(services.archivedAt),
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
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.slug, values.slug),
          ne(services.id, form.id),
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
        .update(services)
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
            eq(services.businessId, businessId),
            eq(services.id, form.id),
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
    previousServiceSlug: form.slug,
    nextServiceSlug: values.slug,
  };
}

export async function updateServiceSettings({
  businessId,
  actorUserId,
  serviceSlug,
  values,
}: UpdateServiceInput): Promise<UpdateServiceSettingsResult> {
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
        id: services.id,
        slug: services.slug,
        businessType: services.businessType,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.slug, serviceSlug),
          isNull(services.archivedAt),
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
      .update(services)
      .set({
        inquiryFormConfig,
        updatedAt: now,
      })
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, form.id),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_updated",
      summary: `Service updated for ${form.slug}.`,
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
    previousServiceSlug: form.slug,
    nextServiceSlug: form.slug,
  };
}

export async function applyServicePreset({
  businessId,
  actorUserId,
  serviceSlug,
  values,
}: ApplyServicePresetInput): Promise<UpdateBusinessSettingsResult> {
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
        id: services.id,
        slug: services.slug,
        name: services.name,
        publicInquiryEnabled: services.publicInquiryEnabled,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.slug, serviceSlug),
          isNull(services.archivedAt),
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
      .update(services)
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
          eq(services.businessId, businessId),
          eq(services.id, form.id),
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

export async function createService({
  businessId,
  actorUserId,
  values,
}: CreateServiceInput): Promise<ServiceMutationResult> {
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
  const serviceId = newEntityId();
  const formSeed = createServiceSeedValues({
    businessType: values.businessType,
    name: values.name,
    businessName: business.name,
    businessShortDescription: business.shortDescription,
  });
  const plan = await resolveServicePlan(businessId);
  let limitExceeded = false;
  let serviceSlug = "";

  // The slug lookup is a best-effort reservation; the unique index is the
  // arbiter, so a lost race retries with a fresh candidate.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateSlug = await getAvailableServiceSlug({
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

        await tx.insert(services).values({
          id: serviceId,
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
          summary: `Service created: ${formSeed.name}.`,
          metadata: {
            inquiryFormId: serviceId,
            inquiryFormSlug: candidateSlug,
            businessType: formSeed.businessType,
          },
          createdAt: now,
          updatedAt: now,
        });
      });

      serviceSlug = candidateSlug;
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

  if (!serviceSlug) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  return {
    ok: true,
    businessSlug: business.slug,
    serviceSlug,
  };
}

export async function duplicateService({
  businessId,
  actorUserId,
  targetServiceId,
}: TargetServiceInput): Promise<ServiceMutationResult> {
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
        id: services.id,
        name: services.name,
        businessType: services.businessType,
        publicInquiryEnabled: services.publicInquiryEnabled,
        inquiryFormConfig: services.inquiryFormConfig,
        inquiryPageConfig: services.inquiryPageConfig,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
          isNull(services.archivedAt),
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
  const nextName = createDuplicateServiceName(sourceForm.name);
  const serviceId = newEntityId();
  const sourceFormBusinessType = normalizeBusinessType(sourceForm.businessType);
  const sourceInquiryFormConfig = getNormalizedInquiryFormConfig(
    sourceForm.inquiryFormConfig,
    {
      businessType: sourceFormBusinessType,
    },
  );
  const plan = await resolveServicePlan(businessId);
  let limitExceeded = false;
  let serviceSlug = "";

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidateSlug = await getAvailableServiceSlug({
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

        await tx.insert(services).values({
          id: serviceId,
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
          summary: `Service duplicated: ${nextName}.`,
          metadata: {
            inquiryFormId: serviceId,
            inquiryFormSlug: candidateSlug,
            sourceInquiryFormId: targetServiceId,
          },
          createdAt: now,
          updatedAt: now,
        });
      });

      serviceSlug = candidateSlug;
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

  if (!serviceSlug) {
    return {
      ok: false,
      reason: "not-found",
    };
  }

  return {
    ok: true,
    businessSlug: business.slug,
    serviceSlug,
  };
}

export async function setDefaultService({
  businessId,
  actorUserId,
  targetServiceId,
}: TargetServiceInput): Promise<ServiceMutationResult> {
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
        id: services.id,
        slug: services.slug,
        publicInquiryEnabled: services.publicInquiryEnabled,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
          isNull(services.archivedAt),
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
      .update(services)
      .set({
        isDefault: false,
        updatedAt: now,
      })
      .where(eq(services.businessId, businessId));

    await tx
      .update(services)
      .set({
        isDefault: true,
        updatedAt: now,
      })
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_default_changed",
      summary: `Default service set to ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetServiceId,
        inquiryFormSlug: targetForm.slug,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    serviceSlug: targetForm.slug,
  };
}

export async function archiveService({
  businessId,
  actorUserId,
  targetServiceId,
}: TargetServiceInput): Promise<ServiceMutationResult> {
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
        id: services.id,
        slug: services.slug,
        isDefault: services.isDefault,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
          isNull(services.archivedAt),
        ),
      )
      .limit(1),
    db
      .select({
        id: services.id,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          isNull(services.archivedAt),
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
      .update(services)
      .set({
        archivedAt: now,
        isDefault: false,
        updatedAt: now,
      })
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_archived",
      summary: `Service archived: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetServiceId,
        inquiryFormSlug: targetForm.slug,
      },
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    ok: true,
    businessSlug: business.slug,
    serviceSlug: targetForm.slug,
  };
}

export async function deleteService({
  businessId,
  actorUserId,
  targetServiceId,
}: TargetServiceInput): Promise<ServiceMutationResult> {
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
        id: services.id,
        slug: services.slug,
        isDefault: services.isDefault,
        archivedAt: services.archivedAt,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
        ),
      )
      .limit(1),
    db
      .select({ id: services.id })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          isNull(services.archivedAt),
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
    .where(eq(inquiries.serviceId, targetServiceId))
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
    .where(eq(analyticsEvents.serviceId, targetServiceId))
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
        .select({ id: services.id })
        .from(services)
        .where(
          and(
            eq(services.businessId, businessId),
            isNull(services.archivedAt),
            eq(services.publicInquiryEnabled, true),
            ne(services.id, targetServiceId),
          ),
        )
        .orderBy(asc(services.name))
        .limit(1);

      if (!nextDefault) {
        return false;
      }

      // Clear the outgoing default first: the database enforces at most one
      // default per business, so the two updates cannot overlap.
      await tx
        .update(services)
        .set({ isDefault: false, updatedAt: now })
        .where(
          and(
            eq(services.businessId, businessId),
            eq(services.id, targetServiceId),
          ),
        );

      await tx
        .update(services)
        .set({ isDefault: true, updatedAt: now })
        .where(eq(services.id, nextDefault.id));
    }

    await tx
      .delete(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_deleted",
      summary: `Service deleted: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetServiceId,
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
    serviceSlug: targetForm.slug,
  };
}

export async function setServicePublicState({
  businessId,
  actorUserId,
  targetServiceId,
  publicInquiryEnabled,
}: SetServicePublicStateInput): Promise<ServiceMutationResult> {
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
        id: services.id,
        slug: services.slug,
        isDefault: services.isDefault,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
          isNull(services.archivedAt),
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
      !(await hasLiveServiceSlot(tx, businessId, plan, targetServiceId))
    ) {
      limitExceeded = true;
      return;
    }

    await tx
      .update(services)
      .set({
        publicInquiryEnabled,
        updatedAt: now,
      })
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_page_updated",
      summary: publicInquiryEnabled
        ? `Service published: ${targetForm.slug}.`
        : `Service unpublished: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetServiceId,
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
    serviceSlug: targetForm.slug,
  };
}

export async function unarchiveService({
  businessId,
  actorUserId,
  targetServiceId,
}: TargetServiceInput): Promise<ServiceMutationResult> {
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
        id: services.id,
        slug: services.slug,
        publicInquiryEnabled: services.publicInquiryEnabled,
      })
      .from(services)
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
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
      .update(services)
      .set({
        archivedAt: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(services.businessId, businessId),
          eq(services.id, targetServiceId),
        ),
      );

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      actorUserId,
      type: "business.inquiry_form_updated",
      summary: `Service unarchived: ${targetForm.slug}.`,
      metadata: {
        inquiryFormId: targetServiceId,
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
    serviceSlug: targetForm.slug,
  };
}
