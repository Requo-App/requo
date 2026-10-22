import "server-only";

import { createHash } from "crypto";

import { embed, embedMany } from "ai";
import type { EmbeddingModelV3 } from "@ai-sdk/provider";
import { createGoogleGenerativeAI } from "@ai-sdk/google";

import { cacheLayer } from "@/lib/ai/cache-layer";
import {
  markModelExhausted,
  recordModelTokenUsageDetailed,
  recordModelUsage,
} from "@/lib/ai/capacity-selector";
import {
  EMBEDDING_CACHE_TTL_SECONDS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MAX_ATTEMPTS_READ,
  EMBEDDING_MAX_ATTEMPTS_WRITE,
  EMBEDDING_MODEL,
  EMBEDDING_MODEL_ID,
} from "@/lib/ai/embedding-constants";
import {
  AiProviderError,
  isTransientProviderError,
  wrapProviderError,
} from "@/lib/ai/errors";
import { env, isGeminiConfigured } from "@/lib/env";

/**
 * Embedding service for knowledge retrieval.
 *
 * Uses Gemini `gemini-embedding-001` (768 dimensions) through the Vercel AI
 * SDK. Embeddings are cached by content hash for 24 hours to cut cost and
 * latency. Provider failure is non-fatal: callers receive `null` and must
 * fall back to lexical retrieval.
 *
 * Transient provider failures are retried with backoff before that fallback
 * applies. The retry budget differs by caller: an ingestion failure persists a
 * `null` embedding that only the backfill job can repair, whereas a retrieval
 * failure sits on the user's critical path and is better served by falling
 * back to lexical immediately.
 */

export {
  EMBEDDING_CACHE_TTL_SECONDS,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MAX_ATTEMPTS_READ,
  EMBEDDING_MAX_ATTEMPTS_WRITE,
  EMBEDDING_MODEL,
  EMBEDDING_MODEL_ID,
};

const EMBEDDING_CACHE_PREFIX = "embed:";
const MAX_EMBEDDING_INPUT_LENGTH = 20_000;
const INITIAL_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 5_000;

/**
 * Gemini embedding models are Matryoshka: they default to 3072 dimensions and
 * only return 768 when asked. The dimensionality therefore has to travel with
 * every request — without it the provider returns 3072, the guard below
 * discards the vector, and every call degrades to lexical retrieval while
 * looking like a provider outage.
 */
const EMBEDDING_PROVIDER_OPTIONS = {
  google: { outputDimensionality: EMBEDDING_DIMENSIONS },
} as const;

export type EmbeddingOptions = {
  /**
   * Total provider attempts, including the first. Defaults to the ingestion
   * budget; the retrieval path passes `EMBEDDING_MAX_ATTEMPTS_READ`.
   */
  maxAttempts?: number;
};

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

function cacheKeyFor(text: string): string {
  return `${EMBEDDING_CACHE_PREFIX}${contentHash(text)}`;
}

function normalizeInput(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized.length <= MAX_EMBEDDING_INPUT_LENGTH) {
    return normalized;
  }

  return normalized.slice(0, MAX_EMBEDDING_INPUT_LENGTH);
}

function getEmbeddingModel(): EmbeddingModelV3 | null {
  if (!isGeminiConfigured) {
    return null;
  }

  try {
    const provider = createGoogleGenerativeAI({
      apiKey: env.GEMINI_API_KEY,
    });

    return provider.embeddingModel(EMBEDDING_MODEL);
  } catch {
    return null;
  }
}

async function recordEmbeddingUsage(
  usage: { tokens?: number } | undefined,
): Promise<void> {
  try {
    await recordModelUsage(EMBEDDING_MODEL_ID);
    const tokens = Math.max(0, usage?.tokens ?? 0);
    if (tokens > 0) {
      await recordModelTokenUsageDetailed(EMBEDDING_MODEL_ID, {
        inputTokens: tokens,
        outputTokens: 0,
      });
    }
  } catch {
    // Capacity bookkeeping must never break the embedding fallback contract.
  }
}

