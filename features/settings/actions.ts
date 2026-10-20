"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getValidationActionState } from "@/lib/action-state";
import { getSafeInternalRedirectPath } from "@/lib/actions/run-record-action";
import {
  getBusinessInquiryFormCacheTags,
  getBusinessInquiryFormsCacheTags,
  getBusinessSettingsCacheTags,
  getPublicBusinessProfileCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import {
  getUserBusinessContextCacheTags,
  getUserMembershipsCacheTags,
} from "@/lib/cache/shell-tags";
import {
  businessAiAgentSettingsSchema,
  emailTemplateKindSchema,
  getEmailTemplateSettingsSchemaForKind,
  businessGeneralSettingsSchema,
  businessInquiryFormCreateSchema,
  businessInquiryFormPresetSchema,
  businessInquiryFormSettingsSchema,
  businessInquiryFormTargetSchema,
  businessInquiryPageSettingsSchema,
  businessNotificationSettingsSchema,
  businessQuoteSettingsSchema,
} from "@/features/settings/schemas";
import type {
  BusinessAiAgentSettingsActionState,
  BusinessEmailTemplateActionState,
  BusinessInquiryFormActionState,
  BusinessInquiryFormDangerActionState,
  BusinessInquiryFormsActionState,
  BusinessInquiryPageActionState,
  BusinessNotificationSettingsActionState,
  BusinessQuoteSettingsActionState,
  BusinessSettingsActionState,
} from "@/features/settings/types";
import {
  archiveBusinessInquiryForm,
  unarchiveBusinessInquiryForm,
  createBusinessInquiryForm,
  deleteBusinessInquiryForm,
  duplicateBusinessInquiryForm,
  setBusinessInquiryFormPublicState,
  applyBusinessInquiryFormPreset,
  setDefaultBusinessInquiryForm,
  updateBusinessAiAgentSettings,
  updateBusinessEmailTemplateSettings,
  updateBusinessInquiryFormSettings,
  updateBusinessInquiryPageSettings,
  updateBusinessNotificationSettings,
  updateBusinessQuoteSettings,
  updateBusinessSettings,
} from "@/features/settings/mutations";
import {
  getOperationalBusinessActionContext,
  getOwnerBusinessActionContext,
} from "@/lib/db/business-access";
import {
  getBusinessHomePath,
  getBusinessServicePath,
  getBusinessServicePreviewPath,
  getBusinessServicesPath,
  getBusinessSettingsPath,
} from "@/features/businesses/routes";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { getBusinessInquiryFormsSettingsForBusiness } from "@/features/settings/queries";
import type { BusinessPlan } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { hasFeatureAccess } from "@/lib/plans/entitlements";

function getLiveFormLimitMessage(plan: BusinessPlan): string {
  const limit = getUsageLimit(plan, "liveFormsPerBusiness");

  return `This plan supports ${limit ?? "no"} live service${
    limit === 1 ? "" : "s"
  }. Archive a service or upgrade to publish another.`;
}

function updateCacheTags(tags: string[]) {
  for (const tag of uniqueCacheTags(tags)) {
    updateTag(tag);
  }
}

function revalidateBusinessInquiryFormPaths(
  businessSlug: string,
  formSlug: string,
) {
  revalidatePath(getBusinessServicesPath(businessSlug));
  revalidatePath(getBusinessServicePath(businessSlug, formSlug));
  revalidatePath(getBusinessServicePreviewPath(businessSlug, formSlug));
  revalidatePath(getBusinessPublicInquiryUrl(businessSlug, formSlug));
}

function revalidateBusinessDefaultInquiryPaths(businessSlug: string) {
  revalidatePath(getBusinessPublicInquiryUrl(businessSlug));
  revalidatePath(`${getBusinessSettingsPath(businessSlug)}/inquiry-form`);
  revalidatePath(`${getBusinessSettingsPath(businessSlug)}/inquiry-page`);
  revalidatePath(`${getBusinessSettingsPath(businessSlug)}/inquiry-page/preview`);
}

export async function updateBusinessSettingsAction(
  _prevState: BusinessSettingsActionState,
  formData: FormData,
): Promise<BusinessSettingsActionState> {
  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = businessGeneralSettingsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    countryCode: formData.get("countryCode"),
    shortDescription: formData.get("shortDescription"),
    contactEmail: formData.get("contactEmail"),
    website: formData.get("website"),
    defaultCurrency: formData.get("defaultCurrency"),
    defaultEmailSignature: formData.get("defaultEmailSignature"),
    logo: formData.get("logo"),
    removeLogo: formData.get("removeLogo"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Check the highlighted settings and try again.");
  }

  let nextSettingsPath: string | null = null;

  try {
    const result = await updateBusinessSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
    });

    if (!result.ok) {
      if (result.reason === "slug-taken") {
        return {
          error: "Choose a different public slug.",
          fieldErrors: {
            slug: ["This public slug is already in use."],
          },
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    // Invalidate dashboard-scoped cache tags — fast, no per-path overhead.
    updateCacheTags(getBusinessSettingsCacheTags(businessContext.business.id));

    // Expire the shell membership/context caches so the business switcher
    // picks up the new name/logo on the next refresh. Context tags are
    // slug-keyed, so cover the previous slug too when it changed.
    updateCacheTags(getUserMembershipsCacheTags(user.id));
    updateCacheTags(getUserBusinessContextCacheTags(user.id, result.nextSlug));
    if (result.previousSlug !== result.nextSlug) {
      updateCacheTags(
        getUserBusinessContextCacheTags(user.id, result.previousSlug),
      );
    }

    // Invalidate the public `/businesses/[slug]` profile cache keyed by
    // slug. Cover both old and new slugs when the slug changed so a stale
    // entry under the previous slug doesn't keep serving.
    updateCacheTags(getPublicBusinessProfileCacheTags(result.previousSlug));
    if (result.previousSlug !== result.nextSlug) {
      updateCacheTags(getPublicBusinessProfileCacheTags(result.nextSlug));
    }

    // Slug change requires layout-level revalidation for the new routes.
    if (result.previousSlug !== result.nextSlug) {
      revalidatePath(getBusinessHomePath(result.previousSlug), "layout");
      revalidatePath(getBusinessHomePath(result.nextSlug), "layout");
      nextSettingsPath = getBusinessSettingsPath(result.nextSlug, "general");
    }

    // Defer public-path revalidation — these are rarely visited immediately
    // after saving settings and should not block the action response.
    after(async () => {
      revalidatePath(`/inquire/${result.previousSlug}`);
      revalidatePath(`/inquire/${result.nextSlug}`);
      revalidateBusinessDefaultInquiryPaths(result.previousSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);

      const inquiryFormsSettings =
        await getBusinessInquiryFormsSettingsForBusiness(
          businessContext.business.id,
        );

      if (inquiryFormsSettings) {
        for (const form of inquiryFormsSettings.forms) {
          revalidateBusinessInquiryFormPaths(result.previousSlug, form.slug);
          revalidateBusinessInquiryFormPaths(result.nextSlug, form.slug);
        }
      }
    });
  } catch (error) {
    console.error("Failed to update business settings.", error);

    return {
      error: "We couldn't save those settings right now.",
    };
  }

  if (nextSettingsPath) {
    redirect(nextSettingsPath);
  }

  return {
    success: "Business settings saved.",
  };
}

export async function updateBusinessNotificationSettingsAction(
  _prevState: BusinessNotificationSettingsActionState,
  formData: FormData,
): Promise<BusinessNotificationSettingsActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessNotificationSettingsSchema.safeParse({
    notifyInAppOnNewInquiry: formData.get("notifyInAppOnNewInquiry") === "on",
    notifyInAppOnQuoteSent: formData.get("notifyInAppOnQuoteSent") === "on",
    notifyInAppOnQuoteResponse: formData.get("notifyInAppOnQuoteResponse") === "on",
    notifyInAppOnMemberInviteResponse: formData.get("notifyInAppOnMemberInviteResponse") === "on",
    notifyPushOnNewInquiry: formData.get("notifyPushOnNewInquiry") === "on",
    notifyPushOnQuoteSent: formData.get("notifyPushOnQuoteSent") === "on",
    notifyPushOnQuoteResponse: formData.get("notifyPushOnQuoteResponse") === "on",
    notifyPushOnMemberInviteResponse: formData.get("notifyPushOnMemberInviteResponse") === "on",
    notifyInAppOnFollowUpReminder: formData.get("notifyInAppOnFollowUpReminder") === "on",
    notifyInAppOnQuoteExpiring: formData.get("notifyInAppOnQuoteExpiring") === "on",
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the notification settings and try again.",
    );
  }

  try {
    const result = await updateBusinessNotificationSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(getBusinessSettingsCacheTags(businessContext.business.id));
  } catch (error) {
    console.error("Failed to update business notification settings.", error);

    return {
      error: "We couldn't save the notification settings right now.",
    };
  }

  return {
    success: "Notification settings saved.",
  };
}

export async function updateBusinessAiAgentSettingsAction(
  _prevState: BusinessAiAgentSettingsActionState,
  formData: FormData,
): Promise<BusinessAiAgentSettingsActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  if (
    !hasFeatureAccess(businessContext.business.plan, "aiAgent")
  ) {
    return {
      error: "Your plan does not include the AI agent. Upgrade to enable it.",
    };
  }

  const validationResult = businessAiAgentSettingsSchema.safeParse({
    aiAgentEnabled: formData.get("aiAgentEnabled") === "on",
    tone: formData.get("tone"),
    aiAgentInstructions: formData.get("aiAgentInstructions"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the AI agent settings and try again.",
    );
  }

  try {
    const result = await updateBusinessAiAgentSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(getBusinessSettingsCacheTags(businessContext.business.id));

    revalidatePath(`/b/${businessContext.business.slug}/chat`);
  } catch (error) {
    console.error("Failed to update AI agent settings.", error);

    return {
      error: "We couldn't save the AI agent settings right now.",
    };
  }

  return {
    success: "AI agent settings saved.",
  };
}

export async function sendTestPushNotificationAction(): Promise<{
  success?: string;
  error?: string;
}> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  try {
    const { sendTestPushToUserForBusiness } = await import("@/lib/push/send");
    const deliveredCount = await sendTestPushToUserForBusiness({
      businessId: businessContext.business.id,
      userId: user.id,
      businessName: businessContext.business.name,
    });

    if (deliveredCount === 0) {
      return {
        error:
          "No push-enabled browsers found. Enable push on this browser first.",
      };
    }

    return {
      success:
        deliveredCount === 1
          ? "Test notification sent. Check this browser."
          : `Test notification sent to ${deliveredCount} browsers.`,
    };
  } catch (error) {
    console.error("Failed to send test push notification.", error);

    return {
      error: "We couldn't send the test notification right now.",
    };
  }
}

