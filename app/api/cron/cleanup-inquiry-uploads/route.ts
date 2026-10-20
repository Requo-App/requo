import { cleanupOrphanedInquiryAttachments } from "@/features/inquiries/attachment-cleanup";
import { makeCronRoute } from "@/lib/security/cron";

export const maxDuration = 30;

/**
 * Vercel Cron: Remove inquiry attachment uploads that were never attached
 * to an inquiry.
 *
 * Runs daily at 04:00 UTC. A visitor who uploads a file and then abandons
 * the form leaves the object in storage; this sweep collects them.
 */
export const GET = makeCronRoute(cleanupOrphanedInquiryAttachments);
