import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { and, count, eq, gte } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { publicActionEvents } from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

type AssertPublicActionRateLimitInput = {
  action:
    | "ai-file-import"
    | "demo-request"
    | "inquiry-attachment-download"
    | "public-inquiry-submit"
    | "public-quote-respond"
    | "public-quote-revision"
    | "approval-respond"
    | "approval-artifact-view";
  scope: string;
  limit: number;
  windowMs: number;
  /**
   * Ceiling for the whole scope, independent of any client-supplied
   * fingerprint. Rotating the User-Agent mints a new fingerprint bucket,
   * so the fingerprint limit alone does not bound a motivated caller.
   * When omitted, no scope-wide counter is kept and the fingerprint limit
   * is the only bound.
   */
  scopeLimit?: number;
};

type HeaderStore = Pick<Headers, "get">;

const zeroedIpv6Address = "0000:0000:0000:0000:0000:0000:0000:0000";

export function isUsableClientIp(headerValue: string | null | undefined) {
  if (!headerValue) {
    return false;
  }

  const normalizedValue = headerValue.trim().toLowerCase();

  return Boolean(
    normalizedValue &&
      normalizedValue !== "unknown" &&
      normalizedValue !== "::" &&
      normalizedValue !== zeroedIpv6Address,
  );
}

export function getForwardedIpAddress(headerValue: string | null): string | null {
  if (!headerValue) {
    return null;
  }

  return headerValue
    .split(",")
    .map((segment) => segment.trim())
    .find(isUsableClientIp) ?? null;
}

export function getPublicActionClientIpAddress(headerStore: HeaderStore) {
  const ipAddressCandidates = [
    getForwardedIpAddress(headerStore.get("x-forwarded-for")),
    headerStore.get("cf-connecting-ip"),
    headerStore.get("x-real-ip"),
  ];

  return ipAddressCandidates.find(isUsableClientIp) ?? "unknown";
}

async function getPublicActionFingerprint(scope: string) {
  const headerStore = await headers();
  const ipAddress = getPublicActionClientIpAddress(headerStore);
  const userAgent = headerStore.get("user-agent") ?? "unknown";

  return createHash("sha256")
    .update(`${scope}:${ipAddress}:${userAgent}`)
    .digest("hex");
}

/**
 * Key for the scope-wide counter. It deliberately contains nothing the
 * client controls, so it bounds a caller that rotates its User-Agent (or
 * any other fingerprint input) to change buckets.
 */
function getPublicActionScopeKey(scope: string) {
  return `scope:${scope}`;
}

/**
 * Business-scoped rate limiter. Uses the scope directly as the key
 * (no IP fingerprinting) — suitable for authenticated server actions
 * where the business identity is already verified.
 */
export async function assertBusinessActionRateLimit({
  action,
  scope,
  limit,
  windowMs,
}: AssertPublicActionRateLimitInput): Promise<boolean> {
  const key = scope;
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  try {
    const [countRow] = await db
      .select({
        count: count(),
      })
      .from(publicActionEvents)
      .where(
        and(
          eq(publicActionEvents.action, action),
          eq(publicActionEvents.key, key),
          gte(publicActionEvents.createdAt, windowStart),
        ),
      );

    if (Number(countRow?.count ?? 0) >= limit) {
      return false;
    }

    await db.insert(publicActionEvents).values({
      id: newEntityId(),
      action,
      key,
      createdAt: now,
    });

    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorType =
      error instanceof Error ? error.constructor.name : typeof error;

    console.error(
      "Business rate limiter fail-open: allowing request due to database error",
      {
        error_type: errorType,
        action,
        timestamp: new Date().toISOString(),
        error_message: errorMessage,
      },
    );

    // Fail open for business-scoped actions to avoid blocking legitimate operations
    return true;
  }
}

export async function assertPublicActionRateLimit({
  action,
  scope,
  limit,
  windowMs,
  scopeLimit,
}: AssertPublicActionRateLimitInput) {
  const fingerprint = await getPublicActionFingerprint(scope);
  const scopeKey = getPublicActionScopeKey(scope);
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  try {
    const [countRow] = await db
      .select({
        count: count(),
      })
      .from(publicActionEvents)
      .where(
        and(
          eq(publicActionEvents.action, action),
          eq(publicActionEvents.key, fingerprint),
          gte(publicActionEvents.createdAt, windowStart),
        ),
      );

    if (Number(countRow?.count ?? 0) >= limit) {
      return false;
    }

    const events: (typeof publicActionEvents.$inferInsert)[] = [
      {
        id: newEntityId(),
        action,
        key: fingerprint,
        createdAt: now,
      },
    ];

    if (scopeLimit !== undefined) {
      // The scope-wide ceiling is not influenced by any client-supplied
      // value, so rotating the User-Agent cannot buy more attempts.
      const [scopeCountRow] = await db
        .select({
          count: count(),
        })
        .from(publicActionEvents)
        .where(
          and(
            eq(publicActionEvents.action, action),
            eq(publicActionEvents.key, scopeKey),
            gte(publicActionEvents.createdAt, windowStart),
          ),
        );

      if (Number(scopeCountRow?.count ?? 0) >= scopeLimit) {
        return false;
      }

      events.push({
        id: newEntityId(),
        action,
        key: scopeKey,
        createdAt: now,
      });
    }

    await db.insert(publicActionEvents).values(events);

    return true;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : String(error);
    const errorType =
      error instanceof Error ? error.constructor.name : typeof error;

    console.error(
      "Rate limiter fail-closed: denying request due to database error",
      {
        error_type: errorType,
        action,
        timestamp: new Date().toISOString(),
        error_message: errorMessage,
      },
    );

    return false;
  }
}
