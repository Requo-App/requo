/**
 * Standard-Webhooks signing helper for Polar webhook integration
 * tests. Mirrors the algorithm the `@polar-sh/sdk` `validateEvent`
 * helper expects so tests can post raw payloads through the actual
 * `Webhooks` adapter end-to-end (signature verification, payload
 * parsing, event dispatch all included).
 *
 * Algorithm (per the Standard-Webhooks spec used by Polar):
 *
 *   1. `webhookId`        = `crypto.randomUUID()` (any unique string).
 *   2. `webhookTimestamp` = `Math.floor(Date.now() / 1000)`.
 *   3. `toSign`           = `${webhookId}.${webhookTimestamp}.${body}`.
 *   4. `signature`        = `base64(HMAC_SHA256(secret, toSign))`.
 *   5. `webhook-signature` header = `v1,${signature}`.
 *
 * The SDK accepts both the raw webhook secret (the historical value of
 * `POLAR_WEBHOOK_SECRET`) and Polar's current `whsec_`-prefixed form.
 * The actual HMAC key is the raw secret bytes after removing the
 * prefix, so we sign with that directly here.
 */

import { createHmac, randomUUID } from "node:crypto";

/**
 * Result of signing a Polar webhook payload. The `headers` object is
 * shaped to match the keys the `@polar-sh/sdk` validator reads
 * (lowercase). The `body` is returned as-is so callers can pass the
 * exact bytes that were signed to `fetch` / route handlers.
 */
export type SignedPolarPayload = {
  headers: Record<string, string>;
  body: string;
};

/**
 * Signs a raw JSON-serialised Polar webhook payload using the
 * Standard-Webhooks v1 format. The returned `headers` object can be
 * spread directly onto a `fetch` call hitting the Polar webhook
 * route handler.
 *
 * @param secret The raw webhook secret (value of
 *   `POLAR_WEBHOOK_SECRET`). Tests typically use a fixed string
 *   like `"polar-test-secret"`.
 * @param body   The exact request body bytes to sign. Must be the
 *   same string passed to the route handler — any whitespace
 *   difference breaks signature verification.
 */
export function signPolarPayload(
  secret: string,
  body: string,
): SignedPolarPayload {
  const webhookId = randomUUID();
  const webhookTimestamp = Math.floor(Date.now() / 1000);

  const toSign = `${webhookId}.${webhookTimestamp}.${body}`;
  const signature = createHmac("sha256", secret).update(toSign).digest("base64");

  return {
    headers: {
      "webhook-id": webhookId,
      "webhook-timestamp": webhookTimestamp.toString(),
      "webhook-signature": `v1,${signature}`,
    },
    body,
  };
}
