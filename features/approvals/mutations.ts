import "server-only";

import { and, eq, isNotNull, lte } from "drizzle-orm";

import { writeAuditLog } from "@/features/audit/mutations";
import { notifyApprovalEvent } from "@/features/approvals/notifications";
import {
  buildApprovalSnapshot,
  hashApprovalSnapshot,
  isApprovalSubjectType,
} from "@/features/approvals/snapshots";
import type { BusinessMemberRole } from "@/lib/business-members";
import { hasBusinessRoleAccess } from "@/lib/business-members";
import { db } from "@/lib/db/client";
import {
  approvalArtifacts,
  approvalChains,
  approvals,
  businesses,
  paymentScheduleItems,
  inquiries,
  quotes,
  type ApprovalState,
  type ApprovalSubjectType,
} from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";
import { assertPublicActionRateLimit } from "@/lib/public-action-rate-limit";
import { hashOpaqueToken } from "@/lib/security/tokens";
import { createQuotePublicToken } from "@/features/quotes/utils";
import { validateSignerName } from "@/features/quotes/acceptance";
import { recordAnalyticsEvent } from "@/features/analytics/tracking";
import { hashOpaqueToken as hashVisitor } from "@/lib/security/tokens";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const approvalRespondRateLimit = {
  action: "approval-respond",
  limit: 30,
  windowMs: 10 * 60 * 1000,
} as const;

export type RequestApprovalInput = {
  businessId: string;
  subjectType: ApprovalSubjectType;
  quoteId?: string | null;
  inquiryId?: string | null;
  scheduleItemId?: string | null;
  artifactId?: string | null;
  title: string;
  state: Record<string, unknown>;
  requesterUserId: string;
  requesterRole: BusinessMemberRole;
  requesterName?: string | null;
  requesterEmail?: string | null;
  expiresAt?: Date | null;
  now?: Date;
};

function assertSubjectCombination(input: RequestApprovalInput) {
  const hasQuote = Boolean(input.quoteId);
  const hasInquiry = Boolean(input.inquiryId);
  const hasItem = Boolean(input.scheduleItemId);

  const valid =
    (input.subjectType === "proof" && hasQuote !== hasInquiry && !hasItem) ||
    (input.subjectType === "final_count" && hasQuote && !hasInquiry && !hasItem) ||
    (input.subjectType === "asset" && hasQuote !== hasInquiry && !hasItem) ||
    (input.subjectType === "milestone" && hasItem && !hasQuote && !hasInquiry) ||
    (input.subjectType === "hold_confirmation" && hasQuote !== hasInquiry && !hasItem);

  if (!valid) {
    throw new Error("Approval subject target does not match its kind.");
  }
}

/**
 * Business creates an approval (staff+): chain + version 1 `pending` with a
 * customer token link. All subject targets are verified for existence and
 * tenant ownership — no path permits an arbitrary unrelated UUID.
 */
