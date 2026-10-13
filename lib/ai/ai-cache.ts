import "server-only";

import { createHash } from "crypto";

import type { AiTaskType } from "./types";
import type { AiQualityTier } from "./types";
import { cacheLayer } from "@/lib/ai/cache-layer";

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// AI Cache — deterministic composite-key caching with TTL enforcement
//
// Uses the distributed Cache Layer (Redis with in-memory fallback) for
// persistence across serverless cold starts. TTLs are caller-specified.
// ---------------------------------------------------------------------------

/** Stable sentinel value for absent optional components in cache keys. */
export const NULL_SENTINEL = "__null__" as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Components used to compute a deterministic cache key.
 * Each field contributes to the SHA-256 hash that identifies a unique AI output.
 */
export type CacheKeyComponents = {
  businessId: string;
  userId: string;
  taskType: AiTaskType;
  promptVersion: string;
  modelTier: AiQualityTier;
  sourceDataVersions: Record<string, string | null>;
};

/**
 * The cached AI output stored alongside metadata.
 */
export type CachedAiOutput = {
  text: string;
  model: string;
  provider: string;
  createdAt: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
};

// ---------------------------------------------------------------------------
// Cache key prefixes
// ---------------------------------------------------------------------------

const AI_CACHE_PREFIX = "ai:";

// ---------------------------------------------------------------------------
// Key generation
// ---------------------------------------------------------------------------

/**
 * Generates a deterministic cache key from the given components.
 *
 * The algorithm:
 * 1. Replace null values in sourceDataVersions with the stable null sentinel.
 * 2. Sort source version keys for deterministic serialization.
 * 3. Compute SHA-256 hash → hex string.
 */
export function generateCacheKey(components: CacheKeyComponents): string {
  // Normalize sourceDataVersions: replace null with sentinel, sort keys
  const normalizedVersions: Record<string, string> = {};
  const sortedVersionKeys = Object.keys(components.sourceDataVersions).sort();

  for (const key of sortedVersionKeys) {
    const value = components.sourceDataVersions[key];
    normalizedVersions[key] = value ?? NULL_SENTINEL;
  }

  // Build a sorted structure for deterministic serialization
  const sortedComponents = {
    businessId: components.businessId,
    modelTier: components.modelTier,
    promptVersion: components.promptVersion,
    sourceDataVersions: normalizedVersions,
    taskType: components.taskType,
    userId: components.userId,
  };

  const serialized = JSON.stringify(sortedComponents);

  return createHash("sha256").update(serialized).digest("hex");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

/**
 * Retrieves a cached AI output for the given key components.
 *
 * Returns the cached output if found and within TTL, or null if:
 * - No entry exists for the key
 * - The entry has expired (TTL exceeded)
 * - A read failure occurs (logs warning, returns null)
 */
export async function getCachedOutput(
  key: CacheKeyComponents,
): Promise<CachedAiOutput | null> {
  try {
    const cacheKey = `${AI_CACHE_PREFIX}${generateCacheKey(key)}`;
    return await cacheLayer.get<CachedAiOutput>(cacheKey);
  } catch (error) {
    console.warn(
      "[ai-cache] Read failure during cache lookup, proceeding without cache:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Stores an AI output in the cache with the given TTL.
 *
 * @param key - The cache key components identifying this output.
 * @param output - The AI output to cache.
 * @param ttl - Time-to-live in seconds.
 */
export async function setCachedOutput(
  key: CacheKeyComponents,
  output: CachedAiOutput,
  ttl: number,
): Promise<void> {
  try {
    const cacheKey = `${AI_CACHE_PREFIX}${generateCacheKey(key)}`;
    await cacheLayer.set<CachedAiOutput>(cacheKey, output, ttl);
  } catch (error) {
    console.warn(
      "[ai-cache] Write failure during cache store, output returned without caching:",
      error instanceof Error ? error.message : error,
    );
  }
}
