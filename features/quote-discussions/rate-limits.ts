/**
 * Public quote discussion writes use the same three independent ceilings as
 * the response and revision endpoints: per fingerprint, per IP, and per quote.
 * The quote-wide ceiling sits above legitimate back-and-forth so one sender
 * cannot lock the real customer out of their own conversation.
 */
export const publicQuoteDiscussionRateLimit = {
  limit: 8,
  ipLimit: 16,
  scopeLimit: 120,
  windowMs: 15 * 60 * 1000,
} as const;
