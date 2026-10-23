"use server";

import { revalidatePath, updateTag } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getValidationActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { detectDisplayCurrency } from "@/lib/billing/region";
import { newEntityId } from "@/lib/ids";
import {
  getBusinessAnalyticsCacheTags,
  getServicesCacheTags,
  getBusinessInquiryListCacheTags,
  getBusinessMembersCacheTags,
  getBusinessOverviewCacheTags,
  getBusinessQuoteListCacheTags,
  getBusinessSettingsCacheTags,
  getPublicBusinessProfileCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import { getBusinessActionContext } from "@/lib/db/business-access";
import {
  getUserBusinessContextCacheTags,
  getUserMembershipsCacheTags,
} from "@/lib/cache/shell-tags";
import {
  archiveBusiness,
  createBusinessForUser,
  deleteBusinessPermanently,
  restoreBusiness,
  trashBusiness,
  unarchiveBusiness,
} from "@/features/businesses/mutations";
import { unlockBusinessIfAllowed } from "@/features/businesses/plan-enforcement";
import {
  getBusinessQuotaExceededMessage,
  getBusinessQuotaForUser,
  isBusinessQuotaExceededError,
} from "@/features/businesses/quota";
import { recordRecentlyOpenedBusiness } from "@/features/businesses/recently-opened";
import {
  createBusinessSchema,
  parseBusinessServiceNames,
  recentlyOpenedBusinessSchema,
} from "@/features/businesses/schemas";
import {
  activeBusinessSlugCookieName,
  homePath,
  getBusinessHomePath,
  getBusinessServicesPath,
  getBusinessPath,
  getBusinessSettingsPath,
} from "@/features/businesses/routes";
import type {
  BusinessRecordActionState,
  CreateBusinessActionState,
} from "@/features/businesses/types";

const initialCreateState: CreateBusinessActionState = {};
const initialBusinessRecordState: BusinessRecordActionState = {};

function isMismatchedLifecycleTarget(
  requestedBusinessId: string,
  scopedBusinessId: string,
): boolean {
  return requestedBusinessId !== scopedBusinessId;
}

function mismatchedLifecycleResponse(): BusinessRecordActionState {
  return {
    error: "That business could not be found.",
  };
}

function updateBusinessCacheTags(businessId: string) {
  for (const tag of uniqueCacheTags([
    ...getBusinessSettingsCacheTags(businessId),
    ...getBusinessMembersCacheTags(businessId),
    ...getServicesCacheTags(businessId),
    ...getBusinessInquiryListCacheTags(businessId),
    ...getBusinessQuoteListCacheTags(businessId),
    ...getBusinessAnalyticsCacheTags(businessId),
    ...getBusinessOverviewCacheTags(businessId),
  ])) {
    updateTag(tag);
  }
}

function updatePublicBusinessProfileCacheTags(businessSlug: string) {
  for (const tag of getPublicBusinessProfileCacheTags(businessSlug)) {
    updateTag(tag);
  }
}

function updateUserBusinessMembershipCacheTags({
  userId,
  businessSlug,
}: {
  userId: string;
  businessSlug: string;
}) {
  for (const tag of uniqueCacheTags([
    ...getUserMembershipsCacheTags(userId),
    ...getUserBusinessContextCacheTags(userId, businessSlug),
  ])) {
    updateTag(tag);
  }
}

function revalidateBusinessLifecyclePaths({
  businessSlug,
}: {
  businessSlug: string;
}) {
  revalidatePath(homePath);
  revalidatePath(getBusinessPath(businessSlug));
  revalidatePath(getBusinessSettingsPath(businessSlug));
  revalidatePath(getBusinessHomePath(businessSlug), "layout");
  revalidatePath(getBusinessSettingsPath(businessSlug, "general"));
  revalidatePath(getBusinessServicesPath(businessSlug));
  revalidatePath(`/inquire/${businessSlug}`);
}

async function clearActiveBusinessCookieIfNeeded(businessSlug: string) {
  const cookieStore = await cookies();

  if (cookieStore.get(activeBusinessSlugCookieName)?.value === businessSlug) {
    cookieStore.delete(activeBusinessSlugCookieName);
  }
}

export async function recordRecentlyOpenedBusinessAction(
  businessSlug: string,
): Promise<{ ok: boolean }> {
  const validationResult = recentlyOpenedBusinessSchema.safeParse({
    businessSlug,
  });

  if (!validationResult.success) {
    return { ok: false };
  }

  const access = await getBusinessActionContext({
    businessSlug: validationResult.data.businessSlug,
    minimumRole: "staff",
  });

  if (!access.ok) {
    return { ok: false };
  }

  try {
    await recordRecentlyOpenedBusiness({
      businessId: access.businessContext.business.id,
      userId: access.user.id,
    });
    revalidatePath(homePath);

    return { ok: true };
  } catch (error) {
    console.error("Failed to record recently opened business.", error);

    return { ok: false };
  }
}

export async function createBusinessAction(
  prevState: CreateBusinessActionState = initialCreateState,
  formData: FormData,
): Promise<CreateBusinessActionState> {
  void prevState;

  const user = await requireUser();
  const validationResult = createBusinessSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    countryCode: formData.get("countryCode"),
    businessType: formData.get("businessType"),
    defaultCurrency: formData.get("defaultCurrency"),
    // Accepted for backward compatibility with existing forms but never
    // trusted: the primary key is always server-generated below to prevent
    // ID squatting and collision probing.
    businessId: formData.get("businessId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the highlighted fields and try again.",
    );
  }

  const businessAllowance = await getBusinessQuotaForUser({
    ownerUserId: user.id,
  });

  if (!businessAllowance.allowed) {
    return {
      error: getBusinessQuotaExceededMessage(businessAllowance),
    };
  }

  let redirectPath: string | null = null;

  try {
    const business = await createBusinessForUser({
      user,
      businessId: newEntityId(),
      defaultCurrency: validationResult.data.defaultCurrency,
      billingCurrency: await detectDisplayCurrency(),
      name: validationResult.data.name,
      preferredSlug: validationResult.data.slug,
      countryCode: validationResult.data.countryCode,
      businessType: validationResult.data.businessType,
      onboardingServices: parseBusinessServiceNames(formData.get("services")),
    });

    updateUserBusinessMembershipCacheTags({
      userId: user.id,
      businessSlug: business.slug,
    });
    // Invalidate any cached null under this slug so the newly created
    // public profile page starts serving fresh. Covers the edge case
    // where `/b/<slug>` was visited before the business existed and
    // the null was cached by the two-layer query.
    updatePublicBusinessProfileCacheTags(business.slug);
    revalidatePath(homePath);
    redirectPath = getBusinessHomePath(business.slug);
  } catch (error) {
    if (isBusinessQuotaExceededError(error)) {
      return {
        error: getBusinessQuotaExceededMessage(error.quota),
      };
    }

    console.error("Failed to create business.", error);

    return {
      error: "We couldn't create that business right now.",
    };
  }

  if (redirectPath) {
    redirect(redirectPath);
  }

  return {
    error: "We couldn't create that business right now.",
  };
}

