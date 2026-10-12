import { makeCronRoute } from "@/lib/security/cron";
import { syncExpiredQuotesGlobal } from "@/features/quotes/mutations";

export const maxDuration = 30;

/**
 * Vercel Cron: Expire stale quotes whose validity date has passed.
 * Runs daily at 01:00 UTC. Replaces the Inngest `cron-expire-quotes` function.
 *
 * Simple UPDATE query — no Inngest step functions, no retry logic, completes in <10s.
 */
export const GET = makeCronRoute(syncExpiredQuotesGlobal);
