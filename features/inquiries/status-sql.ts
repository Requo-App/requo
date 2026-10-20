import { sql } from "drizzle-orm";

import type {
  InquiryRecordState,
  InquiryStatus,
} from "@/features/inquiries/types";
import { inquiries } from "@/lib/db/schema";

/**
 * The status an inquiry *has*, as opposed to the status it is *stored* as.
 *
 * A stored `new` becomes `waiting` after 48 hours, and any open inquiry
 * with a past deadline reads as `overdue`. Every surface that shows a
 * status must use this expression — including the status-change mutation,
 * otherwise the UI and the mutation disagree about what "the current
 * status" is.
 */
export const getEffectiveInquiryStatus = sql<InquiryStatus>`case
  when ${inquiries.status} in ('new', 'waiting', 'quoted') and ${inquiries.requestedDeadline} is not null and ${inquiries.requestedDeadline} < current_date then 'overdue'
  when ${inquiries.status} in ('new', 'waiting') and ${inquiries.submittedAt} >= now() - interval '48 hours' then 'new'
  when ${inquiries.status} in ('new', 'waiting') and ${inquiries.submittedAt} < now() - interval '48 hours' then 'waiting'
  else ${inquiries.status}::text
end`;

/**
 * Whether the record is in the active list or the archived one. Archiving
 * writes `archivedAt`, never the status column.
 */
export const getInquiryRecordState = sql<InquiryRecordState>`case
  when ${inquiries.archivedAt} is not null then 'archived'
  else 'active'
end`;
