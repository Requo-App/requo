/**
 * Shared rate-limit budget for the public inquiry intake.
 *
 * The upload endpoint and the submission endpoint share one budget, so a
 * caller cannot get more attempts by uploading through one and submitting
 * through the other.
 *
 * Three buckets, checked in order:
 *
 * - `limit` — one fingerprint (IP + User-Agent). Fine-grained, and the
 *   User-Agent is client-controlled, so it is the first line, not the bound.
 * - `ipLimit` — one IP address for the scope. This is what actually bounds
 *   a sender that rotates its User-Agent.
 * - `scopeLimit` — the whole business + form. A backstop against a flood
 *   from many addresses. It sits far above legitimate traffic on purpose: a
 *   low value would let one sender lock the form for every other customer.
 */
export const publicInquiryRateLimit = {
  limit: 6,
  ipLimit: 12,
  scopeLimit: 120,
  windowMs: 10 * 60 * 1000,
} as const;
