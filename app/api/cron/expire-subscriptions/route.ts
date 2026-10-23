import { processExpiredSubscriptions } from "@/lib/billing/jobs/expire-subscriptions";
import { makeCronRoute } from "@/lib/security/cron";

export const maxDuration = 30;

/**
 * Vercel Cron: Expire canceled subscriptions past their period end, past-due
 * subscriptions past the grace window, and Pro trials past `trialEndsAt`.
 * Runs daily at 02:00 UTC. Replaces the Inngest `cron-expire-subscriptions` function.
 *
 * Simple UPDATE query — no Inngest step functions, no retry logic, completes in <5s.
 */
export const GET = makeCronRoute(processExpiredSubscriptions);