export async function updateBusinessQuoteSettingsAction(
  _prevState: BusinessQuoteSettingsActionState,
  formData: FormData,
): Promise<BusinessQuoteSettingsActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessQuoteSettingsSchema.safeParse({
    defaultQuoteNotes: formData.get("defaultQuoteNotes"),
    defaultQuoteTerms: formData.get("defaultQuoteTerms"),
    defaultQuoteValidityDays: formData.get("defaultQuoteValidityDays"),
    sendInquiryAckEmail: formData.get("sendInquiryAckEmail"),
    autoDraftQuoteOnQualify: formData.get("autoDraftQuoteOnQualify"),
    autoArchiveStaleInquiries: formData.get("autoArchiveStaleInquiries"),
    autoArchiveStaleInquiryDays: formData.get("autoArchiveStaleInquiryDays"),
    autoFollowUpOnQuoteViewed: formData.get("autoFollowUpOnQuoteViewed"),
    quoteViewedFollowUpDelayDays: formData.get("quoteViewedFollowUpDelayDays"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the quote settings and try again.",
    );
  }

  try {
    const result = await updateBusinessQuoteSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(getBusinessSettingsCacheTags(businessContext.business.id));

    return {
      success: "Quote settings saved.",
    };
  } catch (error) {
    console.error("Failed to update business quote settings.", error);

    return {
      error: "We couldn't save the quote settings right now.",
    };
  }
}

