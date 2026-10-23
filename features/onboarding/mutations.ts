import "server-only";

import { eq } from "drizzle-orm";

import type { StarterWorkflowKey } from "@/features/businesses/starter-workflows";
import { createBusinessRecordForUser } from "@/features/businesses/mutations";
import type { BusinessType } from "@/features/inquiries/business-types";
import type { InquiryFormConfig } from "@/features/inquiries/form-config";
import { joinFullName } from "@/features/account/name";
import { ensureProfileForUser } from "@/lib/auth/business-bootstrap";
import { db } from "@/lib/db/client";
import { profiles } from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

type CompleteOnboardingForUserInput = {
  user: {
    id: string;
    name: string;
    email: string;
  };
  firstName: string;
  lastName: string;
  jobTitle?: string;
  companySize?: string;
  referralSource?: string;
  businessName: string;
  businessSlug?: string;
  businessType: BusinessType;
  starterWorkflow: StarterWorkflowKey;
  countryCode: string;
  defaultCurrency: string;
  /** Billing-market currency detected for the visitor. */
  billingCurrency?: string | null;
  customerContactChannel: string;
  /**
   * Named services from onboarding. Business creation trims them to the
   * resolved plan's live limit after trial eligibility is known.
   */
  services?: Array<{ name: string }>;
  inquiryFormConfigOverride?: InquiryFormConfig;
  avatarUpload?: { storagePath: string; contentType: string } | null;
};

export async function completeOnboardingForUser({
  user,
  firstName,
  lastName,
  jobTitle,
  companySize,
  referralSource,
  businessName,
  businessSlug,
  businessType,
  starterWorkflow,
  countryCode,
  defaultCurrency,
  billingCurrency,
  customerContactChannel,
  services,
  inquiryFormConfigOverride,
  avatarUpload,
}: CompleteOnboardingForUserInput) {
  await ensureProfileForUser(user);

  const now = new Date();
  const trimmedLastName = lastName.trim();
  const fullName = joinFullName(firstName, trimmedLastName);

  return db.transaction(async (tx) => {
    await tx
      .update(profiles)
      .set({
        fullName,
        firstName: firstName.trim(),
        lastName: trimmedLastName ? trimmedLastName : null,
        ...(jobTitle ? { jobTitle } : {}),
        ...(companySize ? { companySize } : {}),
        ...(referralSource ? { referralSource } : {}),
        ...(avatarUpload
          ? {
              avatarStoragePath: avatarUpload.storagePath,
              avatarContentType: avatarUpload.contentType,
            }
          : {}),
        onboardingCompletedAt: now,
        updatedAt: now,
      })
      .where(eq(profiles.userId, user.id));

    // New businesses always start on Free here. `createBusinessRecordForUser`
    // upgrades the owner's first active business to a Pro trial, and applies
    // the matching service limit and page defaults.
    return createBusinessRecordForUser({
      tx,
      businessId: newEntityId(),
      defaultCurrency,
      billingCurrency,
      countryCode,
      user,
      name: businessName,
      preferredSlug: businessSlug,
      businessType,
      starterWorkflow,
      shortDescription: null,
      customerContactChannel,
      onboardingServices: services,
      inquiryFormConfigOverride,
      plan: "free",
      activitySource: "onboarding",
      activitySummary: "Business created during onboarding.",
      now,
    });
  });
}