export async function requestApprovalForBusiness(input: RequestApprovalInput) {
  if (!isApprovalSubjectType(input.subjectType)) {
    throw new Error("Unknown approval subject type.");
  }

  if (!hasBusinessRoleAccess(input.requesterRole, "staff")) {
    throw new Error("Business membership is required to request approval.");
  }

  assertSubjectCombination(input);

  const title = input.title.trim().slice(0, 200);
  if (!title) {
    throw new Error("Approval title is required.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    if (input.quoteId) {
      const [quote] = await tx
        .select({ id: quotes.id, customerEmail: quotes.customerEmail, customerName: quotes.customerName })
        .from(quotes)
        .where(and(eq(quotes.id, input.quoteId), eq(quotes.businessId, input.businessId)))
        .limit(1);

      if (!quote) throw new Error("Quote not found.");
    }

    if (input.inquiryId) {
      const [inquiry] = await tx
        .select({ id: inquiries.id })
        .from(inquiries)
        .where(and(eq(inquiries.id, input.inquiryId), eq(inquiries.businessId, input.businessId)))
        .limit(1);

      if (!inquiry) throw new Error("Inquiry not found.");
    }

    if (input.scheduleItemId) {
      const [item] = await tx
        .select({ id: paymentScheduleItems.id })
        .from(paymentScheduleItems)
        .where(
          and(
            eq(paymentScheduleItems.id, input.scheduleItemId),
            eq(paymentScheduleItems.businessId, input.businessId),
          ),
        )
        .limit(1);

      if (!item) throw new Error("Schedule item not found.");
    }

    let artifactVersion: number | null = null;

    if (input.artifactId) {
      const [artifact] = await tx
        .select({ id: approvalArtifacts.id, artifactVersion: approvalArtifacts.artifactVersion })
        .from(approvalArtifacts)
        .where(
          and(
            eq(approvalArtifacts.id, input.artifactId),
            eq(approvalArtifacts.businessId, input.businessId),
          ),
        )
        .limit(1);

      if (!artifact) throw new Error("Artifact not found.");
      artifactVersion = artifact.artifactVersion;
    } else if (input.subjectType === "proof" || input.subjectType === "asset") {
      throw new Error("Proof and asset approvals require an artifact.");
    }

    const [business] = await tx
      .select({ name: businesses.name })
      .from(businesses)
      .where(eq(businesses.id, input.businessId))
      .limit(1);

    if (!business) throw new Error("Business not found.");

    const rawToken = createQuotePublicToken();
    const snapshot = buildApprovalSnapshot({
      subjectType: input.subjectType,
      title,
      state: input.state,
      artifactId: input.artifactId,
      artifactVersion,
      quoteId: input.quoteId,
    });

    const chainId = newEntityId();
    const approvalId = newEntityId();

    await tx.insert(approvalChains).values({
      id: chainId,
      businessId: input.businessId,
      subjectType: input.subjectType,
      quoteId: input.quoteId ?? null,
      inquiryId: input.inquiryId ?? null,
      scheduleItemId: input.scheduleItemId ?? null,
      createdByUserId: input.requesterUserId,
      createdAt: now,
    });

    await tx.insert(approvals).values({
      id: approvalId,
      businessId: input.businessId,
      chainId,
      version: 1,
      supersedesApprovalId: null,
      artifactId: input.artifactId ?? null,
      recipeKind: "approval",
      recipeVersion: 1,
      state: "pending",
      requesterUserId: input.requesterUserId,
      approverName: null,
      approverEmail: null,
      expiresAt: input.expiresAt ?? null,
      reminderSentAt: null,
      decidedAt: null,
      decisionComment: null,
      snapshot,
      snapshotHash: hashApprovalSnapshot(snapshot),
      customerToken: rawToken,
      customerTokenHash: hashOpaqueToken(rawToken),
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.requesterUserId,
      actorName: input.requesterName,
      actorEmail: input.requesterEmail,
      entityType: input.quoteId ? "quote" : "business",
      entityId: input.quoteId ?? input.businessId,
      action: "approval.requested",
      metadata: { approvalChainId: chainId, subjectType: input.subjectType, title },
      createdAt: now,
    });

    await notifyApprovalEvent(tx, {
      businessId: input.businessId,
      type: "approval_requested",
      title: `Approval requested: ${title}`,
      summary: `A ${input.subjectType} approval is waiting for the customer.`,
      quoteId: input.quoteId ?? null,
      approvalUrl: `/approvals/${rawToken}`,
      now,
    });

    await recordAnalyticsEvent({
      businessId: input.businessId,
      quoteId: input.quoteId ?? null,
      eventType: "approval_requested",
      visitorHash: hashVisitor(`${input.businessId}:${input.requesterUserId}`),
      occurredAt: now,
      metadata: { subjectKind: input.subjectType, approvalChainId: chainId, actor: "user" },
    }).catch(() => undefined);

    return { chainId, approvalId, customerToken: rawToken };
  });
}

export type ApprovalDecision = "approved" | "changes_requested";

export type DecideApprovalByTokenInput = {
  token: string;
  decision: ApprovalDecision;
  /** Typed-name attestation where the recipe requires it. */
  approverName?: string | null;
  approverEmail?: string | null;
  comment?: string | null;
  scope?: string | null;
  now?: Date;
};

/**
 * Customer decides via token link. Conditional-update transition on the
 * exact version row; idempotent replay returns state, never double-writes.
 * Stale versions are rejected by the pending-state predicate.
 */