export async function archiveBusinessAction(
  businessId: string,
  businessSlug: string,
  _prevState: BusinessRecordActionState = initialBusinessRecordState,
  _formData: FormData,
): Promise<BusinessRecordActionState> {
  void _prevState;
  void _formData;

  const ownerAccess = await getBusinessActionContext({
    businessSlug,
    minimumRole: "owner",
    unauthorizedMessage: "Only the business owner can do that.",
  });

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  return archiveScopedBusiness(
    ownerAccess.user.id,
    ownerAccess.businessContext.business.id,
    businessSlug,
  );
}

async function archiveScopedBusiness(
  actorUserId: string,
  scopedBusinessId: string,
  businessSlug: string,
): Promise<BusinessRecordActionState> {
  try {
    const result = await archiveBusiness({
      businessId: scopedBusinessId,
      actorUserId,
    });

    if (!result.ok) {
      if (result.reason === "trash-required") {
        return {
          error: "Restore this business from trash before archiving it again.",
        };
      }

      if (result.reason === "already-archived") {
        return {
          success: "Business archived.",
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    await clearActiveBusinessCookieIfNeeded(businessSlug);
    updateBusinessCacheTags(scopedBusinessId);
    updatePublicBusinessProfileCacheTags(result.businessSlug);
    revalidateBusinessLifecyclePaths({
      businessSlug: result.businessSlug,
    });

    return {
      success: "Business archived.",
    };
  } catch (error) {
    console.error("Failed to archive business.", error);

    return {
      error: "We couldn't archive the business right now.",
    };
  }
}

export async function unarchiveBusinessAction(
  businessId: string,
  businessSlug: string,
  _prevState: BusinessRecordActionState = initialBusinessRecordState,
  _formData: FormData,
): Promise<BusinessRecordActionState> {
  void _prevState;
  void _formData;

  const ownerAccess = await getBusinessActionContext({
    businessSlug,
    minimumRole: "owner",
    unauthorizedMessage: "Only the business owner can do that.",
  });

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  if (
    isMismatchedLifecycleTarget(
      businessId,
      ownerAccess.businessContext.business.id,
    )
  ) {
    return mismatchedLifecycleResponse();
  }

  try {
    const result = await unarchiveBusiness({
      businessId: ownerAccess.businessContext.business.id,
      actorUserId: ownerAccess.user.id,
    });

    if (!result.ok) {
      if (result.reason === "already-active") {
        return {
          success: "Business restored to active.",
        };
      }

      if (result.reason === "trash-required") {
        return {
          error: "Use restore to bring this business back from trash.",
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    updateBusinessCacheTags(ownerAccess.businessContext.business.id);
    updatePublicBusinessProfileCacheTags(result.businessSlug);
    revalidateBusinessLifecyclePaths({
      businessSlug: result.businessSlug,
    });

    return {
      success: "Business restored to active.",
    };
  } catch (error) {
    console.error("Failed to restore archived business.", error);

    return {
      error: "We couldn't restore the business right now.",
    };
  }
}

export async function trashBusinessAction(
  businessId: string,
  businessSlug: string,
  _prevState: BusinessRecordActionState = initialBusinessRecordState,
  formData: FormData,
): Promise<BusinessRecordActionState> {
  void _prevState;

  const ownerAccess = await getBusinessActionContext({
    businessSlug,
    minimumRole: "owner",
    unauthorizedMessage: "Only the business owner can do that.",
  });

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  if (
    isMismatchedLifecycleTarget(
      businessId,
      ownerAccess.businessContext.business.id,
    )
  ) {
    return mismatchedLifecycleResponse();
  }

  const confirmationValue = formData.get("confirmation");
  const confirmation =
    typeof confirmationValue === "string" && confirmationValue.trim().length > 0
      ? confirmationValue
      : null;

  try {
    const result = await trashBusiness({
      businessId: ownerAccess.businessContext.business.id,
      actorUserId: ownerAccess.user.id,
      confirmation,
    });

    if (!result.ok) {
      if (result.reason === "confirmation-mismatch") {
        return {
          error: "Type the exact business name to move it to trash.",
          fieldErrors: {
            confirmation: ["This does not match the business name."],
          },
        };
      }

      if (result.reason === "already-trash") {
        return {
          success: "Business moved to trash.",
        };
      }

      if (result.reason === "last-active") {
        return {
          error: "Keep at least one active business.",
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    await clearActiveBusinessCookieIfNeeded(businessSlug);
    updateBusinessCacheTags(ownerAccess.businessContext.business.id);
    updatePublicBusinessProfileCacheTags(result.businessSlug);
    revalidateBusinessLifecyclePaths({
      businessSlug: result.businessSlug,
    });

    return {
      success: "Business moved to trash.",
    };
  } catch (error) {
    console.error("Failed to move business to trash.", error);

    return {
      error: "We couldn't move the business to trash right now.",
    };
  }
}

export async function restoreBusinessAction(
  businessId: string,
  businessSlug: string,
  _prevState: BusinessRecordActionState = initialBusinessRecordState,
  _formData: FormData,
): Promise<BusinessRecordActionState> {
  void _prevState;
  void _formData;

  const ownerAccess = await getBusinessActionContext({
    businessSlug,
    minimumRole: "owner",
    unauthorizedMessage: "Only the business owner can do that.",
  });

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  if (
    isMismatchedLifecycleTarget(
      businessId,
      ownerAccess.businessContext.business.id,
    )
  ) {
    return mismatchedLifecycleResponse();
  }

  try {
    const result = await restoreBusiness({
      businessId: ownerAccess.businessContext.business.id,
      actorUserId: ownerAccess.user.id,
    });

    if (!result.ok) {
      if (result.reason === "already-active") {
        return {
          success: "Business restored.",
        };
      }

      return {
        error: "That business could not be found.",
      };
    }

    updateBusinessCacheTags(ownerAccess.businessContext.business.id);
    updatePublicBusinessProfileCacheTags(result.businessSlug);
    revalidateBusinessLifecyclePaths({
      businessSlug: result.businessSlug,
    });

    return {
      success: "Business restored.",
    };
  } catch (error) {
    console.error("Failed to restore business from trash.", error);

    return {
      error: "We couldn't restore the business right now.",
    };
  }
}

export async function deleteBusinessPermanentlyAction(
  businessId: string,
  businessSlug: string,
  _prevState: BusinessRecordActionState = initialBusinessRecordState,
  formData: FormData,
): Promise<BusinessRecordActionState> {
  void _prevState;

  const ownerAccess = await getBusinessActionContext({
    businessSlug,
    minimumRole: "owner",
    unauthorizedMessage: "Only the business owner can do that.",
  });

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  if (
    isMismatchedLifecycleTarget(
      businessId,
      ownerAccess.businessContext.business.id,
    )
  ) {
    return mismatchedLifecycleResponse();
  }

  const confirmation =
    typeof formData.get("confirmation") === "string"
      ? (formData.get("confirmation") as string)
      : "";

  if (!confirmation.trim()) {
    return {
      error: "Type the business name to confirm deletion.",
      fieldErrors: { confirmation: ["Type the business name to confirm."] },
    };
  }

  try {
    const result = await deleteBusinessPermanently({
      businessId: ownerAccess.businessContext.business.id,
      actorUserId: ownerAccess.user.id,
      confirmation,
    });

    if (!result.ok) {
      if (result.reason === "confirmation-mismatch") {
        return {
          error: "Type the exact business name to confirm deletion.",
          fieldErrors: {
            confirmation: ["This does not match the business name."],
          },
        };
      }

      return { error: "That business could not be found." };
    }

    await clearActiveBusinessCookieIfNeeded(businessSlug);
    updateUserBusinessMembershipCacheTags({
      userId: ownerAccess.user.id,
      businessSlug,
    });

    return { success: "Business permanently deleted." };
  } catch (error) {
    console.error("Failed to permanently delete business.", error);
    return { error: "We couldn't delete the business right now." };
  }
}

export async function unlockBusinessAction(
  businessId: string,
  businessSlug: string,
  _formData: FormData,
): Promise<BusinessRecordActionState> {
  void _formData;

  const ownerAccess = await getBusinessActionContext({
    businessSlug,
    minimumRole: "owner",
    requireActiveBusiness: false,
    unauthorizedMessage: "Only the business owner can do that.",
  });

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  if (
    isMismatchedLifecycleTarget(
      businessId,
      ownerAccess.businessContext.business.id,
    )
  ) {
    return mismatchedLifecycleResponse();
  }

  try {
    const result = await unlockBusinessIfAllowed({
      businessId: ownerAccess.businessContext.business.id,
      ownerUserId: ownerAccess.user.id,
      actorUserId: ownerAccess.user.id,
    });

    if (!result.ok) {
      if (result.reason === "active_business_limit_reached") {
        return {
          error: "You already have an active Free business. Unlock a paid business instead, or archive a Free business first.",
        };
      }

      return {
        error: "That business could not be unlocked.",
      };
    }

    updateBusinessCacheTags(ownerAccess.businessContext.business.id);
    updatePublicBusinessProfileCacheTags(businessSlug);
    revalidateBusinessLifecyclePaths({
      businessSlug,
    });

    return {
      success: "Business unlocked.",
    };
  } catch (error) {
    console.error("Failed to unlock business.", error);

    return {
      error: "We couldn't unlock this business right now.",
    };
  }
}

export async function unlockBusinessFromHubAction(
  businessId: string,
  businessSlug: string,
  formData: FormData,
): Promise<void> {
  await unlockBusinessAction(businessId, businessSlug, formData);
}
