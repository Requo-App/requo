"use server";

import { updateTag } from "next/cache";

import {
  getBusinessInquiryDetailCacheTags,
  getBusinessInquiryListCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import { getMemberBusinessActionContext } from "@/lib/db/business-access";
import { db } from "@/lib/db/client";
import { inquiryDuplicates } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * Dismiss a duplicate warning for an inquiry.
 *
 * Validates business access before allowing dismissal. Returns a failure
 * result instead of throwing, so the caller can surface a message rather
 * than an unhandled rejection.
 */
export async function dismissDuplicateWarningAction(
  duplicateId: string,
  businessId: string,
  inquiryId: string,
): Promise<{ error?: string }> {
  const memberAccess = await getMemberBusinessActionContext();

  if (!memberAccess.ok) {
    return { error: memberAccess.error };
  }

  const { user, businessContext } = memberAccess;

  // Ensure the user's active business matches the requested businessId
  if (businessContext.business.id !== businessId) {
    return { error: "You do not have access to that business action." };
  }

  await db
    .update(inquiryDuplicates)
    .set({
      dismissedAt: new Date(),
      dismissedBy: user.id,
    })
    .where(
      and(
        eq(inquiryDuplicates.id, duplicateId),
        eq(inquiryDuplicates.businessId, businessId),
        // Bind the duplicate to the inquiry it is being dismissed for, so a
        // caller cannot dismiss one record while invalidating another
        // inquiry's cache.
        eq(inquiryDuplicates.inquiryId, inquiryId),
      ),
    );

  const tags = uniqueCacheTags([
    ...getBusinessInquiryDetailCacheTags(businessId, inquiryId),
    ...getBusinessInquiryListCacheTags(businessId),
  ]);
  for (const tag of tags) {
    updateTag(tag);
  }

  return {};
}
