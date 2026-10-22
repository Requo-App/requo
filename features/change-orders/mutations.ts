import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";

import { writeAuditLog } from "@/features/audit/mutations";
import { decideApprovalByToken, requestApprovalForBusiness } from "@/features/approvals/mutations";
import { notifyChangeOrderEvent } from "@/features/change-orders/notifications";
import { composeChangeOrderSchema } from "@/features/change-orders/schemas";
import type { BusinessMemberRole } from "@/lib/business-members";
import {
  canManageOperationalBusinessSettings,
  hasBusinessRoleAccess,
} from "@/lib/business-members";
import { db } from "@/lib/db/client";
import {
  approvalChains,
  approvals,
  changeOrderLines,
  changeOrders,
  paymentScheduleItems,
  paymentSchedules,
  quoteItems,
  quoteScopeBlocks,
  quotes,
  type ChangeOrder,
} from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";
import { recordAnalyticsEvent } from "@/features/analytics/tracking";
import { hashOpaqueToken } from "@/lib/security/tokens";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function padCoNumber(n: number) {
  return `CO-${String(n).padStart(3, "0")}`;
}

async function requireAcceptedQuote(
  tx: DatabaseTransaction,
  businessId: string,
  quoteId: string,
) {
  const [quote] = await tx
    .select({
      id: quotes.id,
      version: quotes.version,
      status: quotes.status,
      totalInCents: quotes.totalInCents,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
    })
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
    .limit(1);

  if (!quote) throw new Error("Quote not found.");
  if (quote.status !== "accepted") {
    throw new Error("Change orders attach to accepted quotes only.");
  }

  return quote;
}

/** Business composes a draft CO (staff+). Many drafts allowed. */
export async function createDraftChangeOrder(input: {
  businessId: string;
  quoteId: string;
  reason: string;
  customerExplanation?: string | null;
  riskNotes?: string | null;
  dependencies?: string | null;
  actorUserId: string;
  actorRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!hasBusinessRoleAccess(input.actorRole, "staff")) {
    throw new Error("Business membership is required to draft a change order.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const quote = await requireAcceptedQuote(tx, input.businessId, input.quoteId);

    const existing = await tx
      .select({ coNumber: changeOrders.coNumber })
      .from(changeOrders)
      .where(
        and(
          eq(changeOrders.businessId, input.businessId),
          eq(changeOrders.quoteId, input.quoteId),
        ),
      )
      .orderBy(desc(changeOrders.coNumber))
      .limit(1);

    const coNumber = (existing[0]?.coNumber ?? 0) + 1;

    const [row] = await tx
      .insert(changeOrders)
      .values({
        id: newEntityId(),
        businessId: input.businessId,
        quoteId: input.quoteId,
        coNumber,
        displayNumber: padCoNumber(coNumber),
        state: "draft",
        baseQuoteVersion: quote.version,
        reason: input.reason.trim().slice(0, 2000),
        customerExplanation: input.customerExplanation?.trim().slice(0, 2000) || null,
        riskNotes: input.riskNotes?.trim().slice(0, 2000) || null,
        dependencies: input.dependencies?.trim().slice(0, 2000) || null,
        priceDeltaCents: 0,
        approvalChainId: null,
        actorUserId: input.actorUserId,
        decidedAt: null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      entityType: "quote",
      entityId: input.quoteId,
      action: "change_order.created",
      metadata: { changeOrderId: row.id, displayNumber: row.displayNumber },
      createdAt: now,
    });

    return row;
  });
}

export type AddDeltaInput = {
  businessId: string;
  changeOrderId: string;
  targetKind: "line" | "block" | "schedule_item";
  targetQuoteItemId?: string | null;
  targetBlockId?: string | null;
  targetScheduleItemId?: string | null;
  change: "add" | "modify" | "remove";
  payload?: Record<string, unknown> | null;
  actorRole: BusinessMemberRole;
  now?: Date;
};

/** Draft-only delta editing with before-snapshots captured server-side. */
export async function addChangeOrderDelta(input: AddDeltaInput) {
  if (!hasBusinessRoleAccess(input.actorRole, "staff")) {
    throw new Error("Business membership is required to edit a change order.");
  }

  const parsed = composeChangeOrderSchema.shape.deltas.element.safeParse({
    targetKind: input.targetKind,
    targetQuoteItemId: input.targetQuoteItemId ?? null,
    targetBlockId: input.targetBlockId ?? null,
    targetScheduleItemId: input.targetScheduleItemId ?? null,
    change: input.change,
    payload: input.payload ?? null,
  });

  if (!parsed.success) {
    throw new Error("Change delta failed validation.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [co] = await tx
      .select()
      .from(changeOrders)
      .where(
        and(
          eq(changeOrders.id, input.changeOrderId),
          eq(changeOrders.businessId, input.businessId),
        ),
      )
      .limit(1);

    if (!co) throw new Error("Change order not found.");
    if (co.state !== "draft") {
      throw new Error("Only draft change orders can be edited.");
    }

    const beforeSnapshot = await captureBeforeSnapshot(tx, input.businessId, co.quoteId, parsed.data);

    if (parsed.data.change !== "add" && !beforeSnapshot) {
      throw new Error("Change target not found.");
    }

    if (parsed.data.change === "add") {
      // Stable identity for new targets: the payload id doubles as the
      // target reference, so the exactly-one CHECK holds for adds and the
      // derived state can address the new row stably.
      const payloadId = (parsed.data.payload as Record<string, unknown> | null)?.["id"];

      if (typeof payloadId !== "string" || !payloadId) {
        throw new Error("New lines require a full payload with a stable id.");
      }

      if (parsed.data.targetKind === "line") parsed.data.targetQuoteItemId = payloadId;
      if (parsed.data.targetKind === "block") parsed.data.targetBlockId = payloadId;
      if (parsed.data.targetKind === "schedule_item") parsed.data.targetScheduleItemId = payloadId;
    }

    const siblings = await tx
      .select({ position: changeOrderLines.position })
      .from(changeOrderLines)
      .where(eq(changeOrderLines.changeOrderId, co.id));

    const position =
      siblings.length === 0 ? 0 : Math.max(...siblings.map((row) => row.position)) + 1;

    const [delta] = await tx
      .insert(changeOrderLines)
      .values({
        id: newEntityId(),
        businessId: input.businessId,
        changeOrderId: co.id,
        targetKind: parsed.data.targetKind,
        targetQuoteItemId: parsed.data.targetQuoteItemId ?? null,
        targetBlockId: parsed.data.targetBlockId ?? null,
        targetScheduleItemId: parsed.data.targetScheduleItemId ?? null,
        change: parsed.data.change,
        position,
        beforeSnapshot,
        afterSnapshot: (parsed.data.payload ?? null) as Record<string, unknown> | null,
        payload: (parsed.data.payload ?? null) as Record<string, unknown> | null,
        createdAt: now,
      })
      .returning();

    return delta;
  });
}

async function captureBeforeSnapshot(
  tx: DatabaseTransaction,
  businessId: string,
  quoteId: string,
  delta: { targetKind: string; targetQuoteItemId?: string | null; targetBlockId?: string | null; targetScheduleItemId?: string | null; change: string },
): Promise<Record<string, unknown> | null> {
  if (delta.change === "add") return null;

  if (delta.targetKind === "line" && delta.targetQuoteItemId) {
    const [line] = await tx
      .select()
      .from(quoteItems)
      .where(
        and(
          eq(quoteItems.id, delta.targetQuoteItemId),
          eq(quoteItems.quoteId, quoteId),
          eq(quoteItems.businessId, businessId),
        ),
      )
      .limit(1);

    return line ? toSnapshot(line) : null;
  }

  if (delta.targetKind === "block" && delta.targetBlockId) {
    const [block] = await tx
      .select()
      .from(quoteScopeBlocks)
      .where(
        and(
          eq(quoteScopeBlocks.id, delta.targetBlockId),
          eq(quoteScopeBlocks.quoteId, quoteId),
          eq(quoteScopeBlocks.businessId, businessId),
        ),
      )
      .limit(1);

    return block ? toSnapshot(block) : null;
  }

  if (delta.targetKind === "schedule_item" && delta.targetScheduleItemId) {
    const [item] = await tx
      .select()
      .from(paymentScheduleItems)
      .where(
        and(
          eq(paymentScheduleItems.id, delta.targetScheduleItemId),
          eq(paymentScheduleItems.businessId, businessId),
        ),
      )
      .limit(1);

    return item ? toSnapshot(item) : null;
  }

  return null;
}

function toSnapshot(row: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(row, (_key, value) => (value instanceof Date ? value.toISOString() : value))) as Record<string, unknown>;
}

/**
 * Submit a draft: acquires the single-pending slot (partial unique; others
 * wait) and opens the P1 final-count approval carrying the delta view.
 */
export async function submitChangeOrderForApproval(input: {
  businessId: string;
  changeOrderId: string;
  actorUserId: string;
  actorRole: BusinessMemberRole;
  actorName?: string | null;
  actorEmail?: string | null;
  now?: Date;
}) {
  if (!hasBusinessRoleAccess(input.actorRole, "staff")) {
    throw new Error("Business membership is required to submit a change order.");
  }

  const now = input.now ?? new Date();

  const submitted = await db.transaction(async (tx) => {
    const [co] = await tx
      .select()
      .from(changeOrders)
      .where(
        and(
          eq(changeOrders.id, input.changeOrderId),
          eq(changeOrders.businessId, input.businessId),
        ),
      )
      .limit(1);

    if (!co) throw new Error("Change order not found.");
    if (co.state !== "draft") throw new Error("Only drafts can be submitted.");

    const quote = await requireAcceptedQuote(tx, input.businessId, co.quoteId);

    const deltas = await tx
      .select()
      .from(changeOrderLines)
      .where(eq(changeOrderLines.changeOrderId, co.id))
      .orderBy(asc(changeOrderLines.position));

    if (deltas.length === 0) {
      throw new Error("A change order needs at least one change before submitting.");
    }

    const deltaView = deltas.map((delta) => ({
      targetKind: delta.targetKind,
      change: delta.change,
      before: delta.beforeSnapshot,
      after: delta.afterSnapshot,
    }));

    // P1 instance (locked mechanism): final-count subject on the parent
    // quote, snapshot carrying the customer-facing delta view.
    const approval = await requestApprovalForBusiness({
      businessId: input.businessId,
      subjectType: "final_count",
      quoteId: co.quoteId,
      title: `Change ${co.displayNumber} to your quote`,
      state: { changeOrderId: co.id, displayNumber: co.displayNumber, deltas: deltaView },
      requesterUserId: input.actorUserId,
      requesterRole: input.actorRole,
      requesterName: input.actorName,
      requesterEmail: input.actorEmail,
      now,
    });

    try {
      await tx
        .update(changeOrders)
        .set({ state: "pending_approval", approvalChainId: approval.chainId, updatedAt: now })
        .where(and(eq(changeOrders.id, co.id), eq(changeOrders.state, "draft")));
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as { code: string }).code === "23505") {
        throw new Error("Another change is already awaiting approval for this quote.");
      }

      throw error;
    }

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      actorName: input.actorName,
      actorEmail: input.actorEmail,
      entityType: "quote",
      entityId: co.quoteId,
      action: "change_order.created",
      metadata: { changeOrderId: co.id, displayNumber: co.displayNumber, approvalChainId: approval.chainId },
      createdAt: now,
    });

    return { co, quote, approval };
  });

  await notifyChangeOrderEvent({
    businessId: input.businessId,
    type: "change_order_created",
    title: `Change ${submitted.co.displayNumber} sent for approval`,
    summary: submitted.co.reason.slice(0, 200),
    quoteId: submitted.co.quoteId,
    customerEmail: submitted.quote.customerEmail,
    customerName: submitted.quote.customerName,
    displayNumber: submitted.co.displayNumber,
    changeOrderId: submitted.co.id,
    approvalUrl: `/approvals/${submitted.approval.customerToken}`,
  });

  await recordAnalyticsEvent({
    businessId: input.businessId,
    quoteId: submitted.co.quoteId,
    eventType: "change_order_created",
    visitorHash: hashOpaqueToken(`${input.businessId}:${input.actorUserId}`),
    occurredAt: now,
    metadata: { changeOrderId: submitted.co.id, actor: "user" },
  }).catch(() => undefined);

  return { changeOrderId: submitted.co.id, customerToken: submitted.approval.customerToken };
}

/**
 * Customer decides via the linked P1 token, then the CO finalizes.
 * `baseQuoteVersion` mismatch ⇒ rebase path, never silent apply.
 */
export async function decideChangeOrderByToken(input: {
  token: string;
  decision: "approved" | "rejected";
  approverName?: string | null;
  approverEmail?: string | null;
  comment?: string | null;
  now?: Date;
}) {
  const now = input.now ?? new Date();

  const p1 = await decideApprovalByToken({
    token: input.token,
    decision: input.decision === "approved" ? "approved" : "changes_requested",
    approverName: input.approverName,
    approverEmail: input.approverEmail,
    comment: input.comment ?? (input.decision === "rejected" ? "Declined." : null),
    now,
  });

  const finalized = await db.transaction(async (tx) => {
    const [co] = await tx
      .select()
      .from(changeOrders)
      .where(eq(changeOrders.approvalChainId, p1.chainId))
      .limit(1);

    if (!co || co.state !== "pending_approval") {
      return { changeOrderId: co?.id ?? null, state: co?.state ?? null, finalized: false as const };
    }

    if (p1.state === "approved") {
      const [quote] = await tx
        .select({ version: quotes.version, totalInCents: quotes.totalInCents })
        .from(quotes)
        .where(and(eq(quotes.id, co.quoteId), eq(quotes.businessId, co.businessId)))
        .limit(1);

      if (!quote) throw new Error("Quote not found.");

      if (quote.version !== co.baseQuoteVersion) {
        throw new Error("The quote changed since this change was proposed. The business must rebase it before it can apply.");
      }

      await tx
        .update(changeOrders)
        .set({ state: "approved", decidedAt: now, updatedAt: now })
        .where(and(eq(changeOrders.id, co.id), eq(changeOrders.state, "pending_approval")));

      await deriveScheduleV2ForApprovedCO(tx, co, now);

      await writeAuditLog(tx, {
        businessId: co.businessId,
        actorUserId: null,
        entityType: "quote",
        entityId: co.quoteId,
        action: "change_order.decided",
        metadata: { changeOrderId: co.id, displayNumber: co.displayNumber, decision: "approved", actor: "customer" },
        createdAt: now,
      });

      return { changeOrderId: co.id, state: "approved" as const, finalized: true as const };
    }

    if (p1.state === "changes_requested") {
      await tx
        .update(changeOrders)
        .set({ state: "rejected", decidedAt: now, updatedAt: now })
        .where(and(eq(changeOrders.id, co.id), eq(changeOrders.state, "pending_approval")));

      await writeAuditLog(tx, {
        businessId: co.businessId,
        actorUserId: null,
        entityType: "quote",
        entityId: co.quoteId,
        action: "change_order.decided",
        metadata: { changeOrderId: co.id, displayNumber: co.displayNumber, decision: "rejected", actor: "customer" },
        createdAt: now,
      });

      return { changeOrderId: co.id, state: "rejected" as const, finalized: true as const };
    }

    return { changeOrderId: co.id, state: co.state, finalized: false as const };
  });

  if (finalized.finalized && finalized.changeOrderId) {
    const [co] = await db
      .select()
      .from(changeOrders)
      .where(eq(changeOrders.id, finalized.changeOrderId))
      .limit(1);

    if (co) {
      const [quote] = await db
        .select({ customerEmail: quotes.customerEmail, customerName: quotes.customerName })
        .from(quotes)
        .where(eq(quotes.id, co.quoteId))
        .limit(1);

      await notifyChangeOrderEvent({
        businessId: co.businessId,
        type: "change_order_decided",
        title: `Change ${co.displayNumber} ${finalized.state}`,
        summary: co.reason.slice(0, 200),
        quoteId: co.quoteId,
        customerEmail: null,
        customerName: quote?.customerName ?? null,
        displayNumber: co.displayNumber,
        changeOrderId: co.id,
        decision: finalized.state === "approved" ? "approved" : "rejected",
      });

      await recordAnalyticsEvent({
        businessId: co.businessId,
        quoteId: co.quoteId,
        eventType: finalized.state === "approved" ? "change_order_approved" : "change_order_rejected",
        visitorHash: hashOpaqueToken(`${co.businessId}:customer:${co.id}`),
        occurredAt: now,
        metadata: { changeOrderId: co.id, actor: "customer" },
      }).catch(() => undefined);
    }
  }

  return finalized;
}

/**
 * Schedule v2 derivation (P5-02): approved schedule deltas produce a new
 * accepted schedule version. v1 rows are never touched — historical truth.
 */
async function deriveScheduleV2ForApprovedCO(
  tx: DatabaseTransaction,
  co: ChangeOrder,
  now: Date,
) {
  const { computeScheduleCoherence } = await import("@/features/payment-schedules/coherence");

  const deltas = await tx
    .select()
    .from(changeOrderLines)
    .where(
      and(
        eq(changeOrderLines.changeOrderId, co.id),
        eq(changeOrderLines.targetKind, "schedule_item"),
      ),
    )
    .orderBy(asc(changeOrderLines.position));

  if (deltas.length === 0) return null;

  const current = await tx
    .select()
    .from(paymentSchedules)
    .where(
      and(
        eq(paymentSchedules.businessId, co.businessId),
        eq(paymentSchedules.quoteId, co.quoteId),
      ),
    )
    .orderBy(desc(paymentSchedules.version))
    .limit(1);

  const latest = current[0];
  if (!latest || latest.state !== "accepted") {
    throw new Error("Schedule changes require an accepted schedule.");
  }

  const [quote] = await tx
    .select({ totalInCents: quotes.totalInCents })
    .from(quotes)
    .where(eq(quotes.id, co.quoteId))
    .limit(1);

  const existingItems = await tx
    .select()
    .from(paymentScheduleItems)
    .where(eq(paymentScheduleItems.scheduleId, latest.id))
    .orderBy(asc(paymentScheduleItems.position));

  const nextItems: Array<{
    category: string;
    label: string;
    amountCents: number | null;
    percentBps: number | null;
    dueDate: string | null;
    dueCondition: string | null;
  }> = existingItems.map((item) => ({
    category: item.category,
    label: item.label,
    amountCents: item.amountCents,
    percentBps: item.percentBps,
    dueDate: item.dueDate,
    dueCondition: item.dueCondition,
  }));

  for (const delta of deltas) {
    const after = (delta.afterSnapshot ?? delta.payload ?? {}) as Record<string, unknown>;

    if (delta.change === "add") {
      nextItems.push({
        category: String(after["category"] ?? "milestone"),
        label: String(after["label"] ?? "Added item"),
        amountCents: after["amountCents"] != null ? Number(after["amountCents"]) : null,
        percentBps: after["percentBps"] != null ? Number(after["percentBps"]) : null,
        dueDate: after["dueDate"] != null ? String(after["dueDate"]) : null,
        dueCondition: after["dueCondition"] != null ? String(after["dueCondition"]) : null,
      });
      continue;
    }

    const index = nextItems.findIndex((_, position) =>
      existingItems[position]?.id === delta.targetScheduleItemId,
    );

    if (index === -1) {
      throw new Error("Schedule change target no longer exists.");
    }

    if (delta.change === "remove") {
      nextItems.splice(index, 1);
      continue;
    }

    const current2 = nextItems[index];
    nextItems[index] = {
      category: after["category"] != null ? String(after["category"]) : current2.category,
      label: after["label"] != null ? String(after["label"]) : current2.label,
      amountCents: after["amountCents"] != null ? Number(after["amountCents"]) : current2.amountCents,
      percentBps: after["percentBps"] != null ? Number(after["percentBps"]) : current2.percentBps,
      dueDate: after["dueDate"] != null ? String(after["dueDate"]) : current2.dueDate,
      dueCondition: after["dueCondition"] != null ? String(after["dueCondition"]) : current2.dueCondition,
    };
  }

  const coherence = computeScheduleCoherence(nextItems, quote?.totalInCents ?? latest.quoteTotalCents);

  if (!coherence.ok) {
    throw new Error(`Schedule change is incoherent: ${coherence.errors.join("; ")}`);
  }

  const [v2] = await tx
    .insert(paymentSchedules)
    .values({
      id: newEntityId(),
      businessId: co.businessId,
      quoteId: co.quoteId,
      version: latest.version + 1,
      state: "accepted",
      quoteTotalCents: quote?.totalInCents ?? latest.quoteTotalCents,
      displayTotalCents: coherence.totalCents,
      recipeVersion: latest.recipeVersion,
      createdByUserId: co.actorUserId,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  let position = 0;
  for (const item of coherence.items) {
    await tx.insert(paymentScheduleItems).values({
      id: newEntityId(),
      businessId: co.businessId,
      scheduleId: v2.id,
      position: position++,
      category: item.category,
      label: item.label,
      amountCents: item.amountCents,
      percentBps: item.percentBps,
      computedAmountCents: item.computedAmountCents,
      dueDate: item.dueDate,
      dueCondition: item.dueCondition,
      createdAt: now,
      updatedAt: now,
    });
  }

  return v2;
}

/** Withdraw a draft or pending CO (staff+). Pending withdrawal frees the slot. */
export async function withdrawChangeOrder(input: {
  businessId: string;
  changeOrderId: string;
  actorUserId: string;
  actorRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!hasBusinessRoleAccess(input.actorRole, "staff")) {
    throw new Error("Business membership is required.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [co] = await tx
      .select()
      .from(changeOrders)
      .where(
        and(eq(changeOrders.id, input.changeOrderId), eq(changeOrders.businessId, input.businessId)),
      )
      .limit(1);

    if (!co) throw new Error("Change order not found.");
    if (co.state !== "draft" && co.state !== "pending_approval") {
      throw new Error("Only drafts and pending change orders can be withdrawn.");
    }

    const [updated] = await tx
      .update(changeOrders)
      .set({ state: "withdrawn", decidedAt: now, updatedAt: now })
      .where(eq(changeOrders.id, co.id))
      .returning();

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      entityType: "quote",
      entityId: co.quoteId,
      action: "change_order.decided",
      metadata: { changeOrderId: co.id, displayNumber: co.displayNumber, decision: "withdrawn" },
      createdAt: now,
    });

    return updated;
  });
}

/** Cancel a pending CO on behalf of the business (manager+). */
export async function cancelChangeOrder(input: {
  businessId: string;
  changeOrderId: string;
  actorUserId: string;
  actorRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!canManageOperationalBusinessSettings(input.actorRole)) {
    throw new Error("Only an owner or manager can cancel a change order.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [co] = await tx
      .select()
      .from(changeOrders)
      .where(
        and(eq(changeOrders.id, input.changeOrderId), eq(changeOrders.businessId, input.businessId)),
      )
      .limit(1);

    if (!co) throw new Error("Change order not found.");
    if (co.state !== "pending_approval") {
      throw new Error("Only pending change orders can be canceled.");
    }

    const [updated] = await tx
      .update(changeOrders)
      .set({ state: "canceled", decidedAt: now, updatedAt: now })
      .where(eq(changeOrders.id, co.id))
      .returning();

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      entityType: "quote",
      entityId: co.quoteId,
      action: "change_order.decided",
      metadata: { changeOrderId: co.id, displayNumber: co.displayNumber, decision: "canceled" },
      createdAt: now,
    });

    return updated;
  });
}

/** Delete a draft CO (staff+). Decided rows are never deleted. */
export async function deleteDraftChangeOrder(input: {
  businessId: string;
  changeOrderId: string;
  actorRole: BusinessMemberRole;
}) {
  if (!hasBusinessRoleAccess(input.actorRole, "staff")) {
    throw new Error("Business membership is required.");
  }

  return db.transaction(async (tx) => {
    const [co] = await tx
      .select()
      .from(changeOrders)
      .where(
        and(eq(changeOrders.id, input.changeOrderId), eq(changeOrders.businessId, input.businessId)),
      )
      .limit(1);

    if (!co) throw new Error("Change order not found.");
    if (co.state !== "draft") {
      throw new Error("Only drafts can be deleted; decided history is immutable.");
    }

    await tx.delete(changeOrderLines).where(eq(changeOrderLines.changeOrderId, co.id));

    if (co.approvalChainId) {
      await tx.delete(approvals).where(eq(approvals.chainId, co.approvalChainId));
      await tx.delete(approvalChains).where(eq(approvalChains.id, co.approvalChainId));
    }

    await tx.delete(changeOrders).where(eq(changeOrders.id, co.id));

    return { deleted: true as const };
  });
}

/**
 * Rebase after a `baseQuoteVersion` mismatch: refreshes before-snapshots from
 * current targets and pins the current quote version. An explicit action —
 * never silent.
 */
export async function rebaseChangeOrder(input: {
  businessId: string;
  changeOrderId: string;
  actorUserId: string;
  actorRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!hasBusinessRoleAccess(input.actorRole, "staff")) {
    throw new Error("Business membership is required.");
  }

  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const [co] = await tx
      .select()
      .from(changeOrders)
      .where(
        and(eq(changeOrders.id, input.changeOrderId), eq(changeOrders.businessId, input.businessId)),
      )
      .limit(1);

    if (!co) throw new Error("Change order not found.");
    if (co.state !== "draft" && co.state !== "pending_approval") {
      throw new Error("Only drafts and pending change orders can be rebased.");
    }

    const [quote] = await tx
      .select({ version: quotes.version })
      .from(quotes)
      .where(and(eq(quotes.id, co.quoteId), eq(quotes.businessId, input.businessId)))
      .limit(1);

    if (!quote) throw new Error("Quote not found.");

    const deltas = await tx
      .select()
      .from(changeOrderLines)
      .where(eq(changeOrderLines.changeOrderId, co.id));

    for (const delta of deltas) {
      if (delta.change === "add") continue;

      const refreshed = await captureBeforeSnapshot(tx, input.businessId, co.quoteId, {
        targetKind: delta.targetKind,
        targetQuoteItemId: delta.targetQuoteItemId,
        targetBlockId: delta.targetBlockId,
        targetScheduleItemId: delta.targetScheduleItemId,
        change: delta.change,
      });

      if (!refreshed) {
        throw new Error("A change target no longer exists; remove it before rebasing.");
      }

      await tx
        .update(changeOrderLines)
        .set({ beforeSnapshot: refreshed })
        .where(eq(changeOrderLines.id, delta.id));
    }

    const [updated] = await tx
      .update(changeOrders)
      .set({ baseQuoteVersion: quote.version, state: "draft", approvalChainId: null, updatedAt: now })
      .where(eq(changeOrders.id, co.id))
      .returning();

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      entityType: "quote",
      entityId: co.quoteId,
      action: "change_order.created",
      metadata: { changeOrderId: co.id, displayNumber: co.displayNumber, rebasedToVersion: quote.version },
      createdAt: now,
    });

    return updated;
  });
}
