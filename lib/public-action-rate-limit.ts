import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { and, count, eq, gte, sql } from "drizzle-orm";

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
   * Keep it far above legitimate traffic: it is a backstop against a flood,
   * not the primary throttle, because a low value lets one sender lock a
   * public form for every other customer.
   */
  scopeLimit?: number;
  /**
   * Ceiling for the scope from one IP address. The User-Agent is
   * client-controlled, so this is the bucket that actually bounds a sender
   * that rotates it.
   */
  ipLimit?: number;
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
 * Key for the per-IP counter. The User-Agent is client-controlled, so this
 * is the bucket that actually bounds a sender that rotates it.
 */
async function getPublicActionIpKey(scope: string) {
  const headerStore = await headers();
  const ipAddress = getPublicActionClientIpAddress(headerStore);

  return createHash("sha256")
    .update(`${scope}:${ipAddress}`)
    .digest("hex");
}

/**
 * Advisory-lock namespace for the public rate limiter. Distinct from the
 * business quota and plan-enforcement locks.
 */
const publicActionRateLimitLockNamespace = 391_772_045;

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
  ipLimit,
}: AssertPublicActionRateLimitInput) {
  const fingerprint = await getPublicActionFingerprint(scope);
  const scopeKey = getPublicActionScopeKey(scope);
  const ipKey = ipLimit === undefined ? null : await getPublicActionIpKey(scope);
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  try {
    // The counts and the insert share one transaction behind an advisory
    // lock, so concurrent requests cannot all read the same pre-insert
    // count and slip past a limit.
    return await db.transaction(async (tx) => {
      if (ipLimit !== undefined || scopeLimit !== undefined) {
        await tx.execute(
          sql`select pg_advisory_xact_lock(${publicActionRateLimitLockNamespace}, hashtext(${`${action}:${scopeKey}`}))`,
        );
      }

      const countEvents = async (key: string) => {
        const [row] = await tx
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

        return Number(row?.count ?? 0);
      };

      if ((await countEvents(fingerprint)) >= limit) {
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

      if (ipKey !== null && ipLimit !== undefined) {
        if ((await countEvents(ipKey)) >= ipLimit) {
          return false;
        }

        events.push({
          id: newEntityId(),
          action,
          key: ipKey,
          createdAt: now,
        });
      }

      if (scopeLimit !== undefined) {
        // The scope-wide ceiling is not influenced by any client-supplied
        // value, so rotating the User-Agent cannot buy more attempts.
        if ((await countEvents(scopeKey)) >= scopeLimit) {
          return false;
        }

        events.push({
          id: newEntityId(),
          action,
          key: scopeKey,
          createdAt: now,
        });
      }

      await tx.insert(publicActionEvents).values(events);

      return true;
    });
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
