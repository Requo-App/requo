import "server-only";

import { headers } from "next/headers";

import {
  ADMIN_DASHBOARD_TARGET_ID,
  type AdminAction,
  type AdminTargetType,
} from "@/features/admin/constants";
import { db } from "@/lib/db/client";
import { adminAuditLogs } from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

/**
 * Admin audit logging helpers.
 *
 * Every `/admin` view and mutation writes one row to `admin_audit_logs`.
 * The helpers in this file are the only callers of `db.insert(adminAuditLogs)`
 * in the feature so the audit schema stays a single source of truth.
 *
 * - `writeAdminAuditLog` — raw writer used by both view and mutation flows.
 *   Accepts an optional `tx` so it can participate in a transaction owned by
 *   `runAdminMutationWithAudit`.
 * - `wrapAdminRouteWithViewLog` — decorator for page/list handlers. Writes
 *   the view entry best-effort in a `try/finally` so a transient audit
 *   failure never blocks a render.
 * - `runAdminMutationWithAudit` — transaction envelope for destructive
 *   actions. If the audit insert throws, the surrounding mutation is rolled
 *   back (Requirement 10.4).
 */

type DbClient = typeof db;

/**
 * Drizzle transaction passed down into a mutation callback. Re-derived
 * inline (the repo does not export a shared alias).
 */
export type DbTransaction = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/** Either the top-level client or a transaction — any writer that implements `insert`. */
type DbWriter = DbClient | DbTransaction;

/**
 * Admin identity context the audit writer needs. Callers pass the fields
 * off `requireAdminUser()` explicitly.
 */
export type AdminAuditContext = {
  /** Authoring admin's user id (nullable when the row outlives the user). */
  adminUserId: string;
  /** Authoring admin's email at time of write, for resilient reads. */
  adminEmail: string;
  /**
   * Target user id when the admin is acting through an impersonation
   * session (`session.session.impersonatedBy` is set on Better Auth).
   * When present it is merged into every audit row's metadata per
   * Requirement 10.3.
   */
  impersonatedUserId?: string | null;
};

/** Shape describing what the audit row is recording. */
export type AdminAuditDescriptor = {
  action: AdminAction;
  targetType: AdminTargetType;
  targetId: string;
  metadata?: Record<string, unknown>;
};

/** Input accepted by {@link writeAdminAuditLog}. */
export type WriteAdminAuditLogInput = AdminAuditDescriptor & {
  context: AdminAuditContext;
  /** Optional transaction handle — lets the caller keep the write atomic. */
  tx?: DbWriter;
};

/**
 * Header precedence used to read the request's client IP. Mirrors the
 * Better Auth `ipAddressHeaders` config in `lib/auth/config.ts` so the
 * admin audit log and Better Auth's own rate-limit fingerprinting agree
 * on which header wins.
 */
const ADMIN_IP_ADDRESS_HEADERS = [
  "cf-connecting-ip",
  "x-real-ip",
  "x-forwarded-for",
] as const;

/** Header store interface we accept — satisfied by Next's `Headers` instance. */
type HeaderStore = Pick<Headers, "get">;

function normalizeHeaderValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed.length === 0 ? null : trimmed;
}

/**
 * Extract the first usable IP from an `x-forwarded-for`-style list.
 * Forwarded headers are comma-separated; we pick the first non-empty
 * segment so the originating client IP (left-most) is preferred over
 * intermediary proxies.
 */
function firstForwardedIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  for (const segment of value.split(",")) {
    const normalized = normalizeHeaderValue(segment);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/**
 * Resolve the request's client IP using Better Auth's `ipAddressHeaders`
 * precedence. Exported for tests and other admin helpers that need to
 * record the same IP we'd use for rate limiting.
 */
export function resolveAdminIpAddress(headerStore: HeaderStore): string | null {
  for (const headerName of ADMIN_IP_ADDRESS_HEADERS) {
    const raw = headerStore.get(headerName);
    const value =
      headerName === "x-forwarded-for"
        ? firstForwardedIp(raw)
        : normalizeHeaderValue(raw);

    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Resolve the request user agent. Short helper so tests and other admin
 * helpers can produce the same user-agent value as the audit writer.
 */
export function resolveAdminUserAgent(headerStore: HeaderStore): string | null {
  return normalizeHeaderValue(headerStore.get("user-agent"));
}

function mergeImpersonationMetadata(
  metadata: Record<string, unknown> | undefined,
  context: AdminAuditContext,
): Record<string, unknown> | null {
  const impersonatedUserId = context.impersonatedUserId ?? null;
  const hasMetadata = metadata && Object.keys(metadata).length > 0;

  if (!impersonatedUserId) {
    return hasMetadata ? { ...metadata } : null;
  }

  return {
    ...(metadata ?? {}),
    impersonatedUserId,
    impersonatorAdminId: context.adminUserId,
  };
}

/**
 * Insert a single `admin_audit_logs` row. Used directly for view entries
 * and indirectly (via {@link runAdminMutationWithAudit}) for mutations.
 *
 * The function pulls the request's `ipAddress` + `userAgent` from the
 * incoming headers using the Better Auth precedence so every admin row
 * has the same identifying fingerprint as a Better Auth-issued rate
 * limit entry would. Callers that need the audit write to participate
 * in a wider transaction pass `tx`.
 */
export async function writeAdminAuditLog(
  input: WriteAdminAuditLogInput,
): Promise<void> {
  const headerStore = await headers();
  const ipAddress = resolveAdminIpAddress(headerStore);
  const userAgent = resolveAdminUserAgent(headerStore);
  const writer: DbWriter = input.tx ?? db;

  await writer.insert(adminAuditLogs).values({
    id: newEntityId(),
    adminUserId: input.context.adminUserId,
    adminEmail: input.context.adminEmail,
    action: input.action,
    targetType: input.targetType,
    targetId: input.targetId,
    metadata: mergeImpersonationMetadata(input.metadata, input.context),
    ipAddress,
    userAgent,
    createdAt: new Date(),
  });
}

/** Descriptor accepted by {@link wrapAdminRouteWithViewLog}. */
export type AdminViewDescriptor = {
  action: AdminAction;
  targetType: AdminTargetType;
  /** Defaults to {@link ADMIN_DASHBOARD_TARGET_ID} for list/index views. */
  targetId?: string;
  metadata?: Record<string, unknown>;
};

/**
 * Wrap an admin page/list handler so a `view.*` audit row is recorded
 * once the handler settles. The wrapper:
 *
 * 1. Invokes the wrapped handler and awaits its result.
 * 2. In a `finally` block, writes the view audit row using the supplied
 *    descriptor.
 * 3. Swallows audit-write errors (logging them to the server console)
 *    so a transient audit failure does not take down a render. Rendering
 *    errors from the handler still propagate untouched.
 *
 * This satisfies Requirement 10.1 for page loads without making view
 * logging a hard dependency on an otherwise-successful render.
 */
export function wrapAdminRouteWithViewLog<Args extends unknown[], R>(
  handler: (...args: Args) => Promise<R>,
  context: AdminAuditContext,
  descriptor: AdminViewDescriptor,
): (...args: Args) => Promise<R> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } finally {
      try {
        await writeAdminAuditLog({
          context,
          action: descriptor.action,
          targetType: descriptor.targetType,
          targetId: descriptor.targetId ?? ADMIN_DASHBOARD_TARGET_ID,
          metadata: descriptor.metadata,
        });
      } catch (error) {
        console.error(
          "Failed to write admin view audit log. The page render was not affected.",
          error,
        );
      }
    }
  };
}

/**
 * Run an admin mutation + audit write in a single database transaction.
 *
 * The mutation callback receives the active `tx`, so every downstream
 * write (including any `writeAdminAuditLog` the caller itself performs)
 * can attach to the same transaction. The audit row is inserted inside
 * the transaction after the mutation returns, so an audit-write failure
 * rolls the whole mutation back (Requirement 10.4).
 *
 * When the mutation throws, the transaction aborts and the audit row
 * is not written. Callers that also need a failure-path audit entry
 * should catch the error at the call site and write a `confirmation.failed`
 * row separately.
 */
export async function runAdminMutationWithAudit<T>(
  context: AdminAuditContext,
  descriptor: AdminAuditDescriptor,
  mutationFn: (tx: DbTransaction) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    const result = await mutationFn(tx);

    await writeAdminAuditLog({
      context,
      action: descriptor.action,
      targetType: descriptor.targetType,
      targetId: descriptor.targetId,
      metadata: descriptor.metadata,
      tx,
    });

    return result;
  });
}
