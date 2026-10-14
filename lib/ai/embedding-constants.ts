/**
 * Embedding constants — pure leaf module with no runtime imports.
 *
 * `lib/ai/embeddings.ts` pulls `@/lib/env` (via `cache-layer`) at import
 * time, so any script importing embedding constants transitively required the
 * full server env (`DATABASE_URL`, `BETTER_AUTH_SECRET`, ...). The model
 * catalog drift check only needs the model identifier, so it imports from
 * here instead. `embeddings.ts` re-exports these for backwards compatibility.
 */

export const EMBEDDING_MODEL = "gemini-embedding-001";
export const EMBEDDING_DIMENSIONS = 768;
export const EMBEDDING_CACHE_TTL_SECONDS = 60 * 60 * 24; // 24 hours
/** Ingestion: a `null` here is permanent data loss until the backfill runs. */
export const EMBEDDING_MAX_ATTEMPTS_WRITE = 3;
/** Retrieval: fail fast to lexical rather than stall quote generation. */
export const EMBEDDING_MAX_ATTEMPTS_READ = 1;
