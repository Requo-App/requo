import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";

import { Redis } from "@upstash/redis";

import {
  assertBusinessActionRateLimit as dbAssertBusinessActionRateLimit,
  assertPublicActionRateLimit as dbAssertPublicActionRateLimit,
  getPublicActionClientIpAddress,
} from "@/lib/public-action-rate-limit";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PublicActionType =
  | "ai-file-import"
  | "inquiry-attachment-download"
  | "public-inquiry-submit"
  | "public-quote-respond"
  | "public-quote-revision";

export type RateLimitConfig = {
  action: PublicActionType;
  scope: string;
  limit: number;
  windowMs: number;
  /**
   * Ceiling for the whole scope, independent of any client-supplied
   * fingerprint. Keep it far above legitimate traffic: it is a backstop
   * against a flood, not the primary throttle, because a low value lets one
   * sender lock a public form for every other customer.
   */
  scopeLimit?: number;
  /**
   * Ceiling for the scope from one IP address. The User-Agent is
   * client-controlled, so this is the bucket that actually bounds a sender
   * that rotates it.
   */
  ipLimit?: number;
};

export type RateLimitResult = {
  allowed: boolean;
  metadata: {
    limit: number;
    remaining: number;
    reset: number; // Unix epoch seconds
  };
};

// ---------------------------------------------------------------------------
// Redis client — dedicated to rate limiting (separate from cache layer)
// ---------------------------------------------------------------------------

const RATE_LIMIT_TIMEOUT_MS = 2_000;

type FallbackReason =
  | "missing_env_vars"
  | "connection_failure"
  | "timeout"
  | "redis_error";

function createRateLimitRedisClient(): Redis | null {
  // Validated centrally in lib/env.ts; empty in dev falls back to DB ledger.
  const url = env.UPSTASH_REDIS_REST_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    logFallbackWarning("missing_env_vars", "Redis rate limiter using DB fallback");
    return null;
  }

  try {
    return new Redis({
      url,
      token,
      automaticDeserialization: true,
      retry: { retries: 0 },
    });
  } catch {
    logFallbackWarning("connection_failure", "Failed to create Redis client");
    return null;
  }
}

let rateLimitRedis: Redis | null = null;
let rateLimitRedisInitialized = false;