export async function decideApprovalByToken(input: DecideApprovalByTokenInput) {
  const allowed = await assertPublicActionRateLimit({
    ...approvalRespondRateLimit,
    scope: `approval:${input.token.trim().slice(0, 8)}`,
  });

  if (!allowed) {
    throw new Error("Too many attempts. Please try again later.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ approval: approvals, chain: approvalChains })
      .from(approvals)
      .innerJoin(approvalChains, eq(approvals.chainId, approvalChains.id))
      .where(
        and(
          eq(approvals.customerTokenHash, hashOpaqueToken(input.token.trim())),
          eq(approvals.businessId, approvalChains.businessId),
        ),
      )
      .limit(1);

    if (!row || row.approval.businessId !== row.chain.businessId) {
      throw new Error("Approval not found.");
    }

    const { approval, chain } = row;

    if (approval.state !== "pending") {
      // Idempotent replay: decided state returned, never re-written.
      return { decided: true as const, state: approval.state, approvalId: approval.id, chainId: chain.id };
    }

    if (approval.expiresAt && approval.expiresAt.getTime() <= now.getTime()) {
      await tx
        .update(approvals)
        .set({ state: "expired", decidedAt: now, updatedAt: now })
        .where(
          and(
            eq(approvals.id, approval.id),
            eq(approvals.version, approval.version),
            eq(approvals.state, "pending"),
          ),
        );

      return { decided: true as const, state: "expired" as ApprovalState, approvalId: approval.id, chainId: chain.id };
    }

    // Post-hash artifact tamper check: the pinned snapshot hash must still
    // describe the referenced artifact version.
    if (approval.artifactId) {
      const [artifact] = await tx
        .select({ artifactVersion: approvalArtifacts.artifactVersion })
        .from(approvalArtifacts)
        .where(eq(approvalArtifacts.id, approval.artifactId))
        .limit(1);

      const pinned = (approval.snapshot as Record<string, unknown>)["artifactVersion"];

      if (!artifact || artifact.artifactVersion !== pinned) {
        throw new Error("The file changed after this approval was requested. Please ask the business for a new link.");
      }
    }

    let approverName: string | null = null;

    if (input.decision === "approved") {
      // Attestation bound to version + hash: typed name required (typed-name
      // precedent); bound by storing alongside the pinned snapshot hash.
      approverName = validateSignerName(input.approverName);

      if (!approverName) {
        throw new Error("Please type your full name to approve.");
      }
    }

    if (input.decision === "changes_requested" && !input.comment?.trim()) {
      throw new Error("Please describe the requested changes.");
    }

    const nextState: ApprovalState =
      input.decision === "approved" ? "approved" : "changes_requested";

    const updated = await tx
      .update(approvals)
      .set({
        state: nextState,
        approverName,
        approverEmail: input.approverEmail?.trim().slice(0, 200) || null,
        decisionComment: input.comment?.trim().slice(0, 2000) || null,
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(approvals.id, approval.id),
          eq(approvals.version, approval.version),
          eq(approvals.state, "pending"),
        ),
      )
      .returning({ id: approvals.id });

    if (updated.length === 0) {
      // Lost a race with a concurrent decision or the expiry job: re-read.
      const [current] = await tx
        .select({ state: approvals.state })
        .from(approvals)
        .where(eq(approvals.id, approval.id))
        .limit(1);

      return {
        decided: true as const,
        state: (current?.state ?? "expired") as ApprovalState,
        approvalId: approval.id,
        chainId: chain.id,
      };
    }

    await writeAuditLog(tx, {
      businessId: approval.businessId,
      actorUserId: null,
      entityType: chain.quoteId ? "quote" : "business",
      entityId: chain.quoteId ?? approval.businessId,
      action: "approval.decided",
      metadata: {
        approvalChainId: chain.id,
        subjectType: chain.subjectType,
        decision: nextState,
        actor: "customer",
      },
      createdAt: now,
    });

    await notifyApprovalEvent(tx, {
      businessId: approval.businessId,
      type: nextState === "approved" ? "approval_approved" : "approval_changes_requested",
      title: nextState === "approved" ? "Approval granted" : "Changes requested",
      summary: `The customer ${nextState === "approved" ? "approved" : "requested changes on"} "${String((approval.snapshot as Record<string, unknown>)["title"] ?? "the approval")}".`,
      quoteId: chain.quoteId,
      now,
    });

    await recordAnalyticsEvent({
      businessId: approval.businessId,
      quoteId: chain.quoteId,
      eventType: nextState === "approved" ? "approval_approved" : "approval_changes_requested",
      visitorHash: hashVisitor(`${approval.businessId}:customer:${chain.id}`),
      occurredAt: now,
      metadata: { subjectKind: chain.subjectType, approvalChainId: chain.id, actor: "customer" },
    }).catch(() => undefined);

    return { decided: true as const, state: nextState, approvalId: approval.id, chainId: chain.id };
  });
}

/**
 * Resubmit after changes-requested/expiry (or a new artifact after a
 * decision): supersedes the prior version in the same transaction. The prior
 * row keeps its `approvedAt`/history — supersession, never un-approval.
 */
