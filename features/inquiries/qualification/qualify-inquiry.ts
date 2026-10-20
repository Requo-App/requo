import "server-only";

import { db } from "@/lib/db/client";
import { inquiryDuplicates } from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

import {
  findEmailRecencyDuplicate,
  findTextSimilarityDuplicate,
} from "./duplicate-detection";
import { getRecentInquiriesForDuplicateCheck } from "./queries";
import type {
  DuplicateFlag,
  InquiryQualificationInput,
  QualificationOutput,
} from "./types";

/**
 * Runs duplicate detection for an inquiry.
 *
 * Steps:
 * 1. Fetch recent inquiries from same email for duplicate detection
 * 2. Run duplicate detection (email recency + text similarity)
 * 3. Persist duplicate flag to the database if found
 * 4. Return the result
 *
 * Wrapped in try/catch so failures never block inquiry creation.
 */
export async function qualifyInquiry(input: {
  inquiryId: string;
  businessId: string;
  inquiry: InquiryQualificationInput;
}): Promise<QualificationOutput> {
  const { inquiryId, businessId, inquiry } = input;

  try {
    // 1. Fetch recent inquiries for duplicate detection (skip if no email)
    const recentInquiries = inquiry.customerEmail
      ? await getRecentInquiriesForDuplicateCheck({
          businessId,
          customerEmail: inquiry.customerEmail,
          excludeInquiryId: inquiryId,
          windowDays: 30,
        })
      : [];

    // 2. Run duplicate detection
    const duplicate = detectDuplicate(inquiry, recentInquiries);

    // 3. Persist duplicate flag if found
    if (duplicate) {
      // `inquiry_duplicates` has a unique index on `inquiry_id`. Without
      // this guard a second qualification for the same inquiry threw, and
      // the catch below reported "no duplicate found" for a record that
      // does have one.
      await db
        .insert(inquiryDuplicates)
        .values({
          id: newEntityId(),
          businessId,
          inquiryId,
          originalInquiryId: duplicate.originalInquiryId,
          reason: duplicate.reason,
          tokenOverlap: duplicate.tokenOverlap
            ? Math.round(duplicate.tokenOverlap)
            : null,
        })
        .onConflictDoNothing();
    }

    // 4. Return the result
    return { duplicate };
  } catch (error) {
    console.error("Inquiry duplicate detection failed:", {
      inquiryId,
      businessId,
      error,
    });

    return { duplicate: null };
  }
}

/**
 * Runs both duplicate detection checks and combines results into a single
 * DuplicateFlag if either matches.
 *
 * Important: same customer/email alone is NOT enough to flag a duplicate.
 * The email recency check is only used to strengthen a text similarity match.
 * A duplicate requires similar content (text overlap > threshold).
 */
function detectDuplicate(
  inquiry: InquiryQualificationInput,
  recentInquiries: { id: string; details: string; submittedAt: Date; customerEmail: string }[],
): DuplicateFlag | null {
  const emailDuplicateId = findEmailRecencyDuplicate(
    inquiry.customerEmail,
    recentInquiries,
    inquiry.submittedAt,
  );

  const textDuplicate = findTextSimilarityDuplicate(
    inquiry.details,
    inquiry.customerEmail,
    recentInquiries,
    inquiry.submittedAt,
  );

  if (!textDuplicate) {
    // No content similarity — never flag as duplicate regardless of email recency.
    // Same customer submitting a different inquiry is not a duplicate.
    return null;
  }

  // Content is similar — determine if email recency also matched for a stronger signal
  if (emailDuplicateId) {
    return {
      originalInquiryId: emailDuplicateId,
      reason: "both",
      tokenOverlap: textDuplicate.overlap,
    };
  }

  return {
    originalInquiryId: textDuplicate.inquiryId,
    reason: "text_similarity",
    tokenOverlap: textDuplicate.overlap,
  };
}