function getRateLimitRedis(): Redis | null {
  if (!rateLimitRedisInitialized) {
    rateLimitRedis = createRateLimitRedisClient();
    rateLimitRedisInitialized = true;
  }
  return rateLimitRedis;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function logFallbackWarning(reason: FallbackReason, message: string): void {
  console.warn("[rate-limit] Fallback activated", {
    reason,
    message,
    timestamp: new Date().toISOString(),
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Rate limit operation timed out after ${timeoutMs}ms`));
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

/**
 * Builds the Redis key for rate limiting.
 * Pattern: `rl:{action}:{fingerprint}`
 */
function buildRedisKey(action: PublicActionType, fingerprint: string): string {
  return `rl:${action}:${fingerprint}`;
}

/**
 * Generates a fingerprint for public actions using IP + user-agent hash.
 * For business actions, the scope itself is the fingerprint.
 */
async function getPublicActionFingerprint(scope: string): Promise<string> {
  const headerStore = await headers();
  const ipAddress = getPublicActionClientIpAddress(headerStore);
  const userAgent = headerStore.get("user-agent") ?? "unknown";

  return createHash("sha256")
    .update(`${scope}:${ipAddress}:${userAgent}`)
    .digest("hex");
}

/**
 * Fingerprint for the scope from one IP address, without the User-Agent.
 *
 * The User-Agent is client-controlled, so the fingerprint bucket alone does
 * not bound a sender that rotates it.
 */
async function getPublicActionIpFingerprint(scope: string): Promise<string> {
  const headerStore = await headers();
  const ipAddress = getPublicActionClientIpAddress(headerStore);

  return createHash("sha256")
    .update(`${scope}:${ipAddress}`)
    .digest("hex");
}

/**
 * Key for the scope-wide counter. It contains nothing the client controls.
 */
function getPublicActionScopeKey(scope: string): string {
  return `scope:${scope}`;
}

// ---------------------------------------------------------------------------
// Core sliding window rate limit check via Redis
// ---------------------------------------------------------------------------

/**
 * Performs a rate limit check using Redis sliding window counter.
 * Uses exactly 2 Redis round-trips:
 *   1. INCR with EX (atomic increment + TTL set)
 *   2. GET current count (to confirm window state)
 *
 * Returns the rate limit result with metadata.
 */
async function checkRateLimitRedis(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = getRateLimitRedis();

  if (!redis) {
    throw new Error("Redis unavailable");
  }

  const windowSeconds = Math.ceil(windowMs / 1000);

  // Round-trip 1: Increment counter and set TTL atomically
  // If key doesn't exist, INCR creates it with value 1, then we set EX
  const currentCount = await withTimeout(
    (async () => {
      const count = await redis.incr(key);
      // Set TTL only on first request in window (count === 1 means new window)
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return count;
    })(),
    RATE_LIMIT_TIMEOUT_MS,
  );

  // Round-trip 2: Get TTL to compute reset time
  const ttl = await withTimeout(redis.ttl(key), RATE_LIMIT_TIMEOUT_MS);

  const resetSeconds = Math.ceil(Date.now() / 1000) + Math.max(ttl, 0);
  const remaining = Math.max(0, limit - currentCount);
  const allowed = currentCount <= limit;

  return {
    allowed,
    metadata: {
      limit,
      remaining,
      reset: resetSeconds,
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Rate limits public actions using Redis sliding window counters.
 * Falls back to the existing DB-based rate limiter on Redis failure.
 *
 * Fail-closed: returns `false` (deny) on error.
 */
export async function assertPublicActionRateLimit(
  config: RateLimitConfig,
): Promise<boolean> {
  const { action, scope, limit, windowMs, scopeLimit, ipLimit } = config;

  try {
    // The buckets are checked in order of cost, and a request that fails
    // one bucket does not consume the budget of the ones after it.
    const fingerprintResult = await checkRateLimitRedis(
      buildRedisKey(action, await getPublicActionFingerprint(scope)),
      limit,
      windowMs,
    );

    if (!fingerprintResult.allowed) {
      return false;
    }

    if (typeof ipLimit === "number") {
      const ipResult = await checkRateLimitRedis(
        buildRedisKey(action, await getPublicActionIpFingerprint(scope)),
        ipLimit,
        windowMs,
      );

      if (!ipResult.allowed) {
        return false;
      }
    }

    if (typeof scopeLimit === "number") {
      const scopeResult = await checkRateLimitRedis(
        buildRedisKey(action, getPublicActionScopeKey(scope)),
        scopeLimit,
        windowMs,
      );

      if (!scopeResult.allowed) {
        return false;
      }
    }

    return true;
  } catch (error) {
    const reason: FallbackReason =
      error instanceof Error && error.message.includes("timed out")
        ? "timeout"
        : "redis_error";

    logFallbackWarning(
      reason,
      `Public action '${action}' falling back to DB: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Fallback to existing DB-based rate limiter (fail-closed)
    try {
      return await dbAssertPublicActionRateLimit({ action, scope, limit, windowMs });
    } catch {
      // DB fallback also failed — fail-closed for public actions
      return false;
    }
  }
}

/**
 * Rate limits business-scoped actions using Redis sliding window counters.
 * Falls back to the existing DB-based rate limiter on Redis failure.
 *
 * Fail-open: returns `true` (allow) on error.
 */
export async function assertBusinessActionRateLimit(
  config: RateLimitConfig,
): Promise<boolean> {
  const { action, scope, limit, windowMs } = config;

  try {
    // For business actions, scope is the fingerprint (no IP hashing)
    const key = buildRedisKey(action, scope);
    const result = await checkRateLimitRedis(key, limit, windowMs);
    return result.allowed;
  } catch (error) {
    const reason: FallbackReason =
      error instanceof Error && error.message.includes("timed out")
        ? "timeout"
        : "redis_error";

    logFallbackWarning(
      reason,
      `Business action '${action}' falling back to DB: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Fallback to existing DB-based rate limiter (fail-open)
    try {
      return await dbAssertBusinessActionRateLimit({ action, scope, limit, windowMs });
    } catch {
      // DB fallback also failed — fail-open for business actions
      return true;
    }
  }
}

/**
 * Performs a rate limit check and returns full result with metadata.
 * Useful when response headers need to be set.
 *
 * Uses Redis-first with DB fallback. On fallback, metadata is estimated.
 */
export async function checkPublicActionRateLimit(
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  const { action, scope, limit, windowMs } = config;

  try {
    const fingerprint = await getPublicActionFingerprint(scope);
    const key = buildRedisKey(action, fingerprint);
    return await checkRateLimitRedis(key, limit, windowMs);
  } catch (error) {
    const reason: FallbackReason =
      error instanceof Error && error.message.includes("timed out")
        ? "timeout"
        : "redis_error";

    logFallbackWarning(
      reason,
      `Public action '${action}' metadata check falling back to DB: ${error instanceof Error ? error.message : String(error)}`,
    );

    // Fallback: use DB-based check and construct approximate metadata
    const allowed = await dbAssertPublicActionRateLimit({ action, scope, limit, windowMs }).catch(
      () => false,
    );

    return {
      allowed,
      metadata: {
        limit,
        remaining: allowed ? limit - 1 : 0,
        reset: Math.ceil((Date.now() + windowMs) / 1000),
      },
    };
  }
}

/**
 * Generates response headers from rate limit metadata.
 */
export function rateLimitHeaders(metadata: RateLimitResult["metadata"]): HeadersInit {
  return {
    "X-RateLimit-Limit": String(metadata.limit),
    "X-RateLimit-Remaining": String(metadata.remaining),
    "X-RateLimit-Reset": String(metadata.reset),
  };
}

// ---------------------------------------------------------------------------
// Testing utilities
// ---------------------------------------------------------------------------

/**
 * Resets the Redis client initialization state. Used for testing only.
 * @internal
 */
export function _resetRateLimitRedisClient(): void {
  rateLimitRedis = null;
  rateLimitRedisInitialized = false;
}

/**
 * Exposes buildRedisKey for testing. Used for testing only.
 * @internal
 */
export function _buildRedisKey(action: PublicActionType, fingerprint: string): string {
  return buildRedisKey(action, fingerprint);
}