async function markEmbeddingExhausted(error: unknown): Promise<void> {
  try {
    await markModelExhausted(EMBEDDING_MODEL_ID, error);
  } catch {
    // Capacity bookkeeping must never break the embedding fallback contract.
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs a provider call with backoff on transient failures.
 *
 * Only errors with positive evidence of being transient are retried (see
 * `isTransientProviderError`) — an unclassifiable error would otherwise be
 * retried blindly, adding latency without improving the odds. The delay
 * honours the provider's `retry-after` when present, otherwise it doubles.
 * Exhaustion rethrows the wrapped `AiProviderError` for the caller to log and
 * convert into its `null` contract.
 */
async function withEmbeddingRetry<T>(
  label: "embed" | "embedMany",
  maxAttempts: number,
  attempt: () => Promise<T>,
): Promise<T> {
  // Guard the bound itself: a non-finite budget would make the exhaustion
  // comparison below always false and retry forever.
  const attempts = Number.isFinite(maxAttempts)
    ? Math.max(1, Math.floor(maxAttempts))
    : EMBEDDING_MAX_ATTEMPTS_WRITE;

  for (let attemptIndex = 1; ; attemptIndex++) {
    try {
      return await attempt();
    } catch (error) {
      const wrapped =
        error instanceof AiProviderError
          ? error
          : wrapProviderError("gemini", error);

      if (attemptIndex >= attempts || !isTransientProviderError(error)) {
        throw wrapped;
      }

      const backoffMs = Math.min(
        wrapped.retryAfterMs ?? INITIAL_BACKOFF_MS * 2 ** (attemptIndex - 1),
        MAX_BACKOFF_MS,
      );

      console.warn(
        `[embeddings] ${label} attempt ${attemptIndex}/${attempts} failed, retrying in ${backoffMs}ms:`,
        wrapped.message,
      );

      await sleep(backoffMs);
    }
  }
}

/**
 * Generates an embedding for a single text. Returns `null` when the provider
 * is unavailable or fails; callers must treat that as a lexical-fallback
 * signal, never as a hard error.
 */
export async function generateEmbedding(
  text: string,
  options: EmbeddingOptions = {},
): Promise<number[] | null> {
  const normalized = normalizeInput(text);

  if (!normalized) {
    return null;
  }

  // Content-hash cache (24h): identical text returns the stored embedding.
  try {
    const cached = await cacheLayer.get<number[]>(cacheKeyFor(normalized));
    if (cached && Array.isArray(cached) && cached.length === EMBEDDING_DIMENSIONS) {
      return cached;
    }
  } catch {
    // Cache unavailable — proceed with a fresh embedding.
  }

  const model = getEmbeddingModel();

  if (!model) {
    return null;
  }

  try {
    const { embedding, usage } = await withEmbeddingRetry(
      "embed",
      options.maxAttempts ?? EMBEDDING_MAX_ATTEMPTS_WRITE,
      () =>
        embed({
          model,
          value: normalized,
          providerOptions: EMBEDDING_PROVIDER_OPTIONS,
        }),
    );
    await recordEmbeddingUsage(usage);

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      console.warn(
        `[embeddings] Unexpected embedding dimension (got ${Array.isArray(embedding) ? embedding.length : "none"}).`,
      );
      return null;
    }

    try {
      await cacheLayer.set<number[]>(
        cacheKeyFor(normalized),
        embedding,
        EMBEDDING_CACHE_TTL_SECONDS,
      );
    } catch {
      // Cache write failure is non-fatal.
    }

    return embedding;
  } catch (error) {
    await markEmbeddingExhausted(error);
    console.warn(
      "[embeddings] Embedding generation failed, falling back to lexical:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}

/**
 * Generates embeddings for many texts in one provider call when possible.
 * Each entry is independent: provider failure on one never rejects the batch.
 */
export async function generateEmbeddings(
  texts: string[],
  options: EmbeddingOptions = {},
): Promise<Array<number[] | null>> {
  if (texts.length === 0) {
    return [];
  }

  const normalized = texts.map(normalizeInput);

  // Batch cache lookups first.
  const cachedResults: Array<number[] | null> = await Promise.all(
    normalized.map(async (text) => {
      if (!text) {
        return null;
      }

      try {
        const cached = await cacheLayer.get<number[]>(cacheKeyFor(text));
        if (
          cached &&
          Array.isArray(cached) &&
          cached.length === EMBEDDING_DIMENSIONS
        ) {
          return cached;
        }
      } catch {
        // Fall through to generation.
      }

      return undefined as unknown as number[] | null;
    }),
  );

  const missingIndexes: number[] = [];
  for (let index = 0; index < cachedResults.length; index++) {
    if (cachedResults[index] === undefined) {
      missingIndexes.push(index);
    }
  }

  const missingTexts = missingIndexes
    .map((index) => normalized[index])
    .filter((text) => Boolean(text));

  let generated: Array<number[] | null> = [];
  if (missingTexts.length > 0) {
    generated = await generateEmbeddingBatch(
      missingTexts,
      options.maxAttempts ?? EMBEDDING_MAX_ATTEMPTS_WRITE,
    );
  }

  const results: Array<number[] | null> = [];
  let generatedIndex = 0;
  for (let index = 0; index < normalized.length; index++) {
    const cached = cachedResults[index];
    if (cached === undefined) {
      results.push(generated[generatedIndex] ?? null);
      generatedIndex++;
    } else {
      results.push(cached);
    }
  }

  return results;
}

async function generateEmbeddingBatch(
  texts: string[],
  maxAttempts: number,
): Promise<Array<number[] | null>> {
  const model = getEmbeddingModel();

  if (!model) {
    return texts.map(() => null);
  }

  // Provider batch limit — keep calls small.
  const BATCH_SIZE = 20;
  const results: Array<number[] | null> = [];

  for (let offset = 0; offset < texts.length; offset += BATCH_SIZE) {
    const slice = texts.slice(offset, offset + BATCH_SIZE);

    try {
      const { embeddings, usage } = await withEmbeddingRetry(
        "embedMany",
        maxAttempts,
        () =>
          embedMany({
            model,
            values: slice,
            maxParallelCalls: 5,
            providerOptions: EMBEDDING_PROVIDER_OPTIONS,
          }),
      );
      await recordEmbeddingUsage(usage);

      for (let index = 0; index < slice.length; index++) {
        const embedding = embeddings[index];
        const valid =
          Array.isArray(embedding) &&
          embedding.length === EMBEDDING_DIMENSIONS;

        if (!valid) {
          results.push(null);
          continue;
        }

        try {
          await cacheLayer.set<number[]>(
            cacheKeyFor(slice[index]),
            embedding,
            EMBEDDING_CACHE_TTL_SECONDS,
          );
        } catch {
          // Cache write failure is non-fatal.
        }

        results.push(embedding);
      }
    } catch (error) {
      const wrapped =
        error instanceof AiProviderError
          ? error
          : wrapProviderError("gemini", error);
      await markEmbeddingExhausted(wrapped);

      // A whole slice landing here means those rows persist as `null` and stay
      // lexical-only until the backfill job repairs them, so make it visible
      // rather than only emitting a generic warning.
      console.warn(
        JSON.stringify({
          type: "embedding_batch_failed",
          provider: wrapped.provider,
          statusCode: wrapped.statusCode,
          retryable: wrapped.retryable,
          attempts: maxAttempts,
          chunkCount: slice.length,
          retryAfterMs: wrapped.retryAfterMs,
          reason: wrapped.message,
        }),
      );

      results.push(...slice.map(() => null));
    }
  }

  return results;
}

/**
 * Invalidates the cached embedding for a text (e.g. after content changes).
 */
export async function invalidateEmbeddingCache(text: string): Promise<void> {
  const normalized = normalizeInput(text);

  if (!normalized) {
    return;
  }

  try {
    await cacheLayer.delete(cacheKeyFor(normalized));
  } catch {
    // Cache invalidation failure is non-fatal.
  }
}

/**
 * Cosine similarity between two embedding vectors. Returns 0 for empty or
 * mismatched inputs so callers can treat it as "no signal".
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let index = 0; index < a.length; index++) {
    dot += a[index] * b[index];
    normA += a[index] * a[index];
    normB += b[index] * b[index];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