export async function updateBusinessEmailTemplateSettingsAction(
  _prevState: BusinessEmailTemplateActionState,
  formData: FormData,
): Promise<BusinessEmailTemplateActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const kindParsed = emailTemplateKindSchema.safeParse(
    formData.get("templateKind") ?? "quote",
  );
  const templateKind = kindParsed.success ? kindParsed.data : "quote";
  const rawBlocks = formData.get("blocks");
  let parsedBlocks: unknown = [];
  if (typeof rawBlocks === "string" && rawBlocks.trim()) {
    try {
      parsedBlocks = JSON.parse(rawBlocks);
    } catch {
      return {
        error: "Check the email template settings and try again.",
        fieldErrors: { blocks: ["Email blocks are invalid."] },
      };
    }
  }
  const schema = getEmailTemplateSettingsSchemaForKind(templateKind);
  const validationResult = schema.safeParse({
    subject: formData.get("subject"),
    blocks: parsedBlocks,
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the email template settings and try again.",
    );
  }

  try {
    const result = await updateBusinessEmailTemplateSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
      templateKind,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(getBusinessSettingsCacheTags(businessContext.business.id));

    return {
      success: "Email template saved.",
    };
  } catch (error) {
    console.error("Failed to update business email template settings.", error);

    return {
      error: "We couldn't save the email template right now.",
    };
  }
}

