"use server";

import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { headers } from "next/headers";

import { requireAdminUser } from "@/features/admin/access";
import {
  runAdminMutationWithAudit,
  writeAdminAuditLog,
  type AdminAuditContext,
  type DbTransaction,
} from "@/features/admin/audit";
import { consumePasswordConfirmToken } from "@/features/admin/confirm";
import {
  type AdminAction,
  type AdminTargetType,
} from "@/features/admin/constants";
import {
  adminDeleteUserSchema,
  adminDemoteUserSchema,
  adminForceCancelSubscriptionSchema,
  adminForceVerifyEmailSchema,
  adminManualPlanOverrideSchema,
  adminPromoteUserSchema,
  adminRevokeAllSessionsSchema,
  adminStartImpersonationSchema,
  adminSuspendUserSchema,
  adminUnsuspendUserSchema,
  adminArchiveBusinessSchema,
  adminRestoreBusinessSchema,
  adminDeleteBusinessSchema,
  adminOverridePlanTierSchema,
  adminCancelBusinessSubscriptionSchema,
  type AdminDeleteUserInput,
  type AdminDemoteUserInput,
  type AdminForceCancelSubscriptionInput,
  type AdminForceVerifyEmailInput,
  type AdminArchiveBusinessInput,
  type AdminRestoreBusinessInput,
  type AdminDeleteBusinessInput,
  type AdminOverridePlanTierInput,
  type AdminCancelBusinessSubscriptionInput,
  type AdminManualPlanOverrideInput,
  type AdminPromoteUserInput,
  type AdminRevokeAllSessionsInput,
  type AdminStartImpersonationInput,
  type AdminSuspendUserInput,
  type AdminUnsuspendUserInput,
} from "@/features/admin/schemas";
import type { AdminActionResult } from "@/features/admin/types";
import { writeAccountAuditLogsForUser } from "@/features/audit/mutations";
import type { AuditAction } from "@/features/audit/types";
import { getUserSafeErrorMessage } from "@/lib/action-state";
import { auth } from "@/lib/auth/server";
import {
  getOptionalSession,
  type AuthSession,
  type AuthUser,
} from "@/lib/auth/session";
import {
  activateSubscription,
  cancelSubscription,
  getBusinessSubscription,
} from "@/lib/billing/subscription-service";
import type { BillingCurrency, BillingProvider } from "@/lib/billing/types";
import {
  adminAiTag,
  adminAuditTag,
  adminBusinessesTag,
  adminDashboardTag,
  adminEmailsTag,
  adminSubscriptionsTag,
  adminSystemTag,
  adminUsageTag,
  adminUsersTag,
} from "@/lib/cache/admin-tags";
import { db } from "@/lib/db/client";
import {
  businessSubscriptions,
  businesses,
  session,
  user,
} from "@/lib/db/schema";
import type { PlanTier } from "@/lib/plans/plans";

/* ──────────────────────────────────────────────────────────────────────────
 * Shared helpers
 *
 * This file is the single entry point for admin-initiated mutations
 * (tasks 7.1, 8.1, and 9.1 each append here). The helpers below keep
 * the access gate + password re-confirmation + self-target guard logic
 * consistent across every action so the per-action bodies stay small
 * and focused on the actual write.
 * ────────────────────────────────────────────────────────────────────── */

type ZodIssue = { path: PropertyKey[]; message: string };

type FieldErrors = Record<string, string[]>;

/**
 * Summary of a target user resolved once at the top of each mutation.
 * Kept in a shared shape so mutations that need email/name for audit
 * metadata can avoid a second round-trip to `user`.
 */
type TargetUserSummary = {
  id: string;
  email: string;
  name: string;
};

/**
 * Resolve a minimal target-user snapshot for audit metadata. Returns
 * `null` when the user no longer exists (Req 4 error-path copy). Runs
 * outside the mutation transaction — the main tx re-checks inside
 * `runAdminMutationWithAudit` via its own query so concurrent deletes
 * still surface as "target not found".
 */
async function loadTargetUserSummary(
  userId: string,
): Promise<TargetUserSummary | null> {
  const [row] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
    })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return row ?? null;
}

function mapZodFieldErrors(issues: readonly ZodIssue[]): FieldErrors {
  return issues.reduce<FieldErrors>((acc, issue) => {
    const key = issue.path[0]?.toString() ?? "_form";
    const bucket = acc[key] ?? (acc[key] = []);
    bucket.push(issue.message);
    return acc;
  }, {});
}

/**
 * Reject self-targeted destructive actions per Req 4.6. The helper
 * returns an envelope rather than throwing so callers can short-circuit
 * cleanly and avoid leaking the guard into the mutation transaction.
 */
function guardAgainstSelfTarget(
  adminId: string,
  targetId: string,
): AdminActionResult | null {
  if (adminId === targetId) {
    return {
      ok: false,
      error: "You can't run this action on your own account.",
    };
  }

  return null;
}

/**
 * Derive the shared audit context from a resolved admin + session,
 * propagating the impersonation tag when the session is carrying one.
 * Centralising this keeps `metadata.impersonatedUserId` consistent with
 * Req 10.3.
 */
function resolveAuditContext(
  admin: AuthUser,
  authSession: AuthSession,
): AdminAuditContext {
  const impersonatedBy = authSession.session?.impersonatedBy ?? null;

  return {
    adminUserId: admin.id,
    adminEmail: admin.email,
    // When the admin is acting through an impersonation session, the
    // "active" user id is the impersonated target; preserve that on
    // every audit row so reads can still attribute the mutation.
    impersonatedUserId: impersonatedBy ? authSession.user.id : null,
  };
}

type ConfirmTokenFailureResult = {
  ok: false;
  error: string;
};

/**
 * Consume the password confirmation token inside the same logical
 * request as the mutation. On any failure we write a
 * `confirmation.failed` audit row (Req 9.3) with a structured metadata
 * payload describing the intended destructive action so the audit feed
 * shows an attempted + blocked mutation, not a silent reject.
 *
 * The audit write here is best-effort — if the write itself fails the
 * caller still sees the "confirm your password" envelope (no data
 * leaked, no mutation run).
 */
async function processConfirmToken(
  auditContext: AdminAuditContext,
  confirmToken: string,
  intendedAction: AdminAction,
  intendedTargetId: string,
  intendedTargetType: AdminTargetType = "user",
): Promise<{ ok: true } | ConfirmTokenFailureResult> {
  const result = await consumePasswordConfirmToken(confirmToken, {
    adminUserId: auditContext.adminUserId,
    intendedAction,
    intendedTargetId,
    intendedTargetType,
  });

  if (result.ok) {
    return { ok: true };
  }

  try {
    await writeAdminAuditLog({
      context: auditContext,
      action: "confirmation.failed",
      targetType: intendedTargetType,
      targetId: intendedTargetId,
      metadata: {
        reason: result.reason,
        intendedAction,
        intendedTargetId,
        intendedTargetType,
      },
    });
  } catch (error) {
    console.error(
      "Failed to write confirmation.failed admin audit log.",
      error,
    );
  }

  return {
    ok: false,
    error: "Confirm your password to continue.",
  };
}

