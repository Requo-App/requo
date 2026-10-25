import "server-only";

import { eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { aiCapacityCounters } from "@/lib/db/schema";
import {
  belongsToNewerWindow,
  type CacheReservationCounter,
} from "@/lib/ai/cache-layer";

// ---------------------------------------------------------------------------
// Durable provider-capacity store
//
// Provider free-tier allowances are a hard limit: two application instances
// must not both dispatch the last request in a bucket. Redis is optional, so
// the authority for these counters is Postgres.
//
// Every reservation and settlement runs in one transaction under per-key
// advisory locks. Keys are locked in sorted order, so concurrent reservations
// cannot deadlock across a shared provider bucket. Missing rows do not need a
// separate insert race guard: the advisory lock serialises both the read and
// the write for that key.
//
// Redis capacity counters remain the selector's best-effort mirror. They make
// routing smarter when available; they are never the hard gate.
// ---------------------------------------------------------------------------

export type DurableCapacityReservationResult =
  | { ok: true }
  | {
      ok: false;
      key: string;
      /** The store itself failed; the refusal is not a proven limit. */
      unavailable?: boolean;
    };

type CounterWindow = {
  amount: number;
  limit: number;
  ttlSeconds: number;
};

/**
 * Collapse counters that name the same key. Reservation callers normally
 * produce unique keys, but aggregating here keeps the transaction from
 * inserting the same row twice if a future profile shares a bucket.
 */
function collapseCounters(
  counters: CacheReservationCounter[],
): Map<string, CounterWindow> {
  const byKey = new Map<string, CounterWindow>();

  for (const counter of counters) {
    const existing = byKey.get(counter.key);
    if (!existing) {
      byKey.set(counter.key, { ...counter });
      continue;
    }
    existing.amount += counter.amount;
    existing.limit = Math.min(existing.limit, counter.limit);
    existing.ttlSeconds = Math.max(existing.ttlSeconds, counter.ttlSeconds);
  }

  return byKey;
}

function windowEndsAt(now: number, ttlSeconds: number): Date {
  return new Date(now + Math.max(1, Math.ceil(ttlSeconds)) * 1_000);
}

/**
 * Atomically check every bucket against its limit, then increment all of
 * them. Returns `ok: false` without charging any bucket when one would
 * exceed its limit.
 */
export async function reserveDurableCapacity(
  counters: CacheReservationCounter[],
): Promise<DurableCapacityReservationResult> {
  if (counters.length === 0) return { ok: true };

  const wanted = collapseCounters(counters);
  const keys = [...wanted.keys()].sort();

  try {
    return await db.transaction(async (tx) => {
      for (const key of keys) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext('ai-capacity'), hashtext(${key}))`,
        );
      }

      const now = new Date();
      const nowMs = now.getTime();
      const rows = await tx
        .select()
        .from(aiCapacityCounters)
        .where(inArray(aiCapacityCounters.key, keys));

      const rowsByKey = new Map(rows.map((row) => [row.key, row]));
      const liveValue = (key: string): number => {
        const row = rowsByKey.get(key);
        return row && row.expiresAt.getTime() > nowMs ? row.value : 0;
      };

      for (const [key, counter] of wanted) {
        if (liveValue(key) + counter.amount > counter.limit) {
          return { ok: false as const, key };
        }
      }

      for (const [key, counter] of wanted) {
        const row = rowsByKey.get(key);
        const liveRow =
          row && row.expiresAt.getTime() > nowMs ? row : null;
        const next = (liveRow?.value ?? 0) + counter.amount;
        const expiresAt = liveRow
          ? liveRow.expiresAt
          : windowEndsAt(nowMs, counter.ttlSeconds);

        if (row) {
          await tx
            .update(aiCapacityCounters)
            .set({ value: next, expiresAt })
            .where(eq(aiCapacityCounters.key, key));
        } else {
          await tx.insert(aiCapacityCounters).values({
            key,
            value: next,
            expiresAt,
          });
        }
      }

      return { ok: true as const };
    });
  } catch (error) {
    console.error(
      "[capacity-store] Durable reservation failed; refusing dispatch:",
      error instanceof Error ? error.message : error,
    );
    return { ok: false, key: counters[0].key, unavailable: true };
  }
}

/**
 * Apply a reservation settlement to a durable counter.
 *
 * Mirrors the Redis adjustment script:
 * - A missing (or expired) counter means the hold's window ended. Seed the
 *   new window with `whenMissing` instead of decrementing below zero.
 * - A counter whose remaining lifetime exceeds what this hold's window could
 *   have left belongs to a newer window. Drop a late release so it cannot
 *   erase real usage, and charge a late over-spend in full.
 * - Existing counters keep their window expiry and clamp at zero.
 *
 * Direct provider paths use this with `heldForMs = 0` to record actual usage
 * in the same counters.
 */
export async function adjustDurableCounter(
  key: string,
  delta: number,
  ttlSeconds: number,
  whenMissing: number,
  heldForMs = 0,
): Promise<number> {
  const seed = Math.max(0, Math.ceil(whenMissing));
  const held = Number.isFinite(heldForMs) ? Math.max(0, heldForMs) : 0;

  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('ai-capacity'), hashtext(${key}))`,
    );

    const [row] = await tx
      .select()
      .from(aiCapacityCounters)
      .where(eq(aiCapacityCounters.key, key))
      .for("update");

    const now = Date.now();
    const existingExpiresAt = row?.expiresAt.getTime() ?? 0;

    if (!row || existingExpiresAt <= now) {
      if (seed === 0) return 0;
      const expiresAt = windowEndsAt(now, ttlSeconds);
      if (row) {
        await tx
          .update(aiCapacityCounters)
          .set({ value: seed, expiresAt })
          .where(eq(aiCapacityCounters.key, key));
      } else {
        await tx
          .insert(aiCapacityCounters)
          .values({ key, value: seed, expiresAt });
      }
      return seed;
    }

    const remaining = existingExpiresAt - now;
    const maxRemaining = ttlSeconds * 1_000 - held;

    if (belongsToNewerWindow(remaining, maxRemaining)) {
      if (delta > 0 && seed > 0) {
        const next = row.value + seed;
        await tx
          .update(aiCapacityCounters)
          .set({ value: next })
          .where(eq(aiCapacityCounters.key, key));
        return next;
      }
      return row.value;
    }

    const next = Math.max(0, row.value + delta);
    await tx
      .update(aiCapacityCounters)
      .set({ value: next })
      .where(eq(aiCapacityCounters.key, key));
    return next;
  });
}
