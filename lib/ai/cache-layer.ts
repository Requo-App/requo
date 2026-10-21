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
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface CacheLayer {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  /** Set a value only when the key is absent. Returns false when it existed. */
  setIfAbsent<T>(key: string, value: T, ttlSeconds: number): Promise<boolean>;
  delete(key: string): Promise<void>;
  increment(key: string, ttlSeconds: number): Promise<number>;
  incrementBy(key: string, amount: number, ttlSeconds: number): Promise<number>;
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

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Operation timed out after ${timeoutMs}ms`));
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

function setInMemory(key: string, value: unknown, ttlSeconds: number): void {
  const expiresAt = Date.now() + ttlSeconds * 1000;
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

    // In-memory fallback for increment
    const current = getFromMemory<number>(key);
    const newValue = (current ?? 0) + 1;
    setInMemory(key, newValue, ttlSeconds);
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

    // In-memory fallback for incrementBy
    const current = getFromMemory<number>(key);
    const newValue = (current ?? 0) + amount;
    setInMemory(key, newValue, ttlSeconds);
    return newValue;
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const cacheLayer: CacheLayer = new DistributedCacheLayer();
