import "server-only";

import { Redis } from "@upstash/redis";

import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Distributed Cache Layer — Upstash Redis with in-memory fallback
//
// Provides a non-throwing cache interface that persists across serverless cold
// starts via Upstash Redis REST. Falls back to an in-memory Map when Redis is
// unavailable (missing env vars, connection failure, or per-operation timeout).
//
// Behavior:
// - set: dual-write to Redis and in-memory Map
// - get: Redis-first; returns Redis value without touching in-memory map;
//         falls back to in-memory on Redis failure
// - delete: removes from both Redis and in-memory Map
// - increment: Redis-first with in-memory fallback
//
// Classification: this layer is best-effort. It backs caches, duplicate
// suppression, cooldowns, lockout counters, health telemetry, and the
// selection mirror of provider capacity. None of those may be the only guard
// for a hard limit. Correctness-critical limits do not depend on Redis:
// - Monthly AI spend: `reserveUsage` in `lib/ai/usage-limiter.ts`
//   (`ai_usage_events` under a per-business advisory lock)
// - Provider capacity: `lib/ai/capacity-store.ts`
//   (`ai_capacity_counters` under per-key advisory locks)
// - Public action rate limits: `lib/public-action-rate-limit.ts`
//   (`public_action_events`, fail-closed)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * One counter in an atomic capacity reservation.
 *
 * `limit` is the provider's ceiling for this bucket. `amount` is the capacity
 * the caller wants to hold. A reservation either increments every counter or
 * none of them; a partial increment would leak quota from a request that was
 * never dispatched.
 */
export type CacheReservationCounter = {
  key: string;
  limit: number;
  amount: number;
  ttlSeconds: number;
};

export type CacheReservationResult =
  | { ok: true; values: number[] }
  | {
      ok: false;
      key: string;
      /**
       * True when the refusal came from an ambiguous transport failure (a
       * Redis timeout), not from a proven limit. The script may have committed
       * after the client gave up; the caller skips the candidate either way and
       * any committed hold expires with its own TTL.
       */
      ambiguous?: boolean;
    };

export interface CacheLayer {
  get<T>(key: string): Promise<T | null>;
  /** Batched read. Preserves input order and returns `null` for misses. */
  getMany<T>(keys: string[]): Promise<Array<T | null>>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Set a value only when the key is absent. Returns false when it existed. */
  setIfAbsent<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  incrementBy(key: string, amount: number, ttlSeconds: number): Promise<number>;
  /**
   * Apply a reservation settlement to a counter.
   *
   * `delta` is applied when the counter still belongs to the hold's window. If
   * the counter expired between reservation and settlement (a request that
   * crosses a minute boundary), `whenMissing` seeds the new window instead of
   * treating the expired hold as present.
   *
   * `heldForMs` is how long ago the hold was taken. It lets the counter detect
   * that the key now present was created *after* this hold's window expired —
   * a newer window that already recorded real usage. A negative `delta` is then
   * dropped instead of erasing that usage, and a positive `delta` charges the
   * full `whenMissing` amount rather than a difference against a hold that no
   * longer exists. Omitting it means "assume the hold's window is current",
   * which is only correct for callers that do not hold across window
   * boundaries.
   */
  adjustCounter(
    key: string,
    delta: number,
    ttlSeconds: number,
    whenMissing: number,
    heldForMs?: number,
  ): Promise<number>;
  /**
   * Atomically check every counter against its limit, then increment all of
   * them. Redis executes this through one Lua script, so concurrent requests
   * cannot both observe the same remaining capacity.
   */
  reserve(counters: CacheReservationCounter[]): Promise<CacheReservationResult>;
}

// ---------------------------------------------------------------------------
// In-memory fallback store
// ---------------------------------------------------------------------------

type InMemoryEntry = {
  value: unknown;
  expiresAt: number;
};

const inMemoryStore = new Map<string, InMemoryEntry>();

/**
 * The in-memory fallback is a hard cap on memory: keys such as
 * `embed:<sha256>` and `dedup:<sha256>` are one per distinct input, so a
 * long-lived process would otherwise accumulate every value it ever wrote.
 */
const IN_MEMORY_MAX_ENTRIES = 2_000;

