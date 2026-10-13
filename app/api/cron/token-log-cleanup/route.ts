import { cleanupTokenLogs } from "@/lib/ai/token-log-cleanup";
import { makeCronRoute } from "@/lib/security/cron";

export const maxDuration = 30;

/**
 * Vercel Cron: Clean up AI token logs older than 90 days.
 * Runs daily at 03:00 UTC. Replaces the Inngest `cron-token-log-cleanup` function.
 *
 * Simple DELETE query — no Inngest step functions, no retry logic, completes in <10s.
 */
export const GET = makeCronRoute(cleanupTokenLogs);