export async function resubmitApprovalVersionForBusiness(input: {
  businessId: string;
  chainId: string;
  artifactId?: string | null;
  title?: string | null;
  state?: Record<string, unknown> | null;
  expiresAt?: Date | null;
  requesterUserId: string;
  requesterRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!hasBusinessRoleAccess(input.requesterRole, "staff")) {
    throw new Error("Business membership is required to resubmit approval.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [chain] = await tx
      .select()
      .from(approvalChains)
      .where(and(eq(approvalChains.id, input.chainId), eq(approvalChains.businessId, input.businessId)))
      .limit(1);

    if (!chain) throw new Error("Approval chain not found.");

    const versions = await tx
      .select()
      .from(approvals)
      .where(and(eq(approvals.businessId, input.businessId), eq(approvals.chainId, chain.id)))
      .orderBy(approvals.version);

    const latest = versions[versions.length - 1];
    if (!latest) throw new Error("Approval chain is empty.");
    if (latest.state === "pending") {
      throw new Error("The current version is still pending.");
    }

    let artifactVersion: number | null = null;
    const artifactId = input.artifactId ?? latest.artifactId;

    if (artifactId) {
      const [artifact] = await tx
        .select({ id: approvalArtifacts.id, artifactVersion: approvalArtifacts.artifactVersion })
        .from(approvalArtifacts)
        .where(and(eq(approvalArtifacts.id, artifactId), eq(approvalArtifacts.businessId, input.businessId)))
        .limit(1);

      if (!artifact) throw new Error("Artifact not found.");
      artifactVersion = artifact.artifactVersion;
    }

    const priorSnapshot = latest.snapshot as Record<string, unknown>;
    const snapshot = buildApprovalSnapshot({
      subjectType: chain.subjectType,
      title: input.title?.trim().slice(0, 200) || String(priorSnapshot["title"] ?? "Approval"),
      state: input.state ?? (priorSnapshot["state"] as Record<string, unknown> ?? {}),
      artifactId,
      artifactVersion,
      quoteId: chain.quoteId,
    });

    const rawToken = createQuotePublicToken();
    const version = latest.version + 1;
    const approvalId = newEntityId();

    await tx
      .update(approvals)
      .set({ state: "superseded", updatedAt: now })
      .where(
        and(
          eq(approvals.id, latest.id),
          eq(approvals.version, latest.version),
          eq(approvals.state, latest.state),
        ),
      );

    await tx.insert(approvals).values({
      id: approvalId,
      businessId: input.businessId,
      chainId: chain.id,
      version,
      supersedesApprovalId: latest.id,
      artifactId,
      recipeKind: latest.recipeKind,
      recipeVersion: latest.recipeVersion,
      state: "pending",
      requesterUserId: input.requesterUserId,
      approverName: null,
      approverEmail: null,
      expiresAt: input.expiresAt ?? latest.expiresAt,
      reminderSentAt: null,
      decidedAt: null,
      decisionComment: null,
      snapshot,
      snapshotHash: hashApprovalSnapshot(snapshot),
      customerToken: rawToken,
      customerTokenHash: hashOpaqueToken(rawToken),
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.requesterUserId,
      entityType: chain.quoteId ? "quote" : "business",
      entityId: chain.quoteId ?? input.businessId,
      action: "approval.requested",
      metadata: { approvalChainId: chain.id, version, supersedes: latest.id },
      createdAt: now,
    });

    return { chainId: chain.id, approvalId, version, customerToken: rawToken };
  });
}

/**
 * Expiry sweeper (job): targets exact version rows so a newer version is
 * never expired by mistake. Idempotent via the pending-state gate.
 */
export async function expirePendingApprovals(input: { limit?: number; now?: Date } = {}) {
  const now = input.now ?? new Date();
  const limit = input.limit ?? 200;

  const candidates = await db
    .select({ id: approvals.id, version: approvals.version, businessId: approvals.businessId, chainId: approvals.chainId })
    .from(approvals)
    .where(
      and(
        eq(approvals.state, "pending"),
        isNotNull(approvals.expiresAt),
        lte(approvals.expiresAt, now),
      ),
    )
    .limit(limit);

  let expired = 0;

  for (const candidate of candidates) {
    const updated = await db
      .update(approvals)
      .set({ state: "expired", decidedAt: now, updatedAt: now })
      .where(
        and(
          eq(approvals.id, candidate.id),
          eq(approvals.version, candidate.version),
          eq(approvals.state, "pending"),
        ),
      )
      .returning({ id: approvals.id });

    if (updated.length > 0) {
      expired += 1;
      await writeAuditLog(db, {
        businessId: candidate.businessId,
        actorUserId: null,
        entityType: "business",
        entityId: candidate.businessId,
        action: "approval.decided",
        metadata: { approvalChainId: candidate.chainId, decision: "expired", actor: "job" },
        createdAt: now,
      }).catch(() => undefined);
    }
  }

  return { examined: candidates.length, expired };
}

export type { DatabaseTransaction };
