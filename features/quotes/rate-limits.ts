/**
 * Shared rate-limit budget for the public quote surface.
 *
 * The respond and revision endpoints use separate budgets so a caller cannot
 * spend one bucket with the other. Three buckets are checked per request:
 *
 * - `limit` — one fingerprint (IP + User-Agent). Fine-grained, and the
 *   User-Agent is client-controlled, so it is the first line, not the bound.
 * - `ipLimit` — one IP address for the scope. This is what actually bounds a
 *   sender that rotates its User-Agent.
 * - `scopeLimit` — the whole quote. A backstop against a flood from many
 *   addresses. It sits far above legitimate traffic on purpose: a low value
 *   would let one sender lock the quote for the actual customer.
 */
export const publicQuoteRespondRateLimit = {
  limit: 6,
  ipLimit: 12,
  scopeLimit: 60,
  windowMs: 15 * 60 * 1000,
} as const;

export const publicQuoteRevisionRateLimit = {
  limit: 4,
  ipLimit: 8,
  scopeLimit: 40,
  windowMs: 15 * 60 * 1000,
} as const;
