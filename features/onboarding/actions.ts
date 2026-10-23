"use server";

import { revalidatePath, updateTag } from "next/cache";
import { redirect } from "next/navigation";

import { getValidationActionState } from "@/lib/action-state";
import { requireUser } from "@/lib/auth/session";
import { detectDisplayCurrency } from "@/lib/billing/region";
import { uniqueCacheTags } from "@/lib/cache/business-tags";
import {
  getUserBusinessContextCacheTags,
  getUserMembershipsCacheTags,
  getUserProfileCacheTags,
} from "@/lib/cache/shell-tags";
import {
  getBusinessQuotaExceededMessage,
  isBusinessQuotaExceededError,
} from "@/features/businesses/quota";
import {
  homePath,
  getBusinessHomePath,
} from "@/features/businesses/routes";
import {
  inquiryFormConfigSchema,
  type InquiryFormConfig,
} from "@/features/inquiries/form-config";
import { completeOnboardingForUser } from "@/features/onboarding/mutations";
import { parseOnboardingServices } from "@/features/onboarding/schemas";
import { completeOnboardingSchema } from "@/features/onboarding/schemas";
import type { OnboardingActionState } from "@/features/onboarding/types";
import { isSingleTokenName } from "@/features/account/name";
import { db } from "@/lib/db/client";
import { account, profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import {
  profileAvatarBucket,
  profileAvatarExtensionToMimeType,
  profileAvatarAllowedExtensions,
  profileAvatarAllowedMimeTypes,
  profileAvatarMaxSize,
  sanitizeProfileAvatarFileName,
} from "@/features/account/utils";
import { isAcceptedFileType, resolveSafeContentType } from "@/lib/files";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const initialState: OnboardingActionState = {};

function parseInquiryFormConfigOverride(
  raw: FormDataEntryValue | null,
): InquiryFormConfig | undefined {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw);
    const result = inquiryFormConfigSchema.safeParse(parsed);

    return result.success ? (result.data as InquiryFormConfig) : undefined;
  } catch {
    return undefined;
  }
}

function updateOnboardingCacheTags({
  userId,
  businessSlug,
}: {
  userId: string;
  businessSlug: string;
}) {
  for (const tag of uniqueCacheTags([
    ...getUserProfileCacheTags(userId),
    ...getUserMembershipsCacheTags(userId),
    ...getUserBusinessContextCacheTags(userId, businessSlug),
  ])) {
    updateTag(tag);
  }
}

export async function completeOnboardingAction(
  prevState: OnboardingActionState = initialState,
  formData: FormData,
): Promise<OnboardingActionState> {
  void prevState;

  const user = await requireUser();
  const validationResult = completeOnboardingSchema.safeParse({
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    businessName: formData.get("businessName"),
    businessSlug: formData.get("businessSlug"),
    businessType: formData.get("businessType"),
    countryCode: formData.get("countryCode"),
    defaultCurrency: formData.get("defaultCurrency"),
    customerContactChannel: formData.get("customerContactChannel"),
    starterWorkflow: formData.get("starterWorkflow"),
    jobTitle: formData.get("jobTitle") || undefined,
    companySize: formData.get("companySize") || undefined,
    referralSource: formData.get("referralSource") || undefined,
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the highlighted details and try again.",
    );
  }

  // Last name is required except for the auto-skip: a user whose auth name is
  // a single token (e.g. Google mononym "Madonna") with no stored last name
  // and a Google-linked account may proceed with first name only.
  if (!validationResult.data.lastName.trim()) {
    const [existingProfile, googleAccount] = await Promise.all([
      db
        .select({ lastName: profiles.lastName })
        .from(profiles)
        .where(eq(profiles.userId, user.id))
        .limit(1)
        .then((rows) => rows[0] ?? null),
      db
        .select({ providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, user.id))
        .limit(10)
        .then((rows) =>
          rows.some((row) => row.providerId === "google"),
        )
        .catch(() => false),
    ]);

    const storedLastName = (existingProfile?.lastName ?? "").trim();
    const eligibleForSkip =
      storedLastName === "" &&
      isSingleTokenName(user.name) &&
      googleAccount;

    if (!eligibleForSkip) {
      return {
        error: "Check the highlighted details and try again.",
        fieldErrors: {
          lastName: ["Enter your last name."],
        },
      };
    }
  }

  const inquiryFormConfigOverride = parseInquiryFormConfigOverride(
    formData.get("inquiryFormConfigOverride"),
  );

  // Named services from step 3 (JSON blob, mirrors the
  // inquiryFormConfigOverride parsing pattern). Per-row validation; invalid
  // rows are dropped, and the caller trims to the plan's live-service limit.
  const rawServices = parseOnboardingServices(formData.get("services"));

  // Handle avatar upload
  const avatarFile = formData.get("avatar");
  let avatarUpload: { storagePath: string; contentType: string } | null = null;

  if (avatarFile instanceof File && avatarFile.size > 0 && avatarFile.name.trim()) {
    if (avatarFile.size > profileAvatarMaxSize) {
      return { error: "Profile photo must be under 2 MB." };
    }

    if (
      !isAcceptedFileType(avatarFile, {
        allowedExtensions: profileAvatarAllowedExtensions,
        allowedMimeTypes: profileAvatarAllowedMimeTypes,
      })
    ) {
      return { error: "Upload a JPG, PNG, or WEBP profile photo." };
    }

    const contentType = resolveSafeContentType(avatarFile, {
      extensionToMimeType: profileAvatarExtensionToMimeType,
      fallback: "application/octet-stream",
    });
    const storagePath = `${user.id}/avatar/onboarding-${crypto.randomUUID()}-${sanitizeProfileAvatarFileName(avatarFile.name)}`;
    const storageClient = createSupabaseAdminClient();

    const { error: uploadError } = await storageClient.storage
      .from(profileAvatarBucket)
      .upload(storagePath, avatarFile, {
        contentType,
        upsert: false,
      });

    if (uploadError) {
      console.error("Failed to upload onboarding avatar.", uploadError);
      return { error: "We couldn't upload your profile photo right now." };
    }

    avatarUpload = { storagePath, contentType };
  }

  let redirectPath: string | null = null;

  try {
    const business = await completeOnboardingForUser({
      user,
      firstName: validationResult.data.firstName,
      lastName: validationResult.data.lastName,
      jobTitle: validationResult.data.jobTitle,
      companySize: validationResult.data.companySize,
      referralSource: validationResult.data.referralSource,
      businessName: validationResult.data.businessName,
      businessSlug: validationResult.data.businessSlug,
      businessType: validationResult.data.businessType,
      countryCode: validationResult.data.countryCode,
      defaultCurrency: validationResult.data.defaultCurrency,
      billingCurrency: await detectDisplayCurrency(),
      customerContactChannel: validationResult.data.customerContactChannel,
      starterWorkflow: validationResult.data.starterWorkflow,
      services: rawServices,
      inquiryFormConfigOverride,
      avatarUpload,
    });

    updateOnboardingCacheTags({
      userId: user.id,
      businessSlug: business.slug,
    });
    revalidatePath(homePath);
    redirectPath = getBusinessHomePath(business.slug);
  } catch (error) {
    if (isBusinessQuotaExceededError(error)) {
      return {
        error: getBusinessQuotaExceededMessage(error.quota),
      };
    }

    console.error("Failed to complete onboarding.", error);

    return {
      error: "We couldn't finish setting up your business right now.",
    };
  }

  if (redirectPath) {
    redirect(redirectPath);
  }

  return {
    error: "We couldn't finish setting up your business right now.",
  };
}
