import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import {
  assertLogicalStorageBucket,
  type LogicalStorageBucket,
} from "./buckets";

export type StorageUploadTokenPayload = {
  bucket: LogicalStorageBucket;
  path: string;
  contentType: string;
  maxBytes: number;
  expiresAt: number;
};

function getSigningSecret() {
  const secret =
    process.env.APP_TOKEN_HASH_SECRET?.trim() ||
    process.env.BETTER_AUTH_SECRET?.trim();

  if (!secret) {
    throw new Error(
      "APP_TOKEN_HASH_SECRET or BETTER_AUTH_SECRET is required for local storage uploads.",
    );
  }

  return secret;
}

function sign(payload: string) {
  return createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
}

export function signStorageUploadToken(payload: StorageUploadTokenPayload) {
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );

  return `${encoded}.${sign(encoded)}`;
}

export function verifyStorageUploadToken(
  token: string,
  nowSeconds = Math.floor(Date.now() / 1000),
): StorageUploadTokenPayload | null {
  const [encoded, signature] = token.split(".");

  if (!encoded || !signature) {
    return null;
  }

  const expected = sign(encoded);
  const received = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);

  if (
    received.length !== expectedBuffer.length ||
    !timingSafeEqual(received, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<StorageUploadTokenPayload>;

    if (
      typeof parsed.path !== "string" ||
      typeof parsed.contentType !== "string" ||
      typeof parsed.maxBytes !== "number" ||
      typeof parsed.expiresAt !== "number" ||
      typeof parsed.bucket !== "string"
    ) {
      return null;
    }

    if (parsed.expiresAt <= nowSeconds) {
      return null;
    }

    return {
      bucket: assertLogicalStorageBucket(parsed.bucket),
      path: parsed.path,
      contentType: parsed.contentType,
      maxBytes: parsed.maxBytes,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}
