import { expirePendingApprovals } from "@/features/approvals/mutations";
import { sendApprovalReminders } from "@/features/approvals/jobs";
import { makeCronRoute } from "@/lib/security/cron";

export const maxDuration = 60;

/**
 * Vercel Cron: expire stale approval versions (exact-row targeting, never a
 * newer version) and send per-recipe reminders. Runs daily at 04:00 UTC.
 */
export const GET = makeCronRoute(async () => {
  const [expiry, reminders] = await Promise.all([
    expirePendingApprovals(),
    sendApprovalReminders(),
  ]);
  return { expiry, reminders };
});
