"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { getValidationActionState } from "@/lib/action-state";
import { getSafeInternalRedirectPath } from "@/lib/actions/run-record-action";
import {
  getServiceCacheTags,
  getServicesCacheTags,
  getBusinessSettingsCacheTags,
  getPublicBusinessProfileCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import {
  getUserBusinessContextCacheTags,
  getUserMembershipsCacheTags,
} from "@/lib/cache/shell-tags";
import {
  businessAgentSettingsSchema,
  emailTemplateKindSchema,
  getEmailTemplateSettingsSchemaForKind,
  businessGeneralSettingsSchema,
  serviceCreateSchema,
  servicePresetSchema,
  serviceSettingsSchema,
  serviceTargetSchema,
  servicePageSettingsSchema,
  businessNotificationSettingsSchema,
  businessQuoteSettingsSchema,
} from "@/features/settings/schemas";
import type {
  BusinessAgentSettingsActionState,
  BusinessEmailTemplateActionState,
  ServiceActionState,
  ServiceDangerActionState,
  ServicesActionState,
  ServicePageActionState,
  BusinessNotificationSettingsActionState,
  BusinessQuoteSettingsActionState,
  BusinessSettingsActionState,
} from "@/features/settings/types";
import {
  archiveService,
  unarchiveService,
  createService,
  deleteService,
  duplicateService,
  setServicePublicState,
  applyServicePreset,
  setDefaultService,
  updateBusinessAgentSettings,
  updateBusinessEmailTemplateSettings,
  updateServiceSettings,
  updateServicePageSettings,
  updateBusinessNotificationSettings,
  updateBusinessQuoteSettings,
  updateBusinessSettings,
} from "@/features/settings/mutations";
import {
  getBusinessActionContext,
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
import {
  getServicesSettingsForBusiness,
  getServicePageSettingsForBusiness,
} from "@/features/settings/queries";
import type { PlanTier } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { hasFeatureAccess } from "@/lib/plans/entitlements";

function getLiveFormLimitMessage(plan: PlanTier): string {
  const limit = getUsageLimit(plan, "liveServicesPerBusiness");

  return `This plan supports ${limit ?? "no"} live service${
    limit === 1 ? "" : "s"
  }. Archive a service or upgrade to publish another.`;
}

function updateCacheTags(tags: string[]) {
  for (const tag of uniqueCacheTags(tags)) {
    updateTag(tag);
  }
}

function revalidateServicePaths(
  businessSlug: string,
  serviceSlug: string,
) {
  revalidatePath(getBusinessServicesPath(businessSlug));
  revalidatePath(getBusinessServicePath(businessSlug, serviceSlug));
  revalidatePath(getBusinessServicePreviewPath(businessSlug, serviceSlug));
  revalidatePath(getBusinessPublicInquiryUrl(businessSlug, serviceSlug));
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

      const servicesSettings =
        await getServicesSettingsForBusiness(
          businessContext.business.id,
        );

      if (servicesSettings) {
        for (const service of servicesSettings.services) {
          revalidateServicePaths(result.previousSlug, service.slug);
          revalidateServicePaths(result.nextSlug, service.slug);
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

export async function updateBusinessAgentSettingsAction(
  businessSlug: string,
  _prevState: BusinessAgentSettingsActionState,
  formData: FormData,
): Promise<BusinessAgentSettingsActionState> {
  // The business comes from the route slug, never from the active-business
  // cookie: the cookie is rewritten on every navigation, so a form rendered
  // for one business could otherwise save onto another.
  const ownerAccess = await getBusinessActionContext({
    businessSlug,
    minimumRole: "manager",
    requireActiveBusiness: true,
    unauthorizedMessage: "Only an owner or manager can do that.",
  });

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  if (
    !hasFeatureAccess(businessContext.business.plan, "agent")
  ) {
    return {
      error: "Your plan does not include the Agent. Upgrade to enable it.",
    };
  }

  const validationResult = businessAgentSettingsSchema.safeParse({
    agentEnabled: formData.get("agentEnabled") === "on",
    tone: formData.get("tone"),
    agentInstructions: formData.get("agentInstructions"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the Agent settings and try again.",
    );
  }

  try {
    const result = await updateBusinessAgentSettings({
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
    console.error("Failed to update Agent settings.", error);

    return {
      error: "We couldn't save the Agent settings right now.",
    };
  }

  return {
    success: "Agent settings saved.",
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

export async function updateServicePageAction(
  serviceSlug: string,
  _prevState: ServicePageActionState,
  formData: FormData,
): Promise<ServicePageActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = servicePageSettingsSchema.safeParse({
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

  let nextEditorPath: string | null = null;

  try {
    const values = validationResult.data;

    if (businessContext.role !== "owner") {
      const settings = await getServicePageSettingsForBusiness(
        businessContext.business.id,
        serviceSlug,
      );

      if (!settings) {
        return { error: "That service could not be found." };
      }

      values.publicInquiryEnabled = settings.publicInquiryEnabled;
    }

    const result = await updateServicePageSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      serviceSlug,
      values,
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

      if (result.reason === "invalid-target") {
        return {
          error: "The default service must stay published.",
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.previousServiceSlug,
        ),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.nextServiceSlug,
        ),
      ]),
    );

    // Defer public-path revalidation — updateTag handles dashboard cache.
    after(() => {
      revalidateServicePaths(result.nextSlug, result.nextServiceSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);
    });

    if (result.previousServiceSlug !== result.nextServiceSlug) {
      revalidateServicePaths(result.nextSlug, result.previousServiceSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);

      nextEditorPath = `${getBusinessServicePath(
        result.nextSlug,
        result.nextServiceSlug,
      )}?section=page`;
    }
  } catch (error) {
    console.error("Failed to update business inquiry page settings.", error);

    return {
      error: "We couldn't save the service page right now.",
    };
  }

  if (nextEditorPath) {
    redirect(nextEditorPath);
  }

  return {
    success: "Service page saved.",
  };
}

export async function updateServiceAction(
  serviceSlug: string,
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = serviceSettingsSchema.safeParse({
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
    const result = await updateServiceSettings({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      serviceSlug,
      values: validationResult.data,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.previousServiceSlug,
        ),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.nextServiceSlug,
        ),
      ]),
    );

    // Defer public-path revalidation — updateTag handles dashboard cache.
    after(() => {
      revalidateServicePaths(result.nextSlug, result.nextServiceSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);
    });

    if (result.previousServiceSlug !== result.nextServiceSlug) {
      revalidateServicePaths(result.nextSlug, result.previousServiceSlug);
      revalidateServicePaths(result.nextSlug, result.nextServiceSlug);
      revalidateBusinessDefaultInquiryPaths(result.nextSlug);
      nextEditorPath = getBusinessServicePath(
        result.nextSlug,
        result.nextServiceSlug,
      );
    }
  } catch (error) {
    console.error("Failed to update business service settings.", error);

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

export async function applyServicePresetAction(
  serviceSlug: string,
  _prevState: ServiceActionState,
  formData: FormData,
): Promise<ServiceActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = servicePresetSchema.safeParse({
    businessType: formData.get("businessType"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Choose a template and try again.",
    );
  }

  try {
    const result = await applyServicePreset({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      serviceSlug,
      values: validationResult.data,
    });

    if (!result.ok) {
      return {
        error: "That business could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(businessContext.business.id, serviceSlug),
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

export async function createServiceAction(
  _prevState: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = serviceCreateSchema.safeParse({
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
    const result = await createService({
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
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });
    editorPath = getBusinessServicePath(
      result.businessSlug,
      result.serviceSlug,
    );
  } catch (error) {
    console.error("Failed to create service.", error);

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

export async function duplicateServiceAction(
  _prevState: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = serviceTargetSchema.safeParse({
    targetServiceId: formData.get("targetServiceId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  let editorPath: string | null = null;

  try {
    const result = await duplicateService({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetServiceId: validationResult.data.targetServiceId,
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
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });
    editorPath = getBusinessServicePath(
      result.businessSlug,
      result.serviceSlug,
    );
  } catch (error) {
    console.error("Failed to duplicate service.", error);

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

export async function setDefaultServiceAction(
  _prevState: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = serviceTargetSchema.safeParse({
    targetServiceId: formData.get("targetServiceId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  try {
    const result = await setDefaultService({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetServiceId: validationResult.data.targetServiceId,
    });

    if (!result.ok) {
      if (result.reason === "invalid-target") {
        return {
          error: "Publish the service before making it the default.",
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });

    return {
      success: "Default service updated.",
    };
  } catch (error) {
    console.error("Failed to set default service.", error);

    return {
      error: "We couldn't change the default service right now.",
    };
  }
}

export async function archiveServiceAction(
  _prevState: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = serviceTargetSchema.safeParse({
    targetServiceId: formData.get("targetServiceId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a form and try again.");
  }

  try {
    const result = await archiveService({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetServiceId: validationResult.data.targetServiceId,
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
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });

    return {
      success: "Service archived.",
    };
  } catch (error) {
    console.error("Failed to archive service.", error);

    return {
      error: "We couldn't archive the service right now.",
    };
  }
}

export async function archiveServiceFromDetailAction(
  _prevState: ServiceDangerActionState,
  formData: FormData,
): Promise<ServiceDangerActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = serviceTargetSchema.safeParse({
    targetServiceId: formData.get("targetServiceId"),
  });

  if (!validationResult.success) {
    return {
      error: "That service could not be found.",
    };
  }

  try {
    const result = await archiveService({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetServiceId: validationResult.data.targetServiceId,
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
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });

    return {
      success: "Service archived.",
    };
  } catch (error) {
    console.error("Failed to archive service.", error);

    return {
      error: "We couldn't archive the service right now.",
    };
  }
}

export async function deleteServiceAction(
  _prevState: ServiceDangerActionState,
  formData: FormData,
): Promise<ServiceDangerActionState> {
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
  const validationResult = serviceTargetSchema.safeParse({
    targetServiceId: formData.get("targetServiceId"),
  });

  if (!validationResult.success) {
    return {
      error: "That service could not be found.",
    };
  }

  try {
    const result = await deleteService({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetServiceId: validationResult.data.targetServiceId,
    });

    if (!result.ok) {
      if (result.reason === "has-inquiries") {
        return {
          error:
            "This service still has inquiries. Archive the service instead, or delete all linked inquiries first.",
        };
      }

      if (result.reason === "has-analytics") {
        return {
          error:
            "This service still has page-view analytics. Archive the service instead to keep its history.",
        };
      }

      if (result.reason === "last-active") {
        return {
          error:
            "This is the last active service. Create another service before deleting this one.",
        };
      }

      if (result.reason === "invalid-target") {
        return {
          error: "Publish another service before deleting the default service.",
        };
      }

      return {
        error: "That service could not be found.",
      };
    }

    updateCacheTags(
      uniqueCacheTags([
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });
  } catch (error) {
    console.error("Failed to delete service.", error);

    return {
      error: "We couldn't delete the service right now.",
    };
  }

  if (redirectHref) {
    redirect(redirectHref);
  }

  return {
    success: "Service deleted.",
  };
}

export async function toggleServicePublicAction(
  _prevState: ServicesActionState,
  formData: FormData,
): Promise<ServicesActionState> {
  const ownerAccess = await getOwnerBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = serviceTargetSchema.safeParse({
    targetServiceId: formData.get("targetServiceId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  const publicInquiryEnabled = formData.get("publicInquiryEnabled") === "true";

  try {
    const result = await setServicePublicState({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetServiceId: validationResult.data.targetServiceId,
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
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });

    return {
      success: publicInquiryEnabled
        ? "Service published."
        : "Service unpublished.",
    };
  } catch (error) {
    console.error("Failed to toggle public service state.", error);

    return {
      error: "We couldn't update service availability right now.",
    };
  }
}

export async function unarchiveServiceAction(
  _prevState: ServiceDangerActionState,
  formData: FormData,
): Promise<ServiceDangerActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = serviceTargetSchema.safeParse({
    targetServiceId: formData.get("targetServiceId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a service and try again.");
  }

  try {
    const result = await unarchiveService({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      targetServiceId: validationResult.data.targetServiceId,
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
        ...getServicesCacheTags(businessContext.business.id),
        ...getServiceCacheTags(
          businessContext.business.id,
          result.serviceSlug,
        ),
      ]),
    );
    after(() => {
      revalidateServicePaths(result.businessSlug, result.serviceSlug);
      revalidateBusinessDefaultInquiryPaths(result.businessSlug);
    });

    return {
      success: "Service restored.",
    };
  } catch (error) {
    console.error("Failed to unarchive service.", error);

    return {
      error: "We couldn't unarchive the service right now.",
    };
  }
}
