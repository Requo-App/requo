/**
 * Client-safe acceptance copy.
 *
 * The acceptance text is rendered by the public response form, which is a
 * client component. It lives in its own module — with no Node imports — so
 * the server-only snapshot hashing in `acceptance.ts` never enters the
 * browser module graph.
 */

export const QUOTE_ACCEPTANCE_TEXT_VERSION = 1;

export const QUOTE_ACCEPTANCE_TEXT =
  "I confirm that I have reviewed this quote and agree to the scope, pricing, and terms shown above.";

export const QUOTE_ACCEPTANCE_METHOD_TYPED_NAME = "typed_name" as const;
