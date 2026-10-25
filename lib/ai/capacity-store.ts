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

type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/**
 * Read the database clock once per transaction. Window boundaries are compared
 * against `expires_at`, so using the database's clock keeps two application
 * instances from disagreeing when their host clocks drift.
 *
 * `clock_timestamp()` rather than `now()`: a transaction that waited on an
 * advisory lock must compare boundaries against the time it resumed, not the
 * time it began. A missing reading throws, so callers fail closed instead of
 * silently falling back to a possibly skewed application clock.
 */
async function databaseNowMs(tx: DatabaseTransaction): Promise<number> {
  // postgres-js returns the rows array directly; node-postgres (integration
  // tests) returns a QueryResult with a `rows` property.
  const result = (await tx.execute(
    sql`select (extract(epoch from clock_timestamp()) * 1000)::double precision as now_ms`,
  )) as unknown as
    | Array<{ now_ms: number | string }>
    | { rows: Array<{ now_ms: number | string }> };
  const rows = Array.isArray(result) ? result : result.rows;
  const value = Number(rows[0]?.now_ms);
  if (!Number.isFinite(value)) {
    throw new Error("Database clock query returned an invalid timestamp");
  }
  return value;
}

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

      const nowMs = await databaseNowMs(tx);
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

export type DurableCounterAdjustment = {
  key: string;
  delta: number;
  ttlSeconds: number;
  whenMissing: number;
  heldForMs?: number;
};

type CounterState = {
  value: number;
  expiresAt: Date;
  exists: boolean;
};

/**
 * Apply several reservation settlements in one transaction.
 *
 * Every held counter settles together or not at all, so a failure cannot leave
 * a reservation half-released or half-charged. The adjustment rules mirror the
 * Redis script:
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
export async function adjustDurableCounters(
  adjustments: DurableCounterAdjustment[],
): Promise<Map<string, number>> {
  const results = new Map<string, number>();
  if (adjustments.length === 0) return results;

  const normalized = adjustments.map((adjustment) => ({
    key: adjustment.key,
    delta: Number.isFinite(adjustment.delta) ? adjustment.delta : 0,
    ttlSeconds: adjustment.ttlSeconds,
    seed: Math.max(0, Math.ceil(adjustment.whenMissing)),
    held: Number.isFinite(adjustment.heldForMs)
      ? Math.max(0, adjustment.heldForMs ?? 0)
      : 0,
  }));
  const keys = [
    ...new Set(normalized.map((adjustment) => adjustment.key)),
  ].sort();

  return db.transaction(async (tx) => {
    for (const key of keys) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext('ai-capacity'), hashtext(${key}))`,
      );
    }

    const nowMs = await databaseNowMs(tx);
    const rows = await tx
      .select()
      .from(aiCapacityCounters)
      .where(inArray(aiCapacityCounters.key, keys))
      .for("update");

    const state = new Map<string, CounterState>(
      rows.map((row) => [
        row.key,
        { value: row.value, expiresAt: row.expiresAt, exists: true },
      ]),
    );
    const dirty = new Set<string>();

    for (const adjustment of normalized) {
      const { key } = adjustment;
      const current = state.get(key);
      const existingExpiresAt = current?.expiresAt.getTime() ?? 0;

      if (!current || existingExpiresAt <= nowMs) {
        if (adjustment.seed === 0) {
          results.set(key, 0);
          continue;
        }
        const next: CounterState = {
          value: adjustment.seed,
          expiresAt: windowEndsAt(nowMs, adjustment.ttlSeconds),
          exists: current?.exists ?? false,
        };
        state.set(key, next);
        dirty.add(key);
        results.set(key, next.value);
        continue;
      }

      const remaining = existingExpiresAt - nowMs;
      const maxRemaining = adjustment.ttlSeconds * 1_000 - adjustment.held;

      if (belongsToNewerWindow(remaining, maxRemaining)) {
        if (adjustment.delta > 0 && adjustment.seed > 0) {
          const next = current.value + adjustment.seed;
          state.set(key, { ...current, value: next });
          dirty.add(key);
          results.set(key, next);
        } else {
          results.set(key, current.value);
        }
        continue;
      }

      const next = Math.max(0, current.value + adjustment.delta);
      state.set(key, { ...current, value: next });
      dirty.add(key);
      results.set(key, next);
    }

    for (const key of dirty) {
      const current = state.get(key);
      if (!current) continue;
      if (current.exists) {
        await tx
          .update(aiCapacityCounters)
          .set({ value: current.value, expiresAt: current.expiresAt })
          .where(eq(aiCapacityCounters.key, key));
      } else {
        await tx
          .insert(aiCapacityCounters)
          .values({ key, value: current.value, expiresAt: current.expiresAt });
      }
    }

    return results;
  });
}

/**
 * Apply one reservation settlement to a durable counter.
 *
 * Prefer `adjustDurableCounters` when a reservation holds more than one
 * counter: the batch form keeps them atomic.
 */
export async function adjustDurableCounter(
  key: string,
  delta: number,
  ttlSeconds: number,
  whenMissing: number,
  heldForMs = 0,
): Promise<number> {
  const values = await adjustDurableCounters([
    { key, delta, ttlSeconds, whenMissing, heldForMs },
  ]);
  return values.get(key) ?? 0;
}