export async function updateBusinessInquiryPageAction(
  _formSlug: string,
  _prevState: BusinessInquiryPageActionState,
  formData: FormData,
): Promise<BusinessInquiryPageActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = businessInquiryPageSettingsSchema.safeParse({
    formId: formData.get("formId"),
    name: formData.get("name"),
    slug: formData.get("slug"),
    businessType: formData.get("businessType"),
    publicInquiryEnabled: formData.get("publicInquiryEnabled"),
    template: formData.get("template"),
    showSupportingCards: formData.get("showSupportingCards"),
    showShowcaseImage: formData.get("showShowcaseImage"),
    showBusinessContact: formData.get("showBusinessContact"),
    eyebrow: formData.get("eyebrow"),
    headline: formData.get("headline"),
    description: formData.get("description"),
    brandTagline: formData.get("brandTagline"),
    formTitle: formData.get("formTitle"),
    formDescription: formData.get("formDescription"),
    thankYouMessage: formData.get("thankYouMessage"),
    businessContactPhone: formData.get("businessContactPhone"),
    businessContactEmail: formData.get("businessContactEmail"),
    businessFacebookUrl: formData.get("businessFacebookUrl"),
    businessInstagramUrl: formData.get("businessInstagramUrl"),
    businessTwitterXUrl: formData.get("businessTwitterXUrl"),
    businessLinkedinUrl: formData.get("businessLinkedinUrl"),
    showcaseImageUrl: formData.get("showcaseImageUrl"),
    showcaseImageFrame: formData.get("showcaseImageFrame"),
    showcaseImageSize: formData.get("showcaseImageSize"),
    showcaseImageCropX: formData.get("showcaseImageCropX"),
    showcaseImageCropY: formData.get("showcaseImageCropY"),
    showcaseImageCropZoom: formData.get("showcaseImageCropZoom"),
    cards: formData.get("cards"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the service page details and try again.",
    );
  }

  try {
    const result = await updateBusinessInquiryPageSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
    });

    if (!result.ok) {
      if (result.reason === "slug-taken") {
        return {
          error: "Choose a different slug.",
          fieldErrors: {
            slug: ["This slug is already in use in this business."],
          },
        };
      }

      if (result.reason === "live-form-limit") {
        return {
          error: getLiveFormLimitMessage(businessContext.business.plan),
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.previousFormSlug,
        ),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.nextFormSlug,
        ),
      ]),
    );

    // Defer public-path revalidation — updateTag handles dashboard cache.
    after(() => {
      revalidateBusinessInquiryFormPaths(result.nextSlug, result.nextFormSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);
    });

    if (result.previousFormSlug !== result.nextFormSlug) {
      revalidateBusinessInquiryFormPaths(result.nextSlug, result.previousFormSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);

      redirect(
        `${getBusinessServicePath(
          result.nextSlug,
          result.nextFormSlug,
        )}?section=page`,
      );
    }

    return {
      success: "Service page saved.",
    };
  } catch (error) {
    console.error("Failed to update business inquiry page settings.", error);

    return {
      error: "We couldn't save the service page right now.",
    };
  }
}

export async function updateBusinessInquiryFormAction(
  _formSlug: string,
  _prevState: BusinessInquiryFormActionState,
  formData: FormData,
): Promise<BusinessInquiryFormActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = businessInquiryFormSettingsSchema.safeParse({
    formId: formData.get("formId"),
    businessType: formData.get("businessType"),
    inquiryFormConfig: formData.get("inquiryFormConfig"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the intake form and try again.",
    );
  }

  let nextEditorPath: string | null = null;

  try {
    const result = await updateBusinessInquiryFormSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.previousFormSlug,
        ),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.nextFormSlug,
        ),
      ]),
    );

    // Defer public-path revalidation — updateTag handles dashboard cache.
    after(() => {
      revalidateBusinessInquiryFormPaths(result.nextSlug, result.nextFormSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);
    });

    if (result.previousFormSlug !== result.nextFormSlug) {
      revalidateBusinessInquiryFormPaths(result.nextSlug, result.previousFormSlug);
      revalidateBusinessInquiryFormPaths(result.nextSlug, result.nextFormSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);
      nextEditorPath = getBusinessServicePath(
        result.nextSlug,
        result.nextFormSlug,
      );
    }
  } catch (error) {
    console.error("Failed to update business inquiry form settings.", error);

    return {
      error: "We couldn't save the intake form right now.",
    };
  }

  if (nextEditorPath) {
    redirect(nextEditorPath);
  }

  return {
    success: "Intake form saved.",
  };
}