/**
 * Revalidate every admin-console cache tag.
 *
 * Broad-cascade mutations (user delete, subscription overrides) touch
 * counts, lists, details, and aggregates across the whole console, so
 * they bust everything rather than enumerating affected surfaces.
 * Narrow mutations keep their targeted sets below.
 */
function revalidateAdminDomainTags() {
  revalidateTag(adminDashboardTag(), "max");
  revalidateTag(adminUsersTag(), "max");
  revalidateTag(adminBusinessesTag(), "max");
  revalidateTag(adminSubscriptionsTag(), "max");
  revalidateTag(adminAuditTag(), "max");
  revalidateTag(adminSystemTag(), "max");
  revalidateTag(adminAiTag(), "max");
  revalidateTag(adminEmailsTag(), "max");
  revalidateTag(adminUsageTag(), "max");
}

/**
 * Revalidate the standard set of tags touched by a narrow user-management
 * mutation (verify, revoke, suspend, promote, …). Delete and subscription
 * overrides cascade further and use `revalidateAdminDomainTags` instead.
 */
function revalidateUserManagementTags() {
  revalidateTag(adminUsersTag(), "max");
  revalidateTag(adminAuditTag(), "max");
  revalidateTag(adminDashboardTag(), "max");
}

/**
 * Fan out a destructive admin action to the business-scoped `audit_logs`
 * table so every business the target user is a member of shows a
 * "Requo support acted on your account" row. Errors are logged but do
 * not fail the caller — the admin audit row is the authoritative
 * record, the fan-out is a convenience surface.
 */
async function fanOutAccountAuditLog(
  targetUserId: string,
  action: AuditAction,
  admin: AuthUser,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    await writeAccountAuditLogsForUser(targetUserId, {
      actorUserId: admin.id,
      actorName: admin.name,
      actorEmail: admin.email,
      action,
      metadata: {
        byAdmin: true,
        ...metadata,
      },
      source: "admin",
      createdAt: new Date(),
    });
  } catch (error) {
    console.error(
      "Failed to fan out admin action to business audit logs.",
      error,
    );
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * User management mutations (Req 4.1 – 4.7)
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Force-verify a user's email (Req 4.1). Idempotent — runs the UPDATE
 * unconditionally so repeat invocations converge to `emailVerified = true`
 * without introducing a branch that could race.
 */
export async function forceVerifyEmailAction(
  input: AdminForceVerifyEmailInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminForceVerifyEmailSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, confirmToken } = parsed.data;

  const selfGuard = guardAgainstSelfTarget(admin.id, targetUserId);
  if (selfGuard) {
    return selfGuard;
  }

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "user.force_verify_email",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "user.force_verify_email",
        targetType: "user",
        targetId: target.id,
        metadata: {
          targetEmail: target.email,
        },
      },
      async (tx) => {
        await tx
          .update(user)
          .set({ emailVerified: true, updatedAt: new Date() })
          .where(eq(user.id, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to force-verify user email.", error);
    return {
      ok: false,
      error: "We couldn't verify that email right now. Try again.",
    };
  }

  await fanOutAccountAuditLog(target.id, "account.email_force_verified", admin, {
    accountEmail: target.email,
  });

  revalidateUserManagementTags();

  return {
    ok: true,
    message: `Email verified for ${target.email}.`,
  };
}

/**
 * Revoke every Better Auth session row for the target (Req 4.2). Runs
 * as a direct Drizzle delete inside the audit transaction so any audit
 * failure rolls the delete back. The admin's own session cookie is
 * scoped by user id so their session is never touched.
 */
export async function revokeAllSessionsAction(
  input: AdminRevokeAllSessionsInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminRevokeAllSessionsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, confirmToken } = parsed.data;

  const selfGuard = guardAgainstSelfTarget(admin.id, targetUserId);
  if (selfGuard) {
    return selfGuard;
  }

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "user.revoke_all_sessions",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  let revokedCount = 0;

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "user.revoke_all_sessions",
        targetType: "user",
        targetId: target.id,
        metadata: {
          targetEmail: target.email,
        },
      },
      async (tx: DbTransaction) => {
        const deleted = await tx
          .delete(session)
          .where(eq(session.userId, target.id))
          .returning({ id: session.id });
        revokedCount = deleted.length;
      },
    );
  } catch (error) {
    console.error("Failed to revoke user sessions.", error);
    return {
      ok: false,
      error: "We couldn't revoke sessions right now. Try again.",
    };
  }

  await fanOutAccountAuditLog(target.id, "account.sessions_revoked", admin, {
    accountEmail: target.email,
    revokedSessions: revokedCount,
  });

  revalidateUserManagementTags();

  return {
    ok: true,
    message: `Signed ${target.email} out of ${revokedCount} session${
      revokedCount === 1 ? "" : "s"
    }.`,
  };
}

/**
 * Suspend a target user (Req 4.3). Sets the Better Auth admin plugin's
 * `banned` column to `true` along with the provided reason, and clears
 * any prior expiry so the suspension is indefinite until unsuspended.
 * The plugin's pre-session hook refuses sign-in while `banned = true`.
 */
