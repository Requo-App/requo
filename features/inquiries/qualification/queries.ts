import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { inquiries } from "@/lib/db/schema";
import type { RecentInquiryInput } from "@/features/inquiries/qualification/types";

/**
 * Upper bound on the candidate set scanned for duplicates.
 *
 * The window bounds the time range, not the row count, so a customer who
 * submits repeatedly would otherwise make every new submission tokenize an
 * unbounded list on the public intake path.
 */
const duplicateCandidateLimit = 50;

/**
 * Fetch recent inquiries from the same email for duplicate detection.
 *
 * Returns inquiries from the same customerEmail for the same business
 * within the last `windowDays` days, excluding the current inquiry.
 */
export async function getRecentInquiriesForDuplicateCheck(input: {
  businessId: string;
  customerEmail: string;
  excludeInquiryId: string;
  windowDays: number;
}): Promise<RecentInquiryInput[]> {
  const { businessId, customerEmail, excludeInquiryId, windowDays } = input;

  const windowStart = new Date();
  windowStart.setDate(windowStart.getDate() - windowDays);

  const rows = await db
    .select({
      id: inquiries.id,
      details: inquiries.details,
      submittedAt: inquiries.submittedAt,
      customerEmail: inquiries.customerEmail,
    })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.businessId, businessId),
        // Case-insensitive on purpose: the comparison in
        // `duplicate-detection.ts` lowercases both sides, so a
        // case-sensitive SQL pre-filter would make that path unreachable
        // and silently under-report duplicates.
        sql`lower(${inquiries.customerEmail}) = lower(${customerEmail})`,
        ne(inquiries.id, excludeInquiryId),
        gte(inquiries.submittedAt, windowStart),
        isNull(inquiries.deletedAt),
      ),
    )
    .orderBy(desc(inquiries.submittedAt))
    .limit(duplicateCandidateLimit);

  return rows.map((row) => ({
    id: row.id,
    details: row.details,
    submittedAt: row.submittedAt,
    customerEmail: row.customerEmail!,
  }));
}