export async function applyBusinessInquiryFormPresetAction(
  formSlug: string,
  _prevState: BusinessInquiryFormActionState,
  formData: FormData,
): Promise<BusinessInquiryFormActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = businessInquiryFormPresetSchema.safeParse({
    formId: formData.get("formId"),
    businessType: formData.get("businessType"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Choose a template and try again.",
    );
  }

  try {
    const result = await applyBusinessInquiryFormPreset({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: validationResult.data,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(businessContext.business.id, formSlug),
      ]),
    );

    return {
      success: "Template defaults applied.",
    };
  } catch (error) {
    console.error("Failed to apply business inquiry preset.", error);

    return {
      error: "We couldn't apply the template right now.",
    };
  }
}

export async function createBusinessInquiryFormAction(
  _prevState: BusinessInquiryFormsActionState,
  formData: FormData,
): Promise<BusinessInquiryFormsActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormCreateSchema.safeParse({
    name: formData.get("name"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the service details and try again.",
    );
  }

  let editorPath: string | null = null;

  try {
    const result = await createBusinessInquiryForm({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      values: {
        ...validationResult.data,
        // A service belongs to the business, so new services inherit the
        // business's starter template instead of asking for a business type.
        businessType: businessContext.business.businessType,
      },
    });

    if (!result.ok) {
      if (result.reason === "live-form-limit") {
        return {
          error: getLiveFormLimitMessage(businessContext.business.plan),
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
    });
    editorPath = getBusinessServicePath(
      result.businessSlug,
      result.formSlug,
    );
  } catch (error) {
    console.error("Failed to create inquiry form.", error);

    return {
      error: "We couldn't create the service right now.",
    };
  }

  if (editorPath) {
    redirect(editorPath);
  }

  return {
    error: "We couldn't create the service right now.",
  };
}

export async function duplicateBusinessInquiryFormAction(
  _prevState: BusinessInquiryFormsActionState,
  formData: FormData,
): Promise<BusinessInquiryFormsActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormTargetSchema.safeParse({
    targetFormId: formData.get("targetFormId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  let editorPath: string | null = null;

  try {
    const result = await duplicateBusinessInquiryForm({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetFormId: validationResult.data.targetFormId,
    });

    if (!result.ok) {
      if (result.reason === "invalid-target") {
        return {
          error: "Default forms must stay published.",
        };
      }

      if (result.reason === "live-form-limit") {
        return {
          error: getLiveFormLimitMessage(businessContext.business.plan),
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
    });
    editorPath = getBusinessServicePath(
      result.businessSlug,
      result.formSlug,
    );
  } catch (error) {
    console.error("Failed to duplicate inquiry form.", error);

    return {
      error: "We couldn't duplicate the service right now.",
    };
  }

  if (editorPath) {
    redirect(editorPath);
  }

  return {
    error: "We couldn't duplicate the service right now.",
  };
}

export async function setDefaultBusinessInquiryFormAction(
  _prevState: BusinessInquiryFormsActionState,
  formData: FormData,
): Promise<BusinessInquiryFormsActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormTargetSchema.safeParse({
    targetFormId: formData.get("targetFormId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  try {
    const result = await setDefaultBusinessInquiryForm({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetFormId: validationResult.data.targetFormId,
    });

    if (!result.ok) {
      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });

    return {
      success: "Default service updated.",
    };
  } catch (error) {
    console.error("Failed to set default inquiry form.", error);

    return {
      error: "We couldn't change the default service right now.",
    };
  }
}

export async function archiveBusinessInquiryFormAction(
  _prevState: BusinessInquiryFormsActionState,
  formData: FormData,
): Promise<BusinessInquiryFormsActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormTargetSchema.safeParse({
    targetFormId: formData.get("targetFormId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a form and try again.");
  }

  try {
    const result = await archiveBusinessInquiryForm({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetFormId: validationResult.data.targetFormId,
    });

    if (!result.ok) {
      if (result.reason === "invalid-target") {
        return {
          error: "Set another service as default before archiving this one.",
        };
      }

      if (result.reason === "last-active") {
        return {
          error: "Keep at least one active service.",
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
    });

    return {
      success: "Service archived.",
    };
  } catch (error) {
    console.error("Failed to archive inquiry form.", error);

    return {
      error: "We couldn't archive the service right now.",
    };
  }
}

export async function archiveBusinessInquiryFormFromDetailAction(
  _prevState: BusinessInquiryFormDangerActionState,
  formData: FormData,
): Promise<BusinessInquiryFormDangerActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormTargetSchema.safeParse({
    targetFormId: formData.get("targetFormId"),
  });

  if (!validationResult.success) {
    return {
      error: "That inquiry form could not be found.",
    };
  }

  try {
    const result = await archiveBusinessInquiryForm({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetFormId: validationResult.data.targetFormId,
    });

    if (!result.ok) {
      if (result.reason === "invalid-target") {
        return {
          error: "Set another service as default before archiving this one.",
        };
      }

      if (result.reason === "last-active") {
        return {
          error: "Keep at least one active service.",
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
    });

    return {
      success: "Service archived.",
    };
  } catch (error) {
    console.error("Failed to archive inquiry form.", error);

    return {
      error: "We couldn't archive the service right now.",
    };
  }
}

export async function deleteBusinessInquiryFormAction(
  _prevState: BusinessInquiryFormDangerActionState,
  formData: FormData,
): Promise<BusinessInquiryFormDangerActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();
  const redirectHref = getSafeInternalRedirectPath(
    formData.get("redirectHref") as string | null,
  );

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormTargetSchema.safeParse({
    targetFormId: formData.get("targetFormId"),
  });

  if (!validationResult.success) {
    return {
      error: "That service could not be found.",
    };
  }

  try {
    const result = await deleteBusinessInquiryForm({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetFormId: validationResult.data.targetFormId,
    });

    if (!result.ok) {
      if (result.reason === "has-inquiries") {
        return {
          error:
            "This service still has inquiries. Archive the service instead, or delete all linked inquiries first.",
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
    });

    if (redirectHref) {
      redirect(redirectHref);
    }

    return {
      success: "Service deleted.",
    };
  } catch (error) {
    console.error("Failed to delete inquiry form.", error);

    return {
      error: "We couldn't delete the service right now.",
    };
  }
}

export async function toggleBusinessInquiryFormPublicAction(
  _prevState: BusinessInquiryFormsActionState,
  formData: FormData,
): Promise<BusinessInquiryFormsActionState> {
  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormTargetSchema.safeParse({
    targetFormId: formData.get("targetFormId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  const publicInquiryEnabled = formData.get("publicInquiryEnabled") === "true";

  try {
    const result = await setBusinessInquiryFormPublicState({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetFormId: validationResult.data.targetFormId,
      publicInquiryEnabled,
    });

    if (!result.ok) {
      if (result.reason === "live-form-limit") {
        return {
          error: getLiveFormLimitMessage(businessContext.business.plan),
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });

    return {
      success: publicInquiryEnabled
        ? "Service published."
        : "Service unpublished.",
    };
  } catch (error) {
    console.error("Failed to toggle public inquiry form state.", error);

    return {
      error: "We couldn't update service availability right now.",
    };
  }
}

export async function unarchiveBusinessInquiryFormAction(
  _prevState: BusinessInquiryFormDangerActionState,
  formData: FormData,
): Promise<BusinessInquiryFormDangerActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = businessInquiryFormTargetSchema.safeParse({
    targetFormId: formData.get("targetFormId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  try {
    const result = await unarchiveBusinessInquiryForm({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetFormId: validationResult.data.targetFormId,
    });

    if (!result.ok) {
      if (result.reason === "live-form-limit") {
        return {
          error: getLiveFormLimitMessage(businessContext.business.plan),
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getBusinessInquiryFormsCacheTags(businessContext.business.id),
        ...getBusinessInquiryFormCacheTags(
          businessContext.business.id,
          result.formSlug,
        ),
      ]),
    );
    after(() => {
      revalidateBusinessInquiryFormPaths(result.businessSlug, result.formSlug);
    });

    return {
      success: "Service restored.",
    };
  } catch (error) {
    console.error("Failed to unarchive inquiry form.", error);

    return {
      error: "We couldn't unarchive the service right now.",
    };
  }
}