export async function suspendUserAction(
  input: AdminSuspendUserInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminSuspendUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, reason, confirmToken } = parsed.data;

  const selfGuard = guardAgainstSelfTarget(admin.id, targetUserId);
  if (selfGuard) {
    return selfGuard;
  }

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "user.suspend",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "user.suspend",
        targetType: "user",
        targetId: target.id,
        metadata: {
          targetEmail: target.email,
          reason: reason ?? null,
        },
      },
      async (tx) => {
        await tx
          .update(user)
          .set({
            banned: true,
            banReason: reason ?? null,
            banExpires: null,
            updatedAt: new Date(),
          })
          .where(eq(user.id, target.id));

        // Drop existing sessions so the suspension cannot refresh a cookie
        // cache that still carries the pre-ban user. Better Auth may keep
        // serving the cached session for up to its 300s maxAge, but
        // `requireAdminUser()` already refuses a banned admin from the
        // database on the next request, and the row cannot be refreshed.
        await tx.delete(session).where(eq(session.userId, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to suspend user.", error);
    return {
      ok: false,
      error: "We couldn't suspend that account right now. Try again.",
    };
  }

  await fanOutAccountAuditLog(target.id, "account.suspended", admin, {
    accountEmail: target.email,
    reason: reason ?? null,
  });

  revalidateUserManagementTags();

  return {
    ok: true,
    message: `Suspended ${target.email}.`,
  };
}

/**
 * Reverse a prior suspension (Req 4.4). Clears both the reason and the
 * expiry so the target can sign in again. Intentionally does NOT
 * require self-target rejection — the destructive guard only applies
 * to actions that remove access.
 */
export async function unsuspendUserAction(
  input: AdminUnsuspendUserInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminUnsuspendUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "user.unsuspend",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "user.unsuspend",
        targetType: "user",
        targetId: target.id,
        metadata: {
          targetEmail: target.email,
        },
      },
      async (tx) => {
        await tx
          .update(user)
          .set({
            banned: false,
            banReason: null,
            banExpires: null,
            updatedAt: new Date(),
          })
          .where(eq(user.id, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to unsuspend user.", error);
    return {
      ok: false,
      error: "We couldn't reinstate that account right now. Try again.",
    };
  }

  await fanOutAccountAuditLog(target.id, "account.unsuspended", admin, {
    accountEmail: target.email,
  });

  revalidateUserManagementTags();

  return {
    ok: true,
    message: `Reinstated ${target.email}.`,
  };
}

/**
 * Hard-delete a target user (Req 4.5). We cannot call
 * `auth.api.deleteUser` here because it only deletes the session
 * owner's account, and the admin plugin's `removeUser` endpoint
 * requires a role-based admin check that our env-driven admin model
 * does not satisfy. Instead we inline the essential parts of the
 * existing `lib/auth/config.ts#deleteUser.beforeDelete` hook:
 *
 * 1. Run `getAccountDeletionPreflight` so we never delete a user who
 *    still owns a business (the `businesses.owner_user_id` FK uses
 *    `ON DELETE RESTRICT`, so a raw delete would throw anyway, and we
 *    want a friendly error instead of a 500).
 * 2. Fan out `account.deleted` to every business the target is a
 *    member of BEFORE the delete — once the user row is gone, its
 *    `business_members` rows cascade and we would lose the fan-out
 *    target set.
 * 3. Run the delete + admin audit row inside a single Drizzle
 *    transaction so audit write failures roll the delete back.
 * 4. Clean up storage assets (profile avatar) after the transaction
 *    commits — storage is not transactional, so we do this last.
 *
 * On failure we still record a `confirmation.failed`-style row via the
 * post-mutation audit writer (with `failed: true` metadata) so the
 * audit trail reflects the attempt.
 */
export async function deleteUserAction(
  input: AdminDeleteUserInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminDeleteUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, confirmToken } = parsed.data;

  const selfGuard = guardAgainstSelfTarget(admin.id, targetUserId);
  if (selfGuard) {
    return selfGuard;
  }

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "user.delete",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  // Preflight: mirrors `lib/auth/config.ts#deleteUser.beforeDelete`
  // so the admin sees the same "transfer ownership first" message the
  // normal account delete flow does. Lazy import avoids a cycle —
  // `features/account/queries` imports from this feature's siblings.
  const { getAccountDeletionPreflight } = await import(
    "@/features/account/queries"
  );
  const preflight = await getAccountDeletionPreflight(target.id);

  if (!preflight.allowed) {
    const blocker =
      preflight.blockers[0]?.message ??
      "Resolve the target's owned businesses or ownership before deleting.";

    try {
      await writeAdminAuditLog({
        context: auditContext,
        action: "user.delete",
        targetType: "user",
        targetId: target.id,
        metadata: {
          failed: true,
          reason: "preflight_blocked",
          blockers: preflight.blockers,
          targetEmail: target.email,
        },
      });
    } catch (auditError) {
      console.error("Failed to write blocked-delete admin audit log.", auditError);
    }

    return { ok: false, error: blocker };
  }

  // Fan out BEFORE the delete so we still have membership rows to
  // target. Errors in fan-out are swallowed so the admin action is not
  // blocked by downstream audit writes.
  await fanOutAccountAuditLog(target.id, "account.deleted", admin, {
    accountEmail: target.email,
  });

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "user.delete",
        targetType: "user",
        targetId: target.id,
        metadata: {
          targetEmail: target.email,
          targetName: target.name,
        },
      },
      async (tx) => {
        // Double-check ownership inside the tx — a concurrent business
        // handoff after preflight would otherwise deadlock against the
        // FK. The cheap count here guards against the race without
        // holding extra locks.
        const [ownedRow] = await tx
          .select({ id: businesses.id })
          .from(businesses)
          .where(eq(businesses.ownerUserId, target.id))
          .limit(1);

        if (ownedRow) {
          throw new Error(
            "The target acquired a business ownership after preflight. Retry.",
          );
        }

        await tx.delete(user).where(eq(user.id, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to delete user.", error);

    try {
      await writeAdminAuditLog({
        context: auditContext,
        action: "user.delete",
        targetType: "user",
        targetId: target.id,
        metadata: {
          failed: true,
          reason: error instanceof Error ? error.message : "unknown",
          targetEmail: target.email,
        },
      });
    } catch (auditError) {
      console.error("Failed to write failed-delete admin audit log.", auditError);
    }

    return {
      ok: false,
      error: "We couldn't delete that account right now. Try again.",
    };
  }

  // Storage cleanup is not transactional — perform it only after the
  // delete commits so a rolled-back tx does not orphan a file we
  // already removed. Failures here are logged but not surfaced; the
  // user row is already gone.
  try {
    const { cleanupDeletedAccountAssets } = await import(
      "@/features/account/mutations"
    );
    await cleanupDeletedAccountAssets(target.id);
  } catch (error) {
    console.error(
      "Failed to clean up storage assets for deleted admin target.",
      error,
    );
  }

  revalidateAdminDomainTags();

  return {
    ok: true,
    message: `Deleted ${target.email}.`,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Role management mutations (promote/demote admin)
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Promotes a user to role = "admin", granting access to the admin
 * console. Requires a password re-confirmation token. Self-promotion is
 * a no-op for already-admin users (the UI hides the action), but the
 * self-target guard keeps the server-side invariant explicit.
 */
export async function promoteToAdminAction(
  input: AdminPromoteUserInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminPromoteUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, confirmToken } = parsed.data;

  const selfGuard = guardAgainstSelfTarget(admin.id, targetUserId);
  if (selfGuard) {
    return selfGuard;
  }

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "user.promote_admin",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "user.promote_admin",
        targetType: "user",
        targetId: target.id,
        metadata: {
          targetEmail: target.email,
        },
      },
      async (tx) => {
        await tx
          .update(user)
          .set({ role: "admin", updatedAt: new Date() })
          .where(eq(user.id, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to promote user to admin.", error);
    return {
      ok: false,
      error: "We couldn't promote that user right now. Try again.",
    };
  }

  revalidateUserManagementTags();

  return {
    ok: true,
    message: `Promoted ${target.email} to admin.`,
  };
}

/**
 * Demotes a user from role = "admin" back to "user". Requires a
 * password re-confirmation token and enforces a last-admin guard so the
 * final remaining admin can never be removed via this path, preventing
 * lockout.
 */
export async function demoteFromAdminAction(
  input: AdminDemoteUserInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminDemoteUserSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, confirmToken } = parsed.data;

  const selfGuard = guardAgainstSelfTarget(admin.id, targetUserId);
  if (selfGuard) {
    return selfGuard;
  }

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "user.demote_admin",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  // Last-admin guard: refuse to demote the final remaining admin.
  const [adminCountRow] = await db
    .select({ count: count() })
    .from(user)
    .where(and(eq(user.role, "admin"), eq(user.banned, false)));

  const adminCount = Number(adminCountRow?.count ?? 0);

  if (adminCount <= 1) {
    try {
      await writeAdminAuditLog({
        context: auditContext,
        action: "user.demote_admin",
        targetType: "user",
        targetId: target.id,
        metadata: {
          failed: true,
          reason: "last_admin_guard",
          targetEmail: target.email,
        },
      });
    } catch (auditError) {
      console.error("Failed to write blocked demote admin audit log.", auditError);
    }

    return {
      ok: false,
      error: "You can't remove the last remaining admin.",
    };
  }

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "user.demote_admin",
        targetType: "user",
        targetId: target.id,
        metadata: {
          targetEmail: target.email,
        },
      },
      async (tx) => {
        await tx
          .update(user)
          .set({ role: "user", updatedAt: new Date() })
          .where(eq(user.id, target.id));

        // Drop the target's session rows so a demoted admin cannot keep
        // refreshing a cookie cache that still carries `role = "admin"`.
        // `requireAdminUser()` already refuses the demotion from the
        // database on the next request; this also ends the rest of the
        // session once Better Auth's cache lapses instead of leaving a
        // valid session row behind.
        await tx.delete(session).where(eq(session.userId, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to demote user from admin.", error);
    return {
      ok: false,
      error: "We couldn't demote that user right now. Try again.",
    };
  }

  revalidateUserManagementTags();

  return {
    ok: true,
    message: `Removed admin access from ${target.email}.`,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Subscription override mutations (Req 7.1 – 7.4)
 *
 * IMPORTANT transaction boundary note:
 *
 * `lib/billing/subscription-service.ts` (`activateSubscription` /
 * `cancelSubscription`) does NOT accept an external Drizzle transaction.
 * It opens its own writes against `business_subscriptions` and the
 * denormalized `businesses.plan`, and issues its own `revalidateTag` calls
 * for the affected business.
 *
 * We therefore CANNOT nest the service call inside
 * `runAdminMutationWithAudit`'s transaction (that would mean the admin
 * audit row and the service's own writes share a single transaction).
 * The pragmatic tradeoff documented in `design.md`:
 *
 *   1. Call the service FIRST so any validation/service error aborts
 *      before we touch `admin_audit_logs` (this preserves Property 14:
 *      service errors leave state unchanged).
 *   2. After the service returns successfully, wrap `writeAdminAuditLog`
 *      in its own `db.transaction()` via `runAdminMutationWithAudit` so
 *      the audit write is atomic. The mutation callback is a no-op in
 *      this case — the mutation already happened.
 *
 * Consequence: if the audit insert fails AFTER a successful service
 * call, we cannot trivially roll the service call back. We log the
 * failure and return an error envelope so the admin knows something
 * went sideways; operational follow-up can reconcile from the
 * subscription service's own `revalidateTag` side-effects and the
 * `business_subscriptions` row state. This is an acceptable tradeoff
 * per design.md ("the subscription service owns its own write path").
 *
 * Revalidation: the service already calls `revalidateTag` on the affected
 * business's billing tags. We
 * additionally invalidate the admin-scoped tags here so the admin
 * console reflects the change without a reload.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Default provider + currency used when the admin activates a
 * subscription for a business that has no existing
 * `business_subscriptions` row. Polar + USD are the only values the
 * billing schema accepts today (see `lib/db/schema/subscriptions.ts`), and
 * the admin override surface is not the right place to prompt an admin to
 * pick a provider. If the business already has a row we prefer the row's
 * existing provider/currency so the override stays aligned with its current
 * billing setup.
 */
const DEFAULT_OVERRIDE_PROVIDER: BillingProvider = "polar";
const DEFAULT_OVERRIDE_CURRENCY: BillingCurrency = "USD";

/**
 * Revalidate the admin-scoped cache tags touched by a subscription
 * override. The subscription service already invalidates the user +
 * business billing tags so plan badges on owned businesses refresh;
 * we bust the whole admin domain here because plan changes ripple into
 * counts, lists, details, and the usage aggregates.
 */
function revalidateSubscriptionAdminTags() {
  revalidateAdminDomainTags();
}

/**
 * Record a subscription override admin audit row inside its own
 * transaction so the audit write is atomic on its own. The mutation
 * callback is intentionally empty — the subscription-service call
 * already ran (and is not part of this transaction, see the module
 * comment above).
 */
async function recordSubscriptionOverrideAudit(
  context: AdminAuditContext,
  action: AdminAction,
  targetId: string,
  metadata: Record<string, unknown>,
  targetType: AdminTargetType = "subscription",
): Promise<void> {
  await runAdminMutationWithAudit(
    context,
    {
      action,
      targetType,
      targetId,
      metadata,
    },
    async () => {
      // No DB mutation to perform here — the subscription service has
      // already written. This wrapper exists purely to keep the audit
      // insert inside `db.transaction()` so the audit row is atomic.
    },
  );
}

/**
 * Manually override a user's subscription plan (Req 7.1). Routes the
 * change through `lib/billing/subscription-service.ts#activateSubscription`
 * so the business subscription and the denormalized `businesses.plan`
 * value stay in sync (Property 12).
 *
 * The action is user-keyed for the admin UI, but billing is business-scoped:
 * it selects the non-deleted owned business with the newest subscription,
 * falling back to the newest non-deleted owned business if none has a
 * subscription. No direct writes to `account_subscriptions`.
 *
 * Self-target guard intentionally omitted: the destructive-action
 * self-rejection guard (Req 4.6) only covers actions that remove
 * access. Plan overrides are not on that list and an admin may
 * legitimately need to comp themselves; `design.md` does not
 * require rejecting self-target here.
 */
export async function manualPlanOverrideAction(
  input: AdminManualPlanOverrideInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminManualPlanOverrideSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { userId, plan, reason, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "subscription.manual_plan_override",
    userId,
    "subscription",
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  // Confirm the target user exists so we surface a clean "no such
  // user" message instead of letting the service throw a foreign-key
  // error. The subscription row itself may not exist — in that case
  // `activateSubscription` upserts, which is the behavior we want.
  const [targetUser] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (!targetUser) {
    return { ok: false, error: "That user no longer exists." };
  }

  const [targetBusiness] = await db
    .select({ id: businesses.id })
    .from(businesses)
    .leftJoin(
      businessSubscriptions,
      eq(businessSubscriptions.businessId, businesses.id),
    )
    .where(
      and(eq(businesses.ownerUserId, userId), isNull(businesses.deletedAt)),
    )
    // Match the subscription shown by the admin detail/activity queries.
    .orderBy(
      sql`${businessSubscriptions.createdAt} desc nulls last`,
      desc(businessSubscriptions.id),
      desc(businesses.createdAt),
    )
    .limit(1);

  if (!targetBusiness) {
    return { ok: false, error: "That user has no businesses to bill." };
  }

  // Pull provider/currency from the business's existing subscription row
  // when one exists so the override doesn't silently flip providers (e.g.,
  // Polar→another). When there is no row yet, fall back to the defaults.
  const existing = await getBusinessSubscription(targetBusiness.id);
  const previousPlan: PlanTier | null = existing
    ? (existing.plan as PlanTier)
    : null;
  const provider: BillingProvider =
    existing?.billingProvider ?? DEFAULT_OVERRIDE_PROVIDER;
  const currency: BillingCurrency =
    existing?.billingCurrency ?? DEFAULT_OVERRIDE_CURRENCY;

  // Service call happens BEFORE the audit write so a service error
  // aborts before we've touched `admin_audit_logs`. See the module
  // comment on the transaction boundary tradeoff.
  try {
    await activateSubscription({
      businessId: targetBusiness.id,
      plan,
      provider,
      currency,
      status: "active",
    });
  } catch (error) {
    console.error(
      "Subscription service rejected manual plan override.",
      error,
    );
    return {
      ok: false,
      error: getUserSafeErrorMessage(
        error,
        "Couldn't update this subscription.",
      ),
    };
  }

  // Audit after success. A failure here leaves the subscription
  // mutated without a matching admin audit row — we log aggressively
  // so operations can backfill. This is the documented tradeoff
  // (see module comment) because the subscription service owns its
  // own write path and cannot participate in our Drizzle tx.
  try {
    await recordSubscriptionOverrideAudit(
      auditContext,
      "subscription.manual_plan_override",
      existing?.id ?? userId,
      {
        targetUserId: userId,
        targetEmail: targetUser.email,
        previousPlan,
        nextPlan: plan,
        provider,
        currency,
        reason: reason ?? null,
      },
    );
  } catch (error) {
    console.error(
      "Failed to write admin audit row after subscription plan override. " +
        "The subscription was updated but the admin audit trail is incomplete. " +
        "Backfill may be required.",
      error,
    );
    return {
      ok: false,
      error: "Couldn't record this action. No changes were made.",
    };
  }

  await fanOutAccountAuditLog(
    userId,
    "subscription.plan_changed",
    admin,
    {
      accountEmail: targetUser.email,
      previousPlan,
      nextPlan: plan,
      provider,
      reason: reason ?? null,
    },
  );

  revalidateSubscriptionAdminTags();

  return {
    ok: true,
    message: previousPlan
      ? `Updated ${targetUser.email} from ${previousPlan} to ${plan}.`
      : `Set ${targetUser.email} to ${plan}.`,
  };
}

/**
 * Force-cancel a business subscription (Req 7.2, 7.3). The admin form
 * passes a `business_subscriptions.id`; we resolve the business and its
 * owner, then call `cancelSubscription(businessId)`. That sets status
 * `canceled` with `canceledAt`, preserving grace-period access until
 * `currentPeriodEnd` (Property 13).
 *
 * Like the plan override above, the service owns its own write path,
 * so the audit write runs AFTER the service returns. See the module
 * comment for the transaction boundary rationale.
 */
export async function forceCancelSubscriptionAction(
  input: AdminForceCancelSubscriptionInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminForceCancelSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { subscriptionId, reason, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "subscription.force_cancel",
    subscriptionId,
    "subscription",
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  // Resolve the subscription and its business owner. If the row has
  // already been deleted, surface a friendly message rather than letting
  // the service no-op silently.
  const [subscriptionRow] = await db
    .select({
      id: businessSubscriptions.id,
      businessId: businessSubscriptions.businessId,
      plan: businessSubscriptions.plan,
      status: businessSubscriptions.status,
      provider: businessSubscriptions.billingProvider,
      ownerUserId: businesses.ownerUserId,
      ownerEmail: user.email,
    })
    .from(businessSubscriptions)
    .innerJoin(
      businesses,
      eq(businesses.id, businessSubscriptions.businessId),
    )
    .innerJoin(user, eq(user.id, businesses.ownerUserId))
    .where(eq(businessSubscriptions.id, subscriptionId))
    .limit(1);

  if (!subscriptionRow) {
    return { ok: false, error: "That subscription no longer exists." };
  }

  const ownerRow = {
    id: subscriptionRow.ownerUserId,
    email: subscriptionRow.ownerEmail,
  };

  // Service call first (outside the audit tx — see module comment).
  try {
    const updated = await cancelSubscription(subscriptionRow.businessId);
    if (!updated) {
      // Race: the row existed at lookup time but the service didn't
      // find one to update. Surface it as "no longer exists" rather
      // than a generic failure so the admin retries from a fresh view.
      return { ok: false, error: "That subscription no longer exists." };
    }
  } catch (error) {
    console.error(
      "Subscription service rejected force-cancel override.",
      error,
    );
    return {
      ok: false,
      error: getUserSafeErrorMessage(
        error,
        "Couldn't cancel this subscription.",
      ),
    };
  }

  // Audit after success. Failure here leaves the cancellation in
  // place without a matching admin audit row — log loudly and return
  // an error so operators can reconcile.
  try {
    await recordSubscriptionOverrideAudit(
      auditContext,
      "subscription.force_cancel",
      subscriptionRow.id,
      {
        targetUserId: ownerRow.id,
        targetEmail: ownerRow.email,
        previousPlan: subscriptionRow.plan,
        nextPlan: subscriptionRow.plan,
        previousStatus: subscriptionRow.status,
        provider: subscriptionRow.provider,
        reason: reason ?? null,
      },
    );
  } catch (error) {
    console.error(
      "Failed to write admin audit row after subscription force-cancel. " +
        "The subscription was canceled but the admin audit trail is " +
        "incomplete. Backfill may be required.",
      error,
    );
    return {
      ok: false,
      error: "Couldn't record this action. No changes were made.",
    };
  }

  await fanOutAccountAuditLog(
    ownerRow.id,
    "subscription.canceled",
    admin,
    {
      accountEmail: ownerRow.email,
      previousPlan: subscriptionRow.plan,
      nextPlan: subscriptionRow.plan,
      previousStatus: subscriptionRow.status,
      provider: subscriptionRow.provider,
      reason: reason ?? null,
    },
  );

  revalidateSubscriptionAdminTags();

  return {
    ok: true,
    message: `Canceled ${ownerRow.email}'s subscription.`,
  };
}

/**
 * Revalidate the standard set of tags touched by a narrow business
 * lifecycle mutation (archive, restore, soft-delete). Lists, counts,
 * and the audit feed all change; subscription aggregates do not.
 */
function revalidateBusinessLifecycleTags() {
  revalidateTag(adminBusinessesTag(), "max");
  revalidateTag(adminDashboardTag(), "max");
  revalidateTag(adminAuditTag(), "max");
}

/** Minimal business snapshot for lifecycle guards + audit metadata. */
type TargetBusinessSummary = {
  id: string;
  name: string;
  slug: string;
  archivedAt: Date | null;
  deletedAt: Date | null;
};

async function loadTargetBusinessSummary(
  businessId: string,
): Promise<TargetBusinessSummary | null> {
  const [row] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      archivedAt: businesses.archivedAt,
      deletedAt: businesses.deletedAt,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  return row ?? null;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Business lifecycle mutations (archive / restore / soft-delete)
 *
 * Soft state only: archive sets `archivedAt`, delete sets `deletedAt`
 * (clearing any archive), restore clears both. No hard deletes — the
 * rows stay queryable on the detail page and the audit trail keeps the
 * full history. Each action is gated by the password re-confirmation
 * token and recorded as a `business.*` admin audit row, mirroring the
 * user-management mutations above.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Archive a business (read-only, hidden from active views, restorable).
 * Rejects deleted or already-archived rows so repeat invocations
 * surface state instead of silently no-opping.
 */
export async function archiveBusinessAction(
  input: AdminArchiveBusinessInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminArchiveBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { businessId, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "business.archive",
    businessId,
    "business",
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetBusinessSummary(businessId);
  if (!target) {
    return { ok: false, error: "That business no longer exists." };
  }
  if (target.deletedAt) {
    return {
      ok: false,
      error: "That business is deleted. Restore it before archiving.",
    };
  }
  if (target.archivedAt) {
    return { ok: false, error: "That business is already archived." };
  }

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "business.archive",
        targetType: "business",
        targetId: target.id,
        metadata: {
          businessName: target.name,
          businessSlug: target.slug,
        },
      },
      async (tx) => {
        await tx
          .update(businesses)
          .set({
            archivedAt: new Date(),
            archivedBy: admin.id,
            deletedAt: null,
            deletedBy: null,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to archive business.", error);
    return {
      ok: false,
      error: "We couldn't archive that business right now. Try again.",
    };
  }

  revalidateBusinessLifecycleTags();

  return { ok: true, message: `Archived ${target.name}.` };
}

/**
 * Restore an archived or deleted business back to active. Clears both
 * `archivedAt` and `deletedAt` so a trashed-then-archived edge state
 * converges to active in one step.
 */
export async function restoreBusinessAction(
  input: AdminRestoreBusinessInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminRestoreBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { businessId, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "business.restore",
    businessId,
    "business",
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetBusinessSummary(businessId);
  if (!target) {
    return { ok: false, error: "That business no longer exists." };
  }
  if (!target.archivedAt && !target.deletedAt) {
    return { ok: false, error: "That business is already active." };
  }

  const fromState = target.deletedAt ? "deleted" : "archived";

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "business.restore",
        targetType: "business",
        targetId: target.id,
        metadata: {
          businessName: target.name,
          businessSlug: target.slug,
          from: fromState,
        },
      },
      async (tx) => {
        await tx
          .update(businesses)
          .set({
            archivedAt: null,
            archivedBy: null,
            deletedAt: null,
            deletedBy: null,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to restore business.", error);
    return {
      ok: false,
      error: "We couldn't restore that business right now. Try again.",
    };
  }

  revalidateBusinessLifecycleTags();

  return { ok: true, message: `Restored ${target.name}.` };
}

/**
 * Soft-delete a business (hidden from lists, restorable from the
 * detail page). Clears any archive flag so restore converges to
 * active. There is no admin hard-delete — permanent removal stays
 * with the owner's business deletion flow.
 */
export async function deleteBusinessAction(
  input: AdminDeleteBusinessInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminDeleteBusinessSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { businessId, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "business.delete",
    businessId,
    "business",
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetBusinessSummary(businessId);
  if (!target) {
    return { ok: false, error: "That business no longer exists." };
  }
  if (target.deletedAt) {
    return { ok: false, error: "That business is already deleted." };
  }

  try {
    await runAdminMutationWithAudit(
      auditContext,
      {
        action: "business.delete",
        targetType: "business",
        targetId: target.id,
        metadata: {
          businessName: target.name,
          businessSlug: target.slug,
          wasArchived: Boolean(target.archivedAt),
        },
      },
      async (tx) => {
        await tx
          .update(businesses)
          .set({
            archivedAt: null,
            archivedBy: null,
            deletedAt: new Date(),
            deletedBy: admin.id,
            updatedAt: new Date(),
          })
          .where(eq(businesses.id, target.id));
      },
    );
  } catch (error) {
    console.error("Failed to delete business.", error);
    return {
      ok: false,
      error: "We couldn't delete that business right now. Try again.",
    };
  }

  revalidateBusinessLifecycleTags();

  return { ok: true, message: `Deleted ${target.name}.` };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Business subscription mutations (business-scoped)
 *
 * Unlike the legacy user-keyed overrides above (which resolve the
 * owner's first business), these act on one explicit `businessId` via
 * the subscription service — the same write path as checkout and
 * webhooks, so `business_subscriptions` and the `businesses.plan`
 * cache stay in sync. No `account_subscriptions` involvement.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Manually set a business's plan. Upserts the `business_subscriptions`
 * row (free businesses have none) and syncs the `businesses.plan`
 * cache through the service. Provider/currency carry over from the
 * existing row so the override never silently flips providers.
 */
export async function overridePlanTierAction(
  input: AdminOverridePlanTierInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminOverridePlanTierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { businessId, plan, reason, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "subscription.manual_plan_override",
    businessId,
    "business",
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetBusinessSummary(businessId);
  if (!target) {
    return { ok: false, error: "That business no longer exists." };
  }

  const existing = await getBusinessSubscription(businessId);
  const previousPlan: PlanTier | null = existing
    ? (existing.plan as PlanTier)
    : null;
  const provider: BillingProvider =
    existing?.billingProvider ?? DEFAULT_OVERRIDE_PROVIDER;
  const currency: BillingCurrency =
    existing?.billingCurrency ?? DEFAULT_OVERRIDE_CURRENCY;

  try {
    await activateSubscription({
      businessId,
      plan,
      provider,
      currency,
      status: "active",
    });
  } catch (error) {
    console.error(
      "Subscription service rejected business plan override.",
      error,
    );
    return {
      ok: false,
      error: getUserSafeErrorMessage(
        error,
        "Couldn't update this subscription.",
      ),
    };
  }

  try {
    await recordSubscriptionOverrideAudit(
      auditContext,
      "subscription.manual_plan_override",
      existing?.id ?? businessId,
      {
        targetBusinessId: businessId,
        businessName: target.name,
        businessSlug: target.slug,
        previousPlan,
        nextPlan: plan,
        provider,
        currency,
        reason: reason ?? null,
      },
      "business",
    );
  } catch (error) {
    console.error(
      "Failed to write admin audit row after business plan override. " +
        "The subscription was updated but the admin audit trail is incomplete. " +
        "Backfill may be required.",
      error,
    );
    return {
      ok: false,
      error: "Couldn't record this action. No changes were made.",
    };
  }

  revalidateSubscriptionAdminTags();

  return {
    ok: true,
    message: previousPlan
      ? `Updated ${target.name} from ${previousPlan} to ${plan}.`
      : `Set ${target.name} to ${plan}.`,
  };
}

/**
 * Cancel a business's subscription. Keeps paid access until
 * `currentPeriodEnd` per the service contract, then the plan
 * resolves back to free.
 */
export async function cancelBusinessSubscriptionAction(
  input: AdminCancelBusinessSubscriptionInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminCancelBusinessSubscriptionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { businessId, reason, confirmToken } = parsed.data;

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "subscription.force_cancel",
    businessId,
    "business",
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetBusinessSummary(businessId);
  if (!target) {
    return { ok: false, error: "That business no longer exists." };
  }

  const existing = await getBusinessSubscription(businessId);
  if (!existing) {
    return { ok: false, error: "That business has no subscription to cancel." };
  }
  if (existing.status === "canceled" || existing.status === "expired") {
    return { ok: false, error: "That subscription is already canceled." };
  }

  try {
    const updated = await cancelSubscription(businessId);
    if (!updated) {
      return { ok: false, error: "That subscription no longer exists." };
    }
  } catch (error) {
    console.error(
      "Subscription service rejected business subscription cancel.",
      error,
    );
    return {
      ok: false,
      error: getUserSafeErrorMessage(
        error,
        "Couldn't cancel this subscription.",
      ),
    };
  }

  try {
    await recordSubscriptionOverrideAudit(
      auditContext,
      "subscription.force_cancel",
      existing.id,
      {
        targetBusinessId: businessId,
        businessName: target.name,
        businessSlug: target.slug,
        previousPlan: existing.plan,
        provider: existing.billingProvider,
        reason: reason ?? null,
      },
      "business",
    );
  } catch (error) {
    console.error(
      "Failed to write admin audit row after business subscription cancel. " +
        "The subscription was canceled but the admin audit trail is " +
        "incomplete. Backfill may be required.",
      error,
    );
    return {
      ok: false,
      error: "Couldn't record this action. No changes were made.",
    };
  }

  revalidateSubscriptionAdminTags();

  return {
    ok: true,
    message: `Canceled ${target.name}'s subscription.`,
  };
}

/* ──────────────────────────────────────────────────────────────────────────
 * Impersonation mutations (Req 8.1 – 8.6, 10.3)
 *
 * The Better Auth admin plugin ships two server endpoints we route
 * through:
 *
 * - `auth.api.impersonateUser({ body: { userId }, headers })` creates a
 *   fresh session for the target, stamps it with `impersonatedBy =
 *   adminUserId`, and swaps the session cookie.
 * - `auth.api.stopImpersonating({ headers })` reverses the above and
 *   restores the admin's original session cookie (the plugin stashes it
 *   on an `admin_session` cookie during impersonation).
 *
 * The plugin is configured with `adminRoles: ["admin"]`, so
 * `impersonateUser` and the other admin endpoints gate on
 * `user.role === "admin"` (the same source of truth enforced by
 * `requireAdminUser()`). `allowImpersonatingAdmins: false` disallows
 * impersonating another admin server-side; we additionally reject
 * self-targeting administratively before reaching the plugin.
 *
 * Self-target rejection and the password-confirm gate run BEFORE we
 * call the plugin so a refused attempt never touches Better Auth's
 * session machinery. Req 8.6: if an impersonation session is already
 * active, stop it first on a best-effort basis before starting the new
 * one so the plugin's "admin_session" cookie is clean.
 *
 * Stop is a no-op when not impersonating (Req 8.3) and does NOT
 * require a password re-confirmation — the session cookie already
 * proves the admin is acting on their own impersonation session.
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Resolve the originating admin context from an impersonation session.
 * `session.session.impersonatedBy` carries the admin's user id; the
 * live `session.user` is the impersonated target. We fetch the admin
 * row explicitly so audit writes carry the correct admin email and id
 * regardless of whose session is currently active.
 *
 * Returns `null` when the caller is not impersonating, or when the
 * originating admin user no longer exists (rare but possible if the
 * admin was deleted mid-session).
 */
async function resolveImpersonatingAdmin(
  authSession: AuthSession,
): Promise<{ adminUserId: string; adminEmail: string } | null> {
  const impersonatedBy = authSession.session?.impersonatedBy ?? null;
  if (!impersonatedBy) {
    return null;
  }

  const [row] = await db
    .select({ id: user.id, email: user.email })
    .from(user)
    .where(eq(user.id, impersonatedBy))
    .limit(1);

  if (!row) {
    return null;
  }

  return { adminUserId: row.id, adminEmail: row.email };
}

/**
 * Revalidate the admin-scoped cache tags touched by an impersonation
 * lifecycle event. Audit feed + users list both change (the latter
 * because a target user's "last sign-in" moves when a session is
 * created for them).
 */
function revalidateImpersonationTags() {
  revalidateTag(adminUsersTag(), "max");
  revalidateTag(adminAuditTag(), "max");
}

/**
 * Start impersonating a target user (Req 8.1). Flow:
 *
 * 1. `requireAdminUser()` — the caller must be an active admin with
 *    verified email in the allow-list. (This is why
 *    `startImpersonationAction` can't be called while the admin is
 *    already impersonating someone — `requireAdminUser` would see the
 *    impersonated user and reject as non-admin. We accept this: to
 *    switch targets, the admin must explicitly stop first, or reach
 *    this action from a NEW browser session. Req 8.6 is covered via a
 *    defensive pre-cleanup below for the edge case where
 *    `session.impersonatedBy` somehow is set on an allow-listed
 *    account — that can happen briefly during a race if the admin
 *    impersonates themselves, which we already reject in step 3.)
 * 2. Zod validate the payload.
 * 3. Reject self-target (Req 8.5).
 * 4. Consume the password confirmation token (Req 9.x); on failure
 *    write a `confirmation.failed` audit row and bail.
 * 5. If the admin happens to be carrying an `impersonatedBy` flag on
 *    their own session (see note above), stop it first on a
 *    best-effort basis before starting the new one (Req 8.6).
 * 6. Call `auth.api.impersonateUser({ body: { userId }, headers })` so
 *    the plugin swaps the session cookie for a fresh session tagged
 *    with `impersonatedBy = admin.id` and stashes the admin's prior
 *    session on an `admin_session` cookie.
 * 7. Write the `impersonation.start` admin audit row.
 * 8. Revalidate admin-scoped tags so the users list reflects the new
 *    last-session-at value on the target.
 */
export async function startImpersonationAction(
  input: AdminStartImpersonationInput,
): Promise<AdminActionResult> {
  const { session: authSession, user: admin } = await requireAdminUser();
  const auditContext = resolveAuditContext(admin, authSession);

  const parsed = adminStartImpersonationSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "We couldn't verify that request. Refresh and try again.",
      fieldErrors: mapZodFieldErrors(parsed.error.issues),
    };
  }

  const { targetUserId, confirmToken } = parsed.data;

  // Req 8.5 — self-impersonation is always rejected.
  const selfGuard = guardAgainstSelfTarget(admin.id, targetUserId);
  if (selfGuard) {
    return selfGuard;
  }

  const tokenResult = await processConfirmToken(
    auditContext,
    confirmToken,
    "impersonation.start",
    targetUserId,
  );
  if (!tokenResult.ok) {
    return tokenResult;
  }

  const target = await loadTargetUserSummary(targetUserId);
  if (!target) {
    return { ok: false, error: "That user no longer exists." };
  }

  const requestHeaders = await headers();

  // Req 8.6 — if an impersonation session is somehow already active
  // on this caller, stop it first. Best-effort: swallow failures so
  // the new impersonation can still proceed. The normal path is a
  // no-op since `requireAdminUser` above implies we're an admin, not
  // inside an impersonation session.
  if (authSession.session?.impersonatedBy) {
    try {
      await auth.api.stopImpersonating({ headers: requestHeaders });
    } catch (error) {
      console.error(
        "Failed to stop existing impersonation before starting a new one.",
        error,
      );
    }
  }

  try {
    await auth.api.impersonateUser({
      body: { userId: target.id },
      headers: requestHeaders,
    });
  } catch (error) {
    console.error("Failed to start impersonation.", error);
    return {
      ok: false,
      error: getUserSafeErrorMessage(
        error,
        "Couldn't start impersonation right now. Try again.",
      ),
    };
  }

  // Audit after the plugin call so the row only lands when the
  // session swap actually happened. Failure here leaves the
  // impersonation session in place without an audit row — log loudly
  // so operations can reconcile; do NOT roll back the session because
  // the admin is already acting as the target at this point.
  try {
    await writeAdminAuditLog({
      context: auditContext,
      action: "impersonation.start",
      targetType: "user",
      targetId: target.id,
      metadata: {
        targetEmail: target.email,
        targetName: target.name,
      },
    });
  } catch (error) {
    console.error(
      "Failed to write impersonation.start admin audit log. " +
        "The impersonation session is active but the audit trail is " +
        "incomplete. Backfill may be required.",
      error,
    );
  }

  revalidateImpersonationTags();

  return {
    ok: true,
    message: `Impersonating ${target.email}.`,
  };
}

/**
 * Stop an active impersonation session (Req 8.3). Flow:
 *
 * - When there is no session at all, return an error envelope (the
 *   caller isn't signed in, let alone impersonating).
 * - When the session is NOT an impersonation session, return a no-op
 *   success (Req 8.3: "no-op when not impersonating"). This keeps the
 *   "Stop Impersonating" button idempotent from a UX perspective — a
 *   stale banner will resolve itself without erroring.
 * - Otherwise, resolve the originating admin (via
 *   `session.impersonatedBy`), call `auth.api.stopImpersonating({
 *   headers })` to restore the admin session cookie, and write the
 *   `impersonation.stop` audit row using the ORIGINATING admin as the
 *   audit actor. `requireAdminUser` deliberately is NOT called here:
 *   during impersonation the active user is the target, which would
 *   fail the allow-list check; the session cookie itself is the
 *   authorization signal (Req 8.3 explicitly says no password prompt).
 *
 * The audit row records `impersonatedUserId` so the admin audit feed
 * shows which user the admin was acting as when they stopped.
 */
export async function stopImpersonationAction(): Promise<AdminActionResult> {
  const authSession = await getOptionalSession();

  if (!authSession) {
    return { ok: false, error: "You're not signed in." };
  }

  // Req 8.3 — no-op when not impersonating. Return a success envelope
  // so the UI's Stop button can always be safely clicked.
  if (!authSession.session?.impersonatedBy) {
    return { ok: true, message: "Not impersonating." };
  }

  const impersonatedUser: AuthUser = authSession.user;
  const originatingAdmin = await resolveImpersonatingAdmin(authSession);

  if (!originatingAdmin) {
    // The admin user id on the session is stale (deleted mid-session).
    // Best-effort: still try to end the impersonation so the caller
    // isn't stuck in a broken session, but we can't produce a useful
    // audit row without the admin's identity.
    try {
      await auth.api.stopImpersonating({ headers: await headers() });
    } catch (error) {
      console.error(
        "Failed to stop impersonation after losing admin context.",
        error,
      );
      return {
        ok: false,
        error: "Couldn't stop impersonation right now. Try again.",
      };
    }

    revalidateImpersonationTags();

    return {
      ok: true,
      message: "Stopped impersonating.",
    };
  }

  const auditContext: AdminAuditContext = {
    adminUserId: originatingAdmin.adminUserId,
    adminEmail: originatingAdmin.adminEmail,
    // Tag the row with the user we WERE impersonating so the audit
    // feed reads "<admin> stopped impersonating <target>".
    impersonatedUserId: impersonatedUser.id,
  };

  try {
    await auth.api.stopImpersonating({ headers: await headers() });
  } catch (error) {
    console.error("Failed to stop impersonation.", error);
    return {
      ok: false,
      error: getUserSafeErrorMessage(
        error,
        "Couldn't stop impersonation right now. Try again.",
      ),
    };
  }

  // Audit after the plugin call so the row only lands when the
  // session swap actually happened. Same tradeoff as `start` — a
  // failure here leaves the admin session restored without an audit
  // entry; log loudly so operations can reconcile.
  try {
    await writeAdminAuditLog({
      context: auditContext,
      action: "impersonation.stop",
      targetType: "user",
      targetId: impersonatedUser.id,
      metadata: {
        impersonatedUserId: impersonatedUser.id,
        impersonatedEmail: impersonatedUser.email,
      },
    });
  } catch (error) {
    console.error(
      "Failed to write impersonation.stop admin audit log. " +
        "The impersonation session was ended but the audit trail is " +
        "incomplete. Backfill may be required.",
      error,
    );
  }

  revalidateImpersonationTags();

  return {
    ok: true,
    message: `Stopped impersonating ${impersonatedUser.email}.`,
  };
}
