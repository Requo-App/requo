/**
 * scripts/backfill-analytics-rollups.ts
 *
 * Recomputes `analytics_daily_rollups` for a range of past days.
 *
 * The nightly job only ever rolls up yesterday, so a day it never reached —
 * and any day rolled up before a metric definition changed — keeps its old
 * numbers. The analytics page mixes rollup days with live days on one chart,
 * so those two have to count the same thing; this script brings the stored
 * days back in line with the current definitions.
 *
 * Idempotent: the job upserts on (businessId, date).
 *
 * Run: npx tsx scripts/backfill-analytics-rollups.ts --from=2026-07-01 --to=2026-09-30
 * Requires: DATABASE_URL (or the standard app env).
 */
import "./load-env";

import { computeDailyRollups } from "../features/analytics/jobs/rollup";
import { dbConnection } from "../lib/db/client";

function readFlag(name: string): string | undefined {
  const prefix = `--${name}=`;
  const found = process.argv.find((arg) => arg.startsWith(prefix));
  return found?.slice(prefix.length);
}

function addUtcDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

async function main() {
  const from = readFlag("from");
  const to = readFlag("to");

  if (!from || !to) {
    console.error(
      "Usage: npx tsx scripts/backfill-analytics-rollups.ts --from=YYYY-MM-DD --to=YYYY-MM-DD",
    );
    process.exitCode = 1;
    return;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error("--from and --to must both be YYYY-MM-DD.");
    process.exitCode = 1;
    return;
  }

  if (from > to) {
    console.error("--from must not be after --to.");
    process.exitCode = 1;
    return;
  }

  let day = from;
  let days = 0;
  while (day <= to) {
    const summary = await computeDailyRollups({ targetDate: day });
    days += 1;
    console.log(
      `[backfill-rollups] ${day}: ${summary.processed} processed, ${summary.failed} failed`,
    );
    day = addUtcDays(day, 1);
  }

  console.log(`[backfill-rollups] done: ${days} day(s) recomputed.`);
}

main()
  .catch((error) => {
    console.error("[backfill-rollups] failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbConnection.end();
  });