/** Drop expired entries, then the oldest ones, when the store is over cap. */
function evictInMemory(): void {
  if (inMemoryStore.size <= IN_MEMORY_MAX_ENTRIES) return;

  const now = Date.now();
  for (const [key, entry] of inMemoryStore) {
    if (now > entry.expiresAt) {
      inMemoryStore.delete(key);
    }
  }

  // Still over cap: drop the oldest entries (Map preserves insertion order).
  while (inMemoryStore.size > IN_MEMORY_MAX_ENTRIES) {
    const oldest = inMemoryStore.keys().next();
    if (oldest.done) break;
    inMemoryStore.delete(oldest.value);
  }
}

// ---------------------------------------------------------------------------
// Redis client initialization
// ---------------------------------------------------------------------------

const OPERATION_TIMEOUT_MS = 2_000;

function createRedisClient(): Redis | null {
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    console.warn(
      "[cache-layer] Redis unavailable: missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN. Using in-memory fallback.",
    );
    return null;
  }

  try {
    const client = new Redis({
      url,
      token,
      automaticDeserialization: true,
      retry: {
        retries: 0,
      },
    });
    return client;
  } catch (error) {
    console.warn(
      "[cache-layer] Redis client creation failed, using in-memory fallback:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

let redisClient: Redis | null = null;
let redisInitialized = false;

function getRedis(): Redis | null {
  if (!redisInitialized) {
    redisClient = createRedisClient();
    redisInitialized = true;
  }
  return redisClient;
}

// ---------------------------------------------------------------------------
// Timeout helper
// ---------------------------------------------------------------------------

/**
 * The client gave up before Redis answered. The command may still have
 * executed, so callers that have a fallback path must decide whether an
 * unconfirmed write is acceptable instead of silently retrying it locally.
 */
class CacheOperationTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Operation timed out after ${timeoutMs}ms`);
    this.name = "CacheOperationTimeoutError";
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CacheOperationTimeoutError(timeoutMs));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

// ---------------------------------------------------------------------------
// In-memory helpers
// ---------------------------------------------------------------------------

function getFromMemory<T>(key: string): T | null {
  const entry = inMemoryStore.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    inMemoryStore.delete(key);
    return null;
  }

  return entry.value as T;
}

/** Raw in-knowledge entry, including its expiry, for window-aware settlement. */
function getMemoryEntry(key: string): InMemoryEntry | null {
  const entry = inMemoryStore.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    inMemoryStore.delete(key);
    return null;
  }

  return entry;
}

function setInMemory(key: string, value: unknown, ttlSeconds: number): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  inMemoryStore.set(key, { value, expiresAt });
  evictInMemory();
}

/** Write without restarting the window's clock. */
function setInMemoryUntil(key: string, value: unknown, expiresAt: number): void {
  inMemoryStore.set(key, { value, expiresAt });
  evictInMemory();
}

function deleteFromMemory(key: string): void {
  inMemoryStore.delete(key);
}

// ---------------------------------------------------------------------------
// Cache Layer implementation
// ---------------------------------------------------------------------------

class DistributedCacheLayer implements CacheLayer {
  /**
   * Reads a value from cache. Redis-first; returns Redis value without
   * touching in-memory map. Falls back to in-memory on Redis failure.
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedis();

    if (redis) {
      try {
        const value = await withTimeout(
          redis.get<T>(key),
          OPERATION_TIMEOUT_MS,
        );
        // Return Redis value (even if null) without touching in-memory map
        return value ?? null;
      } catch (error) {
        console.warn(
          "[cache-layer] Redis GET failed, falling back to in-memory:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // Fallback to in-memory
    return getFromMemory<T>(key);
  }

  /**
   * Reads many values in one Redis round-trip. The capacity selector checks
   * ten dimensions per candidate; doing that one key at a time made routing
   * latency a function of the candidate-chain length.
   */
  async getMany<T>(keys: string[]): Promise<Array<T | null>> {
    if (keys.length === 0) return [];

    const redis = getRedis();

    if (redis) {
      try {
        const values = await withTimeout(
          redis.mget(...keys) as Promise<unknown[] | null>,
          OPERATION_TIMEOUT_MS,
        );
        if (Array.isArray(values)) {
          return keys.map((_, index) => (values[index] ?? null) as T | null);
        }
      } catch (error) {
        console.warn(
          "[cache-layer] Redis MGET failed, falling back to in-memory:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    return keys.map((key) => getFromMemory<T>(key));
  }

  /**
   * Writes a value to cache. Dual-write: Redis + in-memory Map.
   * In-memory write always succeeds; Redis failure is logged but not thrown.
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    // Always write to in-memory
    setInMemory(key, value, ttlSeconds);

    const redis = getRedis();
    if (redis) {
      try {
        await withTimeout(
          redis.set(key, value, { ex: ttlSeconds }),
          OPERATION_TIMEOUT_MS,
        );
      } catch (error) {
        console.warn(
          "[cache-layer] Redis SET failed, value stored in-memory only:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  /**
   * Sets a value only when the key is absent. Redis `SET NX EX` is atomic,
   * so two concurrent callers cannot both observe "absent" and both write —
   * the get-then-set pattern was a race that let duplicate work through.
   */
  async setIfAbsent<T>(
    key: string,
    value: T,
    ttlSeconds: number,
  ): Promise<boolean> {
    const redis = getRedis();

    if (redis) {
      try {
        const result = await withTimeout(
          redis.set(key, value, { ex: ttlSeconds, nx: true }) as Promise<
            string | null
          >,
          OPERATION_TIMEOUT_MS,
        );

        if (result !== null && result !== undefined) {
          setInMemory(key, value, ttlSeconds);
          return true;
        }

        return false;
      } catch (error) {
        console.warn(
          "[cache-layer] Redis SET NX failed, falling back to in-memory:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // In-memory fallback: the check and the write happen in one tick, so
    // concurrent callers in the same process cannot both win.
    const existing = getFromMemory<T>(key);
    if (existing !== null) {
      return false;
    }

    setInMemory(key, value, ttlSeconds);
    return true;
  }

  /**
   * Deletes a key from both Redis and in-memory Map.
   */
  async delete(key: string): Promise<void> {
    // Always delete from in-memory
    deleteFromMemory(key);

    const redis = getRedis();
    if (redis) {
      try {
        await withTimeout(redis.del(key), OPERATION_TIMEOUT_MS);
      } catch (error) {
        console.warn(
          "[cache-layer] Redis DEL failed:",
          error instanceof Error ? error.message : error,
        );
      }
    }
  }

  /**
   * Increments a numeric key. Redis-first with in-memory fallback.
   * Sets TTL on first increment (when key doesn't exist yet).
   */
  async increment(key: string, ttlSeconds: number): Promise<number> {
    const redis = getRedis();

    if (redis) {
      try {
        const result = await withTimeout(
          (async () => {
            const newValue = await redis.incr(key);
            // Set TTL only on first increment (value becomes 1)
            if (newValue === 1) {
              await redis.expire(key, ttlSeconds);
            }
            return newValue;
          })(),
          OPERATION_TIMEOUT_MS,
        );

        // Sync to in-memory
        setInMemory(key, result, ttlSeconds);
        return result;
      } catch (error) {
        console.warn(
          "[cache-layer] Redis INCR failed, falling back to in-memory:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // In-memory fallback for increment. Preserve an existing window's expiry:
    // only the first increment of a window starts its clock, matching Redis.
    const entry = getMemoryEntry(key);
    const current =
      typeof entry?.value === "number" && Number.isFinite(entry.value)
        ? entry.value
        : 0;
    const newValue = current + 1;
    setInMemoryUntil(
      key,
      newValue,
      entry ? entry.expiresAt : Date.now() + ttlSeconds * 1000,
    );
    return newValue;
  }
  /**
   * Increments a numeric key by a specified amount. Redis-first with in-memory fallback.
   * Sets TTL on first increment (when key didn't exist before, i.e., result equals amount).
   */
  async incrementBy(key: string, amount: number, ttlSeconds: number): Promise<number> {
    const redis = getRedis();

    if (redis) {
      try {
        const result = await withTimeout(
          (async () => {
            const newValue = await redis.incrby(key, amount);
            // Set TTL only on first increment (value equals the amount we just added)
            if (newValue === amount) {
              await redis.expire(key, ttlSeconds);
            }
            return newValue;
          })(),
          OPERATION_TIMEOUT_MS,
        );

        // Sync to in-memory
        setInMemory(key, result, ttlSeconds);
        return result;
      } catch (error) {
        console.warn(
          "[cache-layer] Redis INCRBY failed, falling back to in-memory:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // In-memory fallback for incrementBy. Preserve an existing window's expiry:
    // only the first increment of a window starts its clock, matching Redis.
    const entry = getMemoryEntry(key);
    const current =
      typeof entry?.value === "number" && Number.isFinite(entry.value)
        ? entry.value
        : 0;
    const newValue = current + amount;
    setInMemoryUntil(
      key,
      newValue,
      entry ? entry.expiresAt : Date.now() + ttlSeconds * 1000,
    );
    return newValue;
  }

  async adjustCounter(
    key: string,
    delta: number,
    ttlSeconds: number,
    whenMissing: number,
    heldForMs = 0,
  ): Promise<number> {
    const seed = Math.max(0, Math.ceil(whenMissing));
    const held = Number.isFinite(heldForMs) ? Math.max(0, heldForMs) : 0;
    const redis = getRedis();

    if (redis) {
      try {
        const raw = await withTimeout(
          redis.eval(ADJUST_COUNTER_SCRIPT, [key], [
            String(delta),
            String(ttlSeconds),
            String(seed),
            String(Math.ceil(held)),
          ]),
          OPERATION_TIMEOUT_MS,
        );
        const parsed = parseCounterWrite(raw);
        if (parsed) {
          if (parsed.applied) setInMemory(key, parsed.value, ttlSeconds);
          return parsed.value;
        }
        throw new Error("Unexpected counter adjustment response");
      } catch (error) {
        console.warn(
          "[cache-layer] Redis ADJUST failed, falling back to in-memory:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    const entry = getMemoryEntry(key);
    const maxRemainingMs = ttlSeconds * 1000 - held;

    if (entry) {
      const current =
        typeof entry.value === "number" && Number.isFinite(entry.value)
          ? entry.value
          : 0;

      if (
        belongsToNewerWindow(entry.expiresAt - Date.now(), maxRemainingMs)
      ) {
        if (delta > 0 && seed > 0) {
          const next = current + seed;
          setInMemoryUntil(key, next, entry.expiresAt);
          return next;
        }
        return current;
      }

      const next = Math.max(0, current + delta);
      setInMemoryUntil(key, next, entry.expiresAt);
      return next;
    }

    if (seed > 0) {
      setInMemory(key, seed, ttlSeconds);
    }
    return seed;
  }

  /**
   * All-or-nothing counter reservation.
   *
   * The Redis path is one Lua script: it reads every counter, refuses if any
   * bucket would exceed its limit, and only then increments. The in-memory
   * path performs the same check and increment in one synchronous tick, which
   * is atomic within a process. When Redis is unavailable the fallback is
   * process-local; cross-instance overrun is then limited to the fallback
   * window and documented in `docs/setup/ai-provider-limits.md`.
   */
  async reserve(
    counters: CacheReservationCounter[],
  ): Promise<CacheReservationResult> {
    if (counters.length === 0) return { ok: true, values: [] };

    const keys = counters.map((counter) => counter.key);
    const args = counters.flatMap((counter) => [
      String(counter.limit),
      String(counter.amount),
      String(counter.ttlSeconds),
    ]);
    const redis = getRedis();

    if (redis) {
      try {
        const raw = await withTimeout(
          redis.eval(RESERVE_SCRIPT, keys, args),
          OPERATION_TIMEOUT_MS,
        );
        const result = Array.isArray(raw) ? raw.map(Number) : [];
        if (result[0] === 1) {
          const values = result.slice(1);
          counters.forEach((counter, index) => {
            setInMemory(counter.key, values[index] ?? 0, counter.ttlSeconds);
          });
          return { ok: true, values };
        }
        if (result[0] === 0) {
          return { ok: false, key: keys[Number(result[1] ?? 0) - 1] ?? keys[0] };
        }
        throw new Error("Unexpected reservation response");
      } catch (error) {
        if (error instanceof CacheOperationTimeoutError) {
          // The script may have committed after the client gave up. Refuse the
          // reservation instead of opening a second, unaccounted hold: the
          // candidate is skipped and any committed hold expires with its own
          // TTL. An independent in-process reservation here would let a
          // request dispatch with no record of the Redis hold it left behind.
          console.warn(
            `[cache-layer] Redis RESERVE timed out; treating the hold as possibly committed: ${error.message}`,
          );
          return { ok: false, key: keys[0], ambiguous: true };
        }
        console.warn(
          "[cache-layer] Redis RESERVE failed, falling back to in-memory:",
          error instanceof Error ? error.message : error,
        );
      }
    }

    // In-memory fallback: validate every bucket before mutating any of them.
    for (const counter of counters) {
      const current = getFromMemory<number>(counter.key) ?? 0;
      if (current + counter.amount > counter.limit) {
        return { ok: false, key: counter.key };
      }
    }

    const values: number[] = [];
    for (const counter of counters) {
      const entry = getMemoryEntry(counter.key);
      const current =
        typeof entry?.value === "number" && Number.isFinite(entry.value)
          ? entry.value
          : 0;
      const next = current + counter.amount;
      // Preserve the window's expiry: only the first increment of a window
      // starts its clock, matching what the Redis script's EXPIRE does.
      setInMemoryUntil(
        counter.key,
        next,
        entry ? entry.expiresAt : Date.now() + counter.ttlSeconds * 1000,
      );
      values.push(next);
    }
    return { ok: true, values };
  }
}

// Day TTLs are rounded to whole seconds per request. Reservations sharing a
// day key can therefore disagree about its expiry by up to one second.
const WINDOW_TTL_SKEW_MS = 1_000;

/**
 * The hold's key can have at most `ttl − heldForMs` left to live, plus the
 * day-TTL rounding allowance. A longer lifetime means the key was recreated
 * after this hold's window expired and belongs to a newer window.
 *
 * Shared with the durable capacity store so both implementations settle a
 * hold across a window boundary the same way.
 */
export function belongsToNewerWindow(
  remainingTtlMs: number,
  maxRemainingTtlMs: number,
): boolean {
  return remainingTtlMs > maxRemainingTtlMs + WINDOW_TTL_SKEW_MS;
}

/** Parse the `{applied, value}` shape the adjustment script returns. */
function parseCounterWrite(
  raw: unknown,
): { applied: boolean; value: number } | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const value = Number(raw[1]);
  if (!Number.isFinite(value)) return null;
  return { applied: Number(raw[0]) === 1, value };
}

/**
 * Counter settlement script.
 *
 * ARGV: `delta`, `ttlSeconds`, `seed`, `heldForMs`.
 *
 * A missing key means the hold expired with its window. Seed the new window
 * (0 for a release, actual usage for a successful request) rather than
 * decrementing an absent counter into a negative value. Existing counters keep
 * their TTL; a negative result is clamped to zero.
 *
 * A key can also still exist while belonging to a *newer* window: the hold's
 * window expired, and another request recreated the counter. The hold's key can
 * have at most `ttl − heldForMs` left to live, plus one second of day-TTL
 * rounding skew, so a longer TTL proves the key was recreated. In that case
 * a negative delta must not subtract from usage recorded in the new window,
 * and a positive delta charges the full `seed`
 * instead of a difference against a hold that no longer exists.
 *
 * Returns `{applied, value}` so the caller knows whether the counter changed.
 */
const ADJUST_COUNTER_SCRIPT = `
local current = redis.call("GET", KEYS[1])
local delta = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local seed = tonumber(ARGV[3])
local heldForMs = tonumber(ARGV[4]) or 0
if not current then
  if seed > 0 then
    redis.call("SET", KEYS[1], seed, "EX", ttl)
  end
  return {1, seed}
end
local value = tonumber(current) or 0
local maxRemaining = ttl * 1000 - heldForMs
local remaining = redis.call("PTTL", KEYS[1])
if remaining < 0 or remaining > maxRemaining + ${WINDOW_TTL_SKEW_MS} then
  if delta > 0 and seed > 0 then
    redis.call("INCRBY", KEYS[1], seed)
    return {1, value + seed}
  end
  return {0, value}
end
local next = redis.call("INCRBY", KEYS[1], delta)
if next < 0 then
  redis.call("SET", KEYS[1], 0, "KEEPTTL")
  return {1, 0}
end
return {1, next}
`;

/**
 * Atomic reservation script. ARGV is a flat triple per key:
 * `limit`, `amount`, `ttlSeconds`.
 *
 * Return shape is deliberately small: `{1, ...values}` on success and
 * `{0, failedIndex}` on refusal. Upstash returns Lua arrays as JS arrays.
 */
const RESERVE_SCRIPT = `
local values = {}
for i = 1, #KEYS do
  local base = (i - 1) * 3
  local limit = tonumber(ARGV[base + 1])
  local amount = tonumber(ARGV[base + 2])
  local current = tonumber(redis.call("GET", KEYS[i])) or 0
  if limit >= 0 and current + amount > limit then
    return {0, i}
  end
end
for i = 1, #KEYS do
  local base = (i - 1) * 3
  local amount = tonumber(ARGV[base + 2])
  local ttl = tonumber(ARGV[base + 3])
  local next = redis.call("INCRBY", KEYS[i], amount)
  if next == amount then
    redis.call("EXPIRE", KEYS[i], ttl)
  end
  table.insert(values, next)
end
return {1, unpack(values)}
`;

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const cacheLayer: CacheLayer = new DistributedCacheLayer();
