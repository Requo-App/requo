import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { env } from "@/lib/env";

/**
 * Signed capability for a pending inquiry attachment upload.
 *
 * The upload itself goes straight to storage, so the browser needs a
 * reference it can carry back with the inquiry. That reference is a signed
 * token: it names the business, the storage path, the file, and the size,
 * and the server trusts it because it signed it. The client cannot point an
 * inquiry at another business's object or at an arbitrary path.
 */

export type InquiryAttachmentUploadTokenPayload = {
  /** The business the upload belongs to. */
  businessId: string;
  /** Server-issued upload id; also the storage folder. */
  uploadId: string;
  /** Storage path of the uploaded object. */
  storagePath: string;
  /** Original file name. */
  fileName: string;
  /** Size the client reported for the upload, in bytes. */
  size: number;
  /** Expiry, as a unix timestamp in seconds. */
  expiresAt: number;
};

function getTokenSecret() {
  return env.APP_TOKEN_HASH_SECRET ?? env.BETTER_AUTH_SECRET;
}

function signPayload(encodedPayload: string) {
  return createHmac("sha256", getTokenSecret())
    .update(encodedPayload)
    .digest("base64url");
}

export function signInquiryAttachmentUploadToken(
  payload: InquiryAttachmentUploadTokenPayload,
) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
    "base64url",
  );
  const signature = signPayload(encodedPayload);

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies a signed upload token.
 *
 * Returns null for a tampered, malformed, or expired token.
 */
export function verifyInquiryAttachmentUploadToken(
  token: string | null | undefined,
): InquiryAttachmentUploadTokenPayload | null {
  if (typeof token !== "string" || !token) {
    return null;
  }

  const separatorIndex = token.lastIndexOf(".");

  if (separatorIndex <= 0) {
    return null;
  }

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = signPayload(encodedPayload);

  const provided = Buffer.from(signature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");

  if (provided.length !== expected.length) {
    return null;
  }

  if (!timingSafeEqual(provided, expected)) {
    return null;
  }

  let payload: InquiryAttachmentUploadTokenPayload;

  try {
    payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as InquiryAttachmentUploadTokenPayload;
  } catch {
    return null;
  }

  if (
    typeof payload?.businessId !== "string" ||
    typeof payload?.uploadId !== "string" ||
    typeof payload?.storagePath !== "string" ||
    typeof payload?.fileName !== "string" ||
    typeof payload?.size !== "number" ||
    typeof payload?.expiresAt !== "number"
  ) {
    return null;
  }

  if (payload.expiresAt * 1000 <= Date.now()) {
    return null;
  }

  return payload;
}
