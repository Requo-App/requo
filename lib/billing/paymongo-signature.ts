import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * PayMongo webhook signature verification.
 *
 * PayMongo's current documentation shows a single HMAC-SHA256 hex digest of
 * the raw request body in `Paymongo-Signature`. Deployed endpoints also emit
 * the older keyed header:
 *
 *   `t=<timestamp>,te=<test signature>,li=<live signature>`
 *
 * where each signature is HMAC-SHA256 of `${t}.${rawBody}`. Both formats are
 * accepted so a dashboard-generated endpoint and older accounts verify alike.
 *
 * There is deliberately no timestamp freshness window: PayMongo retries failed
 * deliveries for hours, and a short window would reject legitimate retries.
 * Replay protection comes from the `billing_events` event-id deduplication.
 */

export type PaymongoSignatureMode = "test" | "live";

export type VerifyPaymongoSignatureInput = {
  rawBody: string;
  signatureHeader: string | null | undefined;
  secret: string;
  /** Selects `te` or `li` for the keyed header format. */
  mode: PaymongoSignatureMode;
};

function computeSignature(secret: string, payload: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left.toLowerCase(), "utf8");
  const rightBuffer = Buffer.from(right.toLowerCase(), "utf8");

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function parseKeyedHeader(header: string): Map<string, string> | null {
  if (!header.includes("=")) return null;

  const parts = new Map<string, string>();

  for (const segment of header.split(",")) {
    const separator = segment.indexOf("=");

    if (separator <= 0) continue;

    const key = segment.slice(0, separator).trim();
    const value = segment.slice(separator + 1).trim();

    if (key && value) {
      parts.set(key, value);
    }
  }

  return parts.size > 0 ? parts : null;
}

export function verifyPaymongoSignature({
  rawBody,
  signatureHeader,
  secret,
  mode,
}: VerifyPaymongoSignatureInput): boolean {
  if (!secret || !signatureHeader) {
    return false;
  }

  const header = signatureHeader.trim();

  if (!header) {
    return false;
  }

  const keyed = parseKeyedHeader(header);

  if (keyed) {
    const timestamp = keyed.get("t");
    const signature = keyed.get(mode === "live" ? "li" : "te");

    if (!timestamp || !signature) {
      return false;
    }

    return safeEqualHex(
      computeSignature(secret, `${timestamp}.${rawBody}`),
      signature,
    );
  }

  return safeEqualHex(computeSignature(secret, rawBody), header);
}
