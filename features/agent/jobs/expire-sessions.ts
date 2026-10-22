import {
  expireAbandonedSessions,
  purgeOrphanAgentTranscripts,
} from "@/features/agent/session-service";

export type ExpireAgentSessionsSummary = {
  expired: number;
  purged: number;
};

/**
 * Marks active agent sessions whose `expires_at` has passed as "abandoned",
 * and purges transcripts that never produced an inquiry after 30 days.
 * Called hourly by the Inngest cron.
 */
export async function processExpireAgentSessions(): Promise<ExpireAgentSessionsSummary> {
  const [expired, purged] = await Promise.all([
    expireAbandonedSessions(),
    purgeOrphanAgentTranscripts(30),
  ]);
  return { expired, purged };
}
