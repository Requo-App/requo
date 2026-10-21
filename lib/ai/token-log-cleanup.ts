import "server-only";

import { lte, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aiTokenLogs } from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Token Log Cleanup — deletes ai_token_logs entries older than 90 days
//
// Runs daily via Vercel Cron at /api/cron/token-log-cleanup. Deletes in
// batches of 1000 rows per execution to avoid long-running transactions.
// ---------------------------------------------------------------------------

const RETENTION_DAYS = 90;
const BATCH_SIZE = 1000;

/** Upper bound on batches per run, so one execution cannot run unbounded. */
const MAX_BATCHES = 20;

export type TokenLogCleanupResult = {
  deletedRows: number;
};

/**
 * Deletes ai_token_logs entries older than 90 days.
 *
 * Runs in bounded batches until nothing is left to delete. A single batch per
 * day could not keep up with the write rate, so the backlog grew faster than
 * it drained and the 90-day retention promise silently failed.
 */
export async function cleanupTokenLogs(): Promise<TokenLogCleanupResult> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

  let deletedRows = 0;
  let batches = 0;

  for (;;) {
    // Find IDs of expired logs (batch limited to 1000)
    const expiredIds = await db
      .select({ id: aiTokenLogs.id })
      .from(aiTokenLogs)
      .where(lte(aiTokenLogs.createdAt, cutoffDate))
      .limit(BATCH_SIZE);

    if (expiredIds.length === 0) {
      break;
    }

    // Delete by IDs
    const idsToDelete = expiredIds.map((row) => row.id);
    await db.execute(
      sql`DELETE FROM ai_token_logs WHERE id = ANY(${idsToDelete})`,
    );

    deletedRows += idsToDelete.length;
    batches += 1;

    if (batches >= MAX_BATCHES) {
      console.warn(
        `[ai-token-log-cleanup] Reached the per-run batch cap (${MAX_BATCHES}); remaining rows are cleaned by the next run.`,
      );
      break;
    }
  }

  console.info(
    JSON.stringify({
      type: "token_log_cleanup",
      timestamp: new Date().toISOString(),
      deletedRows,
      batches,
      cutoffDate: cutoffDate.toISOString(),
    }),
  );

  return { deletedRows };
}