import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { writeAuditLog } from "@/features/audit/mutations";
import {
  computeScheduleCoherence,
  type ScheduleItemInput,
} from "@/features/payment-schedules/coherence";
import { getLatestApprovedScheduleForQuote } from "@/features/payment-schedules/queries";
import type { BusinessMemberRole } from "@/lib/business-members";
import { hasBusinessRoleAccess } from "@/lib/business-members";
import { db } from "@/lib/db/client";
import {
  paymentScheduleItems,
  paymentSchedules,
  quotes,
} from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";
import { recordAnalyticsEvent } from "@/features/analytics/tracking";
import { hashOpaqueToken } from "@/lib/security/tokens";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const scheduleItemInputSchema = z.object({
  category: z.string().min(1).max(40),
  label: z.string().trim().min(1).max(200),
  amountCents: z.number().int().min(0).nullable().optional(),
  percentBps: z.number().int().min(0).max(10000).nullable().optional(),
  dueDate: z.string().trim().max(40).nullable().optional(),
  dueCondition: z.string().trim().max(200).nullable().optional(),
}).strict();

function parseItems(items: unknown): ScheduleItemInput[] {
  const parsed = z.array(scheduleItemInputSchema).min(1).max(50).safeParse(items);

  if (!parsed.success) {
    throw new Error("Schedule items failed validation.");
  }

  return parsed.data;
}

async function requireDraftQuote(
  tx: DatabaseTransaction,
  businessId: string,
  quoteId: string,
) {
  const [quote] = await tx
    .select({ id: quotes.id, totalInCents: quotes.totalInCents, status: quotes.status })
    .from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.businessId, businessId)))
    .limit(1);

  if (!quote) throw new Error("Quote not found.");
  if (quote.status !== "draft") {
    throw new Error("Schedules can only change on draft quotes.");
  }

  return quote;
}

/**
 * Create or replace the editable schedule (draft quotes only). Coherence is
 * enforced at write; incoherent input is rejected, never stored.
 */
export async function saveScheduleForQuote(input: {
  businessId: string;
  quoteId: string;
  items: unknown;
  actorUserId: string;
  actorRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!hasBusinessRoleAccess(input.actorRole, "staff")) {
    throw new Error("Business membership is required to edit a schedule.");
  }

  const items = parseItems(input.items);
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const quote = await requireDraftQuote(tx, input.businessId, input.quoteId);
    const coherence = computeScheduleCoherence(items, quote.totalInCents);

    if (!coherence.ok) {
      throw new Error(`Schedule is incoherent: ${coherence.errors.join("; ")}`);
    }

    const [existing] = await tx
      .select({
        id: paymentSchedules.id,
        state: paymentSchedules.state,
      })
      .from(paymentSchedules)
      .where(
        and(
          eq(paymentSchedules.businessId, input.businessId),
          eq(paymentSchedules.quoteId, input.quoteId),
        ),
      )
      .orderBy(desc(paymentSchedules.version))
      .limit(1);

    let scheduleId: string;

    if (existing) {
      if (existing.state === "accepted" || existing.state === "superseded") {
        throw new Error("Accepted schedules are immutable; change them via a change order.");
      }

      await tx
        .delete(paymentScheduleItems)
        .where(
          and(
            eq(paymentScheduleItems.scheduleId, existing.id),
            eq(paymentScheduleItems.businessId, input.businessId),
          ),
        );
      await tx
        .update(paymentSchedules)
        .set({
          state: "scheduled",
          quoteTotalCents: quote.totalInCents,
          displayTotalCents: coherence.totalCents,
          updatedAt: now,
        })
        .where(
          and(
            eq(paymentSchedules.id, existing.id),
            eq(paymentSchedules.businessId, input.businessId),
          ),
        );

      scheduleId = existing.id;
    } else {
      const [created] = await tx
        .insert(paymentSchedules)
        .values({
          id: newEntityId(),
          businessId: input.businessId,
          quoteId: input.quoteId,
          version: 1,
          state: "scheduled",
          quoteTotalCents: quote.totalInCents,
          displayTotalCents: coherence.totalCents,
          recipeVersion: 1,
          createdByUserId: input.actorUserId,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: paymentSchedules.id });

      scheduleId = created.id;
    }

    let position = 0;
    for (const item of coherence.items) {
      await tx.insert(paymentScheduleItems).values({
        id: newEntityId(),
        businessId: input.businessId,
        scheduleId,
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

    await writeAuditLog(tx, {
      businessId: input.businessId,
      actorUserId: input.actorUserId,
      entityType: "quote",
      entityId: input.quoteId,
      action: "quote.updated",
      metadata: { scheduleId, scheduleState: "scheduled" },
      createdAt: now,
    });

    await recordAnalyticsEvent({
      businessId: input.businessId,
      quoteId: input.quoteId,
      eventType: "schedule_created",
      visitorHash: hashOpaqueToken(`${input.businessId}:${input.actorUserId}`),
      occurredAt: now,
      metadata: { scheduleId, actor: "user" },
    }).catch(() => undefined);

    return { scheduleId };
  });
}

/**
 * Acceptance snapshot (called from the quote acceptance flow): the editable
 * schedule becomes immutable `accepted` truth with re-verified cents. No
 * UPDATE path exists after this point — later changes go through CO-derived
 * v2.
 */
export async function acceptScheduleForQuote(
  tx: DatabaseTransaction,
  input: { businessId: string; quoteId: string; quoteTotalCents: number; now?: Date },
) {
  const now = input.now ?? new Date();

  const [schedule] = await tx
    .select()
    .from(paymentSchedules)
    .where(
      and(
        eq(paymentSchedules.businessId, input.businessId),
        eq(paymentSchedules.quoteId, input.quoteId),
      ),
    )
    .orderBy(desc(paymentSchedules.version))
    .limit(1);

  if (!schedule) return null;
  if (schedule.state === "accepted") return schedule;

  const items = await tx
    .select()
    .from(paymentScheduleItems)
    .where(eq(paymentScheduleItems.scheduleId, schedule.id))
    .orderBy(asc(paymentScheduleItems.position));

  const coherence = computeScheduleCoherence(
    items.map((item) => ({
      category: item.category,
      label: item.label,
      amountCents: item.amountCents,
      percentBps: item.percentBps,
      dueDate: item.dueDate,
      dueCondition: item.dueCondition,
    })),
    input.quoteTotalCents,
  );

  if (!coherence.ok) {
    throw new Error(`Schedule cannot be accepted: ${coherence.errors.join("; ")}`);
  }

  // Re-verify computed cents against the accepted total (stale-gate: a
  // draft edit after review recomputes here, never silently).
  let position = 0;
  for (const item of coherence.items) {
    const row = items[position];
    if (row && row.computedAmountCents !== item.computedAmountCents) {
      await tx
        .update(paymentScheduleItems)
        .set({ computedAmountCents: item.computedAmountCents, updatedAt: now })
        .where(
          and(
            eq(paymentScheduleItems.id, row.id),
            eq(paymentScheduleItems.businessId, input.businessId),
          ),
        );
    }
    position += 1;
  }

  const [accepted] = await tx
    .update(paymentSchedules)
    .set({
      state: "accepted",
      quoteTotalCents: input.quoteTotalCents,
      displayTotalCents: coherence.totalCents,
      updatedAt: now,
    })
    .where(
      and(
        eq(paymentSchedules.id, schedule.id),
        eq(paymentSchedules.businessId, input.businessId),
      ),
    )
    .returning();

  await writeAuditLog(tx, {
    businessId: input.businessId,
    actorUserId: null,
    entityType: "quote",
    entityId: input.quoteId,
    action: "schedule.accepted",
    metadata: { scheduleId: schedule.id, version: schedule.version },
    createdAt: now,
  });

  return accepted;
}

/**
 * Manual-invoice prefill source: maps the latest approved schedule version
 * 1:1 to draft invoice lines for owner review. Display only — no money
 * semantics, no linkage.
 */
export async function resolveSchedulePrefillLines(input: {
  businessId: string;
  quoteId: string;
}) {
  const schedule = await getLatestApprovedScheduleForQuote(input);

  if (!schedule) return null;

  return {
    scheduleId: schedule.id,
    version: schedule.version,
    lines: schedule.items.map((item) => ({
      description: `${item.label} (${item.category})`,
      quantity: 1,
      unitPriceInCents: item.computedAmountCents,
    })),
  };
}
