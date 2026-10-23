import "server-only";

import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";

import type {
  FollowUpCreateInput,
  FollowUpEditInput,
  FollowUpReassignInput,
  FollowUpRescheduleInput,
} from "@/features/follow-ups/schemas";
import type {
  FollowUpCategory,
  FollowUpChannel,
  FollowUpRecurrence,
  FollowUpSendMode,
  FollowUpStatus,
  FollowUpTerminationCondition,
} from "@/features/follow-ups/types";
import {
  createActivityId,
  createFollowUpId,
  formatFollowUpDate,
  getFollowUpCategory,
  getNextRecurrenceDueDate,
  parseFollowUpDueDateInput,
  shouldRecur,
} from "@/features/follow-ups/utils";
import { resolveEffectivePlanFromSubscriptionFields } from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import {
  activityLogs,
  businessMembers,
  businessSubscriptions,
  followUps,
  inquiries,
  quotes,
} from "@/lib/db/schema";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type { PlanTier } from "@/lib/plans/plans";

type FollowUpTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// ---------------------------------------------------------------------------
// Terminal status helpers
// ---------------------------------------------------------------------------

export function isTerminalInquiryStatus(status: string): boolean {
  return ["won", "lost", "archived"].includes(status);
}

export function isTerminalQuoteStatus(status: string): boolean {
  return ["accepted", "rejected", "expired", "voided"].includes(status);
}

/**
 * Determines whether a recurring follow-up should stop generating new occurrences.
 *
 * Returns `true` when:
 * - terminationCondition is "count" and recurrenceCount >= recurrenceLimit
 * - terminationCondition is "terminal_status" and the linked inquiry/quote
 *   has reached a terminal status
 */
export async function shouldTerminateRecurrence(
  tx: FollowUpTransaction,
  followUp: {
    recurrence: string;
    recurrenceLimit: number | null;
    recurrenceCount: number;
    terminationCondition: string | null;
    inquiryId: string | null;
    quoteId: string | null;
  },
  businessId: string,
): Promise<boolean> {
  // Count-based termination
  if (
    followUp.terminationCondition === "count" &&
    followUp.recurrenceLimit !== null &&
    followUp.recurrenceCount >= followUp.recurrenceLimit
  ) {
    return true;
  }

  // Terminal status termination
  if (followUp.terminationCondition === "terminal_status") {
    if (followUp.inquiryId) {
      const [inquiry] = await tx
        .select({ status: inquiries.status })
        .from(inquiries)
        .where(
          and(eq(inquiries.id, followUp.inquiryId), eq(inquiries.businessId, businessId)),
        )
        .limit(1);

      if (inquiry && isTerminalInquiryStatus(inquiry.status)) return true;
    }

    if (followUp.quoteId) {
      const [quote] = await tx
        .select({ status: quotes.status })
        .from(quotes)
        .where(
          and(eq(quotes.id, followUp.quoteId), eq(quotes.businessId, businessId)),
        )
        .limit(1);

      if (quote && isTerminalQuoteStatus(quote.status)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CreateFollowUpForBusinessInput = {
  businessId: string;
  inquiryId?: string | null;
  quoteId?: string | null;
  actorUserId: string;
  assignedToUserId?: string | null;
  followUp: Omit<FollowUpCreateInput, "recurrence" | "recurrenceLimit" | "category" | "sendMode" | "terminationCondition"> & {
    recurrence?: FollowUpCreateInput["recurrence"];
    recurrenceLimit?: FollowUpCreateInput["recurrenceLimit"];
    category?: FollowUpCreateInput["category"];
    sendMode?: FollowUpCreateInput["sendMode"];
    terminationCondition?: FollowUpCreateInput["terminationCondition"];
  };
  /** Business timezone for anchoring due date. */
  timezone?: string;
};

type FollowUpMutationResult = {
  followUpId: string;
  inquiryId: string | null;
  quoteId: string | null;
  status: FollowUpStatus;
};

function getFollowUpActionMetadata(input: {
  followUpId: string;
  title: string;
  reason: string;
  channel: string;
  sendMode?: string;
  dueAt: Date;
}) {
  return {
    followUpId: input.followUpId,
    title: input.title,
    reason: input.reason,
    channel: input.channel,
    ...(input.sendMode ? { sendMode: input.sendMode } : {}),
    dueAt: input.dueAt.toISOString(),
  };
}

export class FollowUpCreateValidationError extends Error {
  field: "sendMode" | "terminationCondition" | "assignedToUserId";

  constructor(message: string, field: FollowUpCreateValidationError["field"] = "sendMode") {
    super(message);
    this.name = "FollowUpCreateValidationError";
    this.field = field;
  }
}

/** Plan of the owning business, read inside the mutation so the check cannot be skipped. */
async function getPlanTier(
  tx: FollowUpTransaction,
  businessId: string,
): Promise<PlanTier> {
  const [subscription] = await tx
    .select({
      status: businessSubscriptions.status,
      plan: businessSubscriptions.plan,
      currentPeriodEnd: businessSubscriptions.currentPeriodEnd,
      trialEndsAt: businessSubscriptions.trialEndsAt,
    })
    .from(businessSubscriptions)
    .where(eq(businessSubscriptions.businessId, businessId))
    .limit(1);

  return resolveEffectivePlanFromSubscriptionFields(subscription);
}

/**
 * Unattended sends are a paid capability. The check lives in the mutation —
 * not only in the UI — so a crafted request cannot put a business on an
 * "automated" follow-up it never paid for.
 */
async function assertAutomaticSendAllowed(
  tx: FollowUpTransaction,
  businessId: string,
  sendMode: string | null | undefined,
) {
  if (sendMode !== "automatic") {
    return;
  }

  const plan = await getPlanTier(tx, businessId);

  if (!hasFeatureAccess(plan, "autoFollowUps")) {
    throw new FollowUpCreateValidationError(
      "Automatic follow-ups are available on the Pro plan and above.",
      "sendMode",
    );
  }
}

/** The assignee must be a member of the business that owns the follow-up. */
async function assertAssigneeIsBusinessMember(
  tx: FollowUpTransaction,
  businessId: string,
  assignedToUserId: string | null | undefined,
) {
  if (!assignedToUserId) {
    return;
  }

  const [member] = await tx
    .select({ id: businessMembers.id })
    .from(businessMembers)
    .where(
      and(
        eq(businessMembers.businessId, businessId),
        eq(businessMembers.userId, assignedToUserId),
      ),
    )
    .limit(1);

  if (!member) {
    throw new FollowUpCreateValidationError(
      "That person is not a member of this business.",
      "assignedToUserId",
    );
  }
}

export async function createFollowUpForBusiness({
  businessId,
  inquiryId,
  quoteId,
  actorUserId,
  assignedToUserId,
  followUp,
  timezone,
}: CreateFollowUpForBusinessInput): Promise<FollowUpMutationResult | null> {
  if (!inquiryId && !quoteId) {
    return null;
  }

  const now = new Date();
  const followUpId = createFollowUpId();
  const dueAt = parseFollowUpDueDateInput(followUp.dueDate, timezone);

  return db.transaction(async (tx) => {
    let resolvedInquiryId = inquiryId ?? null;
    const resolvedQuoteId = quoteId ?? null;

    await assertAutomaticSendAllowed(tx, businessId, followUp.sendMode);
    await assertAssigneeIsBusinessMember(
      tx,
      businessId,
      assignedToUserId ?? actorUserId,
    );

    if (resolvedInquiryId) {
      const [inquiry] = await tx
        .select({ id: inquiries.id, customerEmail: inquiries.customerEmail })
        .from(inquiries)
        .where(
          and(
            eq(inquiries.id, resolvedInquiryId),
            eq(inquiries.businessId, businessId),
          ),
        )
        .limit(1);

      if (!inquiry) {
        return null;
      }

      if (followUp.sendMode === "automatic" && !inquiry.customerEmail) {
        throw new FollowUpCreateValidationError(
          "Automatic follow-ups need a customer email on the linked inquiry.",
        );
      }
    }

    if (resolvedQuoteId) {
      const [quote] = await tx
        .select({
          id: quotes.id,
          inquiryId: quotes.inquiryId,
          customerEmail: quotes.customerEmail,
        })
        .from(quotes)
        .where(
          and(
            eq(quotes.id, resolvedQuoteId),
            eq(quotes.businessId, businessId),
            isNull(quotes.deletedAt),
          ),
        )
        .limit(1);

      if (!quote) {
        return null;
      }

      if (followUp.sendMode === "automatic" && !quote.customerEmail) {
        throw new FollowUpCreateValidationError(
          "Automatic follow-ups need a customer email on the linked quote.",
        );
      }

      if (resolvedInquiryId && quote.inquiryId && quote.inquiryId !== resolvedInquiryId) {
        return null;
      }

      resolvedInquiryId = resolvedInquiryId ?? quote.inquiryId;
    }

    await tx.insert(followUps).values({
      id: followUpId,
      businessId,
      inquiryId: resolvedInquiryId,
      quoteId: resolvedQuoteId,
      assignedToUserId: assignedToUserId ?? actorUserId,
      title: followUp.title,
      reason: followUp.reason,
      channel: followUp.channel,
      category: followUp.category ?? "sales",
      sendMode: followUp.sendMode ?? "manual",
      recurrence: followUp.recurrence ?? "none",
      recurrenceLimit: followUp.recurrenceLimit ?? null,
      terminationCondition: followUp.terminationCondition ?? null,
      recurrenceCount: 0,
      dueAt,
      status: "pending",
      createdByUserId: actorUserId,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: resolvedInquiryId,
      quoteId: resolvedQuoteId,
      actorUserId,
      type: "follow_up.created",
      summary: `Follow-up created for ${formatFollowUpDate(dueAt, timezone)}.`,
      metadata: getFollowUpActionMetadata({
        followUpId,
        title: followUp.title,
        reason: followUp.reason,
        channel: followUp.channel,
        sendMode: followUp.sendMode ?? "manual",
        dueAt,
      }),
      createdAt: now,
      updatedAt: now,
    });

    return {
      followUpId,
      inquiryId: resolvedInquiryId,
      quoteId: resolvedQuoteId,
      status: "pending",
    };
  });
}

type UpdateFollowUpRecordInput = {
  businessId: string;
  followUpId: string;
  actorUserId: string;
};

/** The fields a follow-up passes on to its next recurring occurrence. */
export type RecurrenceParent = {
  inquiryId: string | null;
  quoteId: string | null;
  title: string;
  reason: string;
  category: FollowUpCategory;
  channel: FollowUpChannel;
  assignedToUserId: string | null;
  dueAt: Date;
  sendMode: FollowUpSendMode;
  recurrence: FollowUpRecurrence;
  recurrenceCount: number;
  recurrenceLimit: number | null;
  terminationCondition: FollowUpTerminationCondition | null;
};

/**
 * Create the next occurrence of a repeating follow-up.
 *
 * Shared by the single-record completion, the bulk completion and the
 * automatic send, so a recurring series keeps running however the current
 * occurrence is cleared. Returns the new follow-up id, or `null` when the
 * series must stop.
 */
export async function spawnNextRecurrence(
  tx: FollowUpTransaction,
  {
    businessId,
    actorUserId,
    parent,
    parentFollowUpId,
    now,
    timezone,
  }: {
    businessId: string;
    /** `null` for system-driven transitions (the automatic send job). */
    actorUserId: string | null;
    parent: RecurrenceParent;
    parentFollowUpId: string;
    now: Date;
    /** Business timezone — the recorded dates are read in it. */
    timezone?: string;
  },
) {
  if (
    !shouldRecur({
      recurrence: parent.recurrence as FollowUpRecurrence,
      recurrenceCount: parent.recurrenceCount,
      recurrenceLimit: parent.recurrenceLimit,
    })
  ) {
    return null;
  }

  const shouldTerminate = await shouldTerminateRecurrence(
    tx,
    {
      recurrence: parent.recurrence,
      recurrenceLimit: parent.recurrenceLimit,
      recurrenceCount: parent.recurrenceCount,
      terminationCondition: parent.terminationCondition,
      inquiryId: parent.inquiryId,
      quoteId: parent.quoteId,
    },
    businessId,
  );

  if (shouldTerminate) {
    return null;
  }

  const nextDueAt = getNextRecurrenceDueDate(
    parent.dueAt,
    parent.recurrence as Exclude<FollowUpRecurrence, "none">,
    timezone,
  );
  const nextFollowUpId = createFollowUpId();

  await tx.insert(followUps).values({
    id: nextFollowUpId,
    businessId,
    inquiryId: parent.inquiryId,
    quoteId: parent.quoteId,
    assignedToUserId: parent.assignedToUserId,
    title: parent.title,
    reason: parent.reason,
    category: parent.category,
    channel: parent.channel as typeof followUps.$inferInsert.channel,
    sendMode: parent.sendMode,
    recurrence: parent.recurrence,
    recurrenceCount: parent.recurrenceCount + 1,
    recurrenceLimit: parent.recurrenceLimit,
    terminationCondition: parent.terminationCondition,
    parentFollowUpId,
    dueAt: nextDueAt,
    status: "pending",
    createdByUserId: actorUserId,
    createdAt: now,
    updatedAt: now,
  });

  await tx.insert(activityLogs).values({
    id: createActivityId(),
    businessId,
    inquiryId: parent.inquiryId,
    quoteId: parent.quoteId,
    actorUserId,
    type: "follow_up.created",
    summary: `Recurring follow-up created for ${formatFollowUpDate(nextDueAt, timezone)}.`,
    metadata: {
      followUpId: nextFollowUpId,
      title: parent.title,
      reason: parent.reason,
      channel: parent.channel,
      sendMode: parent.sendMode,
      dueAt: nextDueAt.toISOString(),
      parentFollowUpId,
    },
    createdAt: now,
    updatedAt: now,
  });

  return nextFollowUpId;
}

export async function completeFollowUpForBusiness({
  businessId,
  followUpId,
  actorUserId,
  completionNote,
  timezone,
}: UpdateFollowUpRecordInput & {
  completionNote?: string | null;
  /** Business timezone — the recorded dates are read in it. */
  timezone?: string;
}) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingFollowUp] = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
        reason: followUps.reason,
        category: followUps.category,
        channel: followUps.channel,
        assignedToUserId: followUps.assignedToUserId,
        status: followUps.status,
        dueAt: followUps.dueAt,
        sendMode: followUps.sendMode,
        recurrence: followUps.recurrence,
        recurrenceCount: followUps.recurrenceCount,
        recurrenceLimit: followUps.recurrenceLimit,
        terminationCondition: followUps.terminationCondition,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          isNull(followUps.deletedAt),
        ),
      )
      .limit(1)
      // Lock the row so a double submit (or a race with the auto-send job)
      // cannot both pass the `pending` check and spawn two occurrences.
      .for("update");

    if (!existingFollowUp) {
      return null;
    }

    if (existingFollowUp.status === "completed") {
      return {
        changed: false,
        locked: false,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    if (existingFollowUp.status !== "pending") {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    const [updated] = await tx
      .update(followUps)
      .set({
        status: "completed",
        completedAt: now,
        completionNote: completionNote ?? null,
        skippedAt: null,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
        ),
      )
      .returning({ id: followUps.id });

    if (!updated) {
      // Another transaction won the race — do not log or spawn a second time.
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      actorUserId,
      type: "follow_up.completed",
      summary: completionNote
        ? `Follow-up completed: ${completionNote.slice(0, 80)}`
        : "Follow-up completed.",
      metadata: {
        followUpId,
        title: existingFollowUp.title,
        ...(completionNote ? { completionNote } : {}),
      },
      createdAt: now,
      updatedAt: now,
    });

    await spawnNextRecurrence(tx, {
      businessId,
      actorUserId,
      parent: {
        ...existingFollowUp,
        category: getFollowUpCategory(existingFollowUp.category),
      },
      parentFollowUpId: followUpId,
      now,
      timezone,
    });

    return {
      changed: true,
      locked: false,
      followUpId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      status: "completed" as const,
    };
  });
}

export async function skipFollowUpForBusiness({
  businessId,
  followUpId,
  actorUserId,
}: UpdateFollowUpRecordInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingFollowUp] = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
        status: followUps.status,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          isNull(followUps.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existingFollowUp) {
      return null;
    }

    if (existingFollowUp.status === "skipped") {
      return {
        changed: false,
        locked: false,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    if (existingFollowUp.status !== "pending") {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    const [updated] = await tx
      .update(followUps)
      .set({
        status: "skipped",
        completedAt: null,
        skippedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
        ),
      )
      .returning({ id: followUps.id });

    if (!updated) {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      actorUserId,
      type: "follow_up.skipped",
      summary: "Follow-up skipped.",
      metadata: {
        followUpId,
        title: existingFollowUp.title,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      locked: false,
      followUpId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      status: "skipped" as const,
    };
  });
}

export async function rescheduleFollowUpForBusiness({
  businessId,
  followUpId,
  actorUserId,
  followUp,
  timezone,
}: UpdateFollowUpRecordInput & {
  followUp: FollowUpRescheduleInput;
  timezone?: string;
}) {
  const now = new Date();
  const dueAt = parseFollowUpDueDateInput(followUp.dueDate, timezone);

  return db.transaction(async (tx) => {
    const [existingFollowUp] = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
        status: followUps.status,
        dueAt: followUps.dueAt,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          isNull(followUps.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existingFollowUp) {
      return null;
    }

    if (existingFollowUp.status !== "pending") {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    const [updated] = await tx
      .update(followUps)
      .set({
        dueAt,
        reminderSentAt: null,
        overdueNotifiedAt: null,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
        ),
      )
      .returning({ id: followUps.id });

    if (!updated) {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      actorUserId,
      type: "follow_up.rescheduled",
      summary: `Follow-up rescheduled to ${formatFollowUpDate(dueAt, timezone)}.`,
      metadata: {
        followUpId,
        title: existingFollowUp.title,
        previousDueAt: existingFollowUp.dueAt.toISOString(),
        dueAt: dueAt.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      locked: false,
      followUpId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      status: "pending" as const,
    };
  });
}

export async function editFollowUpForBusiness({
  businessId,
  followUpId,
  actorUserId,
  followUp,
  timezone,
}: UpdateFollowUpRecordInput & {
  followUp: FollowUpEditInput;
  timezone?: string;
}) {
  const now = new Date();
  const dueAt = parseFollowUpDueDateInput(followUp.dueDate, timezone);

  return db.transaction(async (tx) => {
    const [existingFollowUp] = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        status: followUps.status,
        title: followUps.title,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          isNull(followUps.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existingFollowUp) {
      return null;
    }

    if (existingFollowUp.status !== "pending") {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    await assertAutomaticSendAllowed(tx, businessId, followUp.sendMode);

    const [updated] = await tx
      .update(followUps)
      .set({
        title: followUp.title,
        reason: followUp.reason,
        channel: followUp.channel,
        category: followUp.category ?? "sales",
        sendMode: followUp.sendMode ?? "manual",
        dueAt,
        recurrence: followUp.recurrence ?? "none",
        recurrenceLimit: followUp.recurrenceLimit ?? null,
        terminationCondition: followUp.terminationCondition ?? null,
        reminderSentAt: null,
        overdueNotifiedAt: null,
        snoozedUntil: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
        ),
      )
      .returning({ id: followUps.id });

    if (!updated) {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      actorUserId,
      type: "follow_up.edited",
      summary: `Follow-up edited: "${followUp.title}".`,
      metadata: {
        followUpId,
        title: followUp.title,
        reason: followUp.reason,
        channel: followUp.channel,
        category: followUp.category,
        sendMode: followUp.sendMode,
        dueAt: dueAt.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      locked: false,
      followUpId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      status: "pending" as const,
    };
  });
}

export async function deleteFollowUpForBusiness({
  businessId,
  followUpId,
  actorUserId,
}: UpdateFollowUpRecordInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingFollowUp] = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
        deletedAt: followUps.deletedAt,
      })
      .from(followUps)
      .where(
        and(eq(followUps.id, followUpId), eq(followUps.businessId, businessId)),
      )
      .limit(1)
      .for("update");

    if (!existingFollowUp) {
      return null;
    }

    if (existingFollowUp.deletedAt) {
      return {
        changed: false,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
      } as const;
    }

    await tx
      .update(followUps)
      .set({
        deletedAt: now,
        deletedByUserId: actorUserId,
        updatedAt: now,
      })
      .where(
        and(eq(followUps.id, followUpId), eq(followUps.businessId, businessId)),
      );

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      actorUserId,
      type: "follow_up.deleted",
      summary: `Follow-up deleted: "${existingFollowUp.title}".`,
      metadata: {
        followUpId,
        title: existingFollowUp.title,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      followUpId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
    };
  });
}

export async function reassignFollowUpForBusiness({
  businessId,
  followUpId,
  actorUserId,
  reassign,
}: UpdateFollowUpRecordInput & {
  reassign: FollowUpReassignInput;
}) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingFollowUp] = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
        status: followUps.status,
        assignedToUserId: followUps.assignedToUserId,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          isNull(followUps.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existingFollowUp) {
      return null;
    }

    if (existingFollowUp.status !== "pending") {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    if (existingFollowUp.assignedToUserId === reassign.assignedToUserId) {
      return {
        changed: false,
        locked: false,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    // The assignee must belong to this business — a follow-up can never point
    // at a user of another tenant.
    await assertAssigneeIsBusinessMember(
      tx,
      businessId,
      reassign.assignedToUserId,
    );

    const [updated] = await tx
      .update(followUps)
      .set({
        assignedToUserId: reassign.assignedToUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
        ),
      )
      .returning({ id: followUps.id });

    if (!updated) {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      actorUserId,
      type: "follow_up.reassigned",
      summary: `Follow-up reassigned.`,
      metadata: {
        followUpId,
        title: existingFollowUp.title,
        previousAssignedToUserId: existingFollowUp.assignedToUserId,
        assignedToUserId: reassign.assignedToUserId,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      locked: false,
      followUpId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      status: existingFollowUp.status,
    };
  });
}

// ---------------------------------------------------------------------------
// Snooze
// ---------------------------------------------------------------------------

export async function snoozeFollowUpForBusiness({
  businessId,
  followUpId,
  actorUserId,
  snoozedUntil,
  timezone,
}: UpdateFollowUpRecordInput & {
  snoozedUntil: Date;
  /** Business timezone — the recorded dates are read in it. */
  timezone?: string;
}) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingFollowUp] = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
        status: followUps.status,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          isNull(followUps.deletedAt),
        ),
      )
      .limit(1)
      .for("update");

    if (!existingFollowUp) {
      return null;
    }

    if (existingFollowUp.status !== "pending") {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    const [updated] = await tx
      .update(followUps)
      .set({
        snoozedUntil,
        updatedAt: now,
      })
      .where(
        and(
          eq(followUps.id, followUpId),
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
        ),
      )
      .returning({ id: followUps.id });

    if (!updated) {
      return {
        changed: false,
        locked: true,
        followUpId,
        inquiryId: existingFollowUp.inquiryId,
        quoteId: existingFollowUp.quoteId,
        status: existingFollowUp.status,
      } as const;
    }

    await tx.insert(activityLogs).values({
      id: createActivityId(),
      businessId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      actorUserId,
      type: "follow_up.snoozed",
      summary: `Follow-up snoozed until ${formatFollowUpDate(snoozedUntil, timezone)}.`,
      metadata: {
        followUpId,
        title: existingFollowUp.title,
        snoozedUntil: snoozedUntil.toISOString(),
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      locked: false,
      followUpId,
      inquiryId: existingFollowUp.inquiryId,
      quoteId: existingFollowUp.quoteId,
      status: existingFollowUp.status,
    };
  });
}

// ---------------------------------------------------------------------------
// Bulk Complete
// ---------------------------------------------------------------------------

export async function bulkCompleteFollowUpsForBusiness({
  businessId,
  followUpIds,
  actorUserId,
  completionNote,
  timezone,
}: {
  businessId: string;
  followUpIds: string[];
  actorUserId: string;
  completionNote?: string | null;
  /** Business timezone — the recorded dates are read in it. */
  timezone?: string;
}): Promise<{ affected: number; inquiryIds: Set<string>; quoteIds: Set<string> }> {
  const now = new Date();
  const inquiryIds = new Set<string>();
  const quoteIds = new Set<string>();
  let affected = 0;

  // Process in a single transaction for consistency
  await db.transaction(async (tx) => {
    const pendingFollowUps = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
        reason: followUps.reason,
        category: followUps.category,
        channel: followUps.channel,
        assignedToUserId: followUps.assignedToUserId,
        dueAt: followUps.dueAt,
        sendMode: followUps.sendMode,
        recurrence: followUps.recurrence,
        recurrenceCount: followUps.recurrenceCount,
        recurrenceLimit: followUps.recurrenceLimit,
        terminationCondition: followUps.terminationCondition,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
          isNull(followUps.deletedAt),
          inArray(followUps.id, followUpIds),
        ),
      )
      // Lock the selected rows so a concurrent single-record completion
      // cannot also spawn the next occurrence of the same series.
      .for("update");

    for (const fup of pendingFollowUps) {
      const [updated] = await tx
        .update(followUps)
        .set({
          status: "completed",
          completedAt: now,
          completionNote: completionNote ?? null,
          skippedAt: null,
          snoozedUntil: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(followUps.id, fup.id),
            eq(followUps.businessId, businessId),
            eq(followUps.status, "pending"),
          ),
        )
        .returning({ id: followUps.id });

      if (!updated) {
        continue;
      }

      await tx.insert(activityLogs).values({
        id: createActivityId(),
        businessId,
        inquiryId: fup.inquiryId,
        quoteId: fup.quoteId,
        actorUserId,
        type: "follow_up.completed",
        summary: completionNote
          ? `Follow-up completed (bulk): ${completionNote.slice(0, 60)}`
          : "Follow-up completed (bulk).",
        metadata: {
          followUpId: fup.id,
          title: fup.title,
          bulk: true,
          ...(completionNote ? { completionNote } : {}),
        },
        createdAt: now,
        updatedAt: now,
      });

      // A recurring series must survive a bulk completion, exactly as it
      // does when the owner clears the row one at a time.
      await spawnNextRecurrence(tx, {
        businessId,
        actorUserId,
        parent: {
          ...fup,
          category: getFollowUpCategory(fup.category),
        },
        parentFollowUpId: fup.id,
        now,
        timezone,
      });

      if (fup.inquiryId) inquiryIds.add(fup.inquiryId);
      if (fup.quoteId) quoteIds.add(fup.quoteId);
      affected++;
    }
  });

  return { affected, inquiryIds, quoteIds };
}

// ---------------------------------------------------------------------------
// Bulk Skip
// ---------------------------------------------------------------------------

export async function bulkSkipFollowUpsForBusiness({
  businessId,
  followUpIds,
  actorUserId,
}: {
  businessId: string;
  followUpIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; inquiryIds: Set<string>; quoteIds: Set<string> }> {
  const now = new Date();
  const inquiryIds = new Set<string>();
  const quoteIds = new Set<string>();
  let affected = 0;

  await db.transaction(async (tx) => {
    const pendingFollowUps = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
      })
      .from(followUps)
      .where(
        and(
          eq(followUps.businessId, businessId),
          eq(followUps.status, "pending"),
          isNull(followUps.deletedAt),
          inArray(followUps.id, followUpIds),
        ),
      )
      .for("update");

    for (const fup of pendingFollowUps) {
      const [updated] = await tx
        .update(followUps)
        .set({
          status: "skipped",
          skippedAt: now,
          completedAt: null,
          snoozedUntil: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(followUps.id, fup.id),
            eq(followUps.businessId, businessId),
            eq(followUps.status, "pending"),
          ),
        )
        .returning({ id: followUps.id });

      if (!updated) {
        continue;
      }

      await tx.insert(activityLogs).values({
        id: createActivityId(),
        businessId,
        inquiryId: fup.inquiryId,
        quoteId: fup.quoteId,
        actorUserId,
        type: "follow_up.skipped",
        summary: "Follow-up skipped (bulk).",
        metadata: {
          followUpId: fup.id,
          title: fup.title,
          bulk: true,
        },
        createdAt: now,
        updatedAt: now,
      });

      if (fup.inquiryId) inquiryIds.add(fup.inquiryId);
      if (fup.quoteId) quoteIds.add(fup.quoteId);
      affected++;
    }
  });

  return { affected, inquiryIds, quoteIds };
}

// ---------------------------------------------------------------------------
// Auto-close: skip pending follow-ups when a quote is accepted/rejected
// ---------------------------------------------------------------------------

export async function autoCloseFollowUpsForQuote({
  businessId,
  quoteId,
  reason,
}: {
  businessId: string;
  quoteId: string;
  reason: "quote_accepted" | "quote_rejected";
}): Promise<number> {
  const now = new Date();
  const reasonLabel = reason === "quote_accepted" ? "Quote accepted" : "Quote declined";

  const pendingFollowUps = await db
    .select({
      id: followUps.id,
      inquiryId: followUps.inquiryId,
      title: followUps.title,
    })
    .from(followUps)
    .where(
      and(
        eq(followUps.businessId, businessId),
        eq(followUps.quoteId, quoteId),
        eq(followUps.status, "pending"),
        isNull(followUps.deletedAt),
      ),
    );

  if (!pendingFollowUps.length) {
    return 0;
  }

  await db.transaction(async (tx) => {
    for (const fup of pendingFollowUps) {
      await tx
        .update(followUps)
        .set({
          status: "skipped",
          skippedAt: now,
          completionNote: `Auto-closed: ${reasonLabel}`,
          snoozedUntil: null,
          updatedAt: now,
        })
        .where(eq(followUps.id, fup.id));

      await tx.insert(activityLogs).values({
        id: createActivityId(),
        businessId,
        inquiryId: fup.inquiryId,
        quoteId,
        actorUserId: null,
        type: "follow_up.auto_closed",
        summary: `Follow-up auto-closed: ${reasonLabel}.`,
        metadata: {
          followUpId: fup.id,
          title: fup.title,
          reason,
        },
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  return pendingFollowUps.length;
}

// ---------------------------------------------------------------------------
// Check and terminate recurring follow-ups when linked item reaches terminal status
// ---------------------------------------------------------------------------

/**
 * Batch variant of {@link terminateRecurringFollowUpsForRecords}: stops every
 * recurring series that is linked to one of the records that just reached a
 * terminal status. Used by the bulk inquiry/quote status sweeps.
 */
export async function terminateRecurringFollowUpsForRecords({
  businessId,
  records,
}: {
  businessId: string;
  records: {
    inquiryId?: string | null;
    quoteId?: string | null;
    newStatus: string;
  }[];
}): Promise<number> {
  const terminal = records.filter((record) => {
    if (record.inquiryId) {
      return isTerminalInquiryStatus(record.newStatus);
    }

    if (record.quoteId) {
      return isTerminalQuoteStatus(record.newStatus);
    }

    return false;
  });

  if (terminal.length === 0) {
    return 0;
  }

  const now = new Date();
  const inquiryIds = terminal
    .map((record) => record.inquiryId)
    .filter((id): id is string => Boolean(id));
  const quoteIds = terminal
    .map((record) => record.quoteId)
    .filter((id): id is string => Boolean(id));

  const statusByInquiry = new Map(
    terminal
      .filter((record) => record.inquiryId)
      .map((record) => [record.inquiryId as string, record.newStatus]),
  );
  const statusByQuote = new Map(
    terminal
      .filter((record) => record.quoteId)
      .map((record) => [record.quoteId as string, record.newStatus]),
  );

  return db.transaction(async (tx) => {
    let terminated = 0;

    const conditions = [
      eq(followUps.businessId, businessId),
      eq(followUps.status, "pending"),
      eq(followUps.terminationCondition, "terminal_status"),
      ne(followUps.recurrence, "none"),
      isNull(followUps.deletedAt),
    ];

    // A batch may carry inquiry records, quote records, or both. The id
    // predicate is an OR, otherwise a row would have to satisfy both.
    const idConditions = [];

    if (inquiryIds.length > 0) {
      idConditions.push(inArray(followUps.inquiryId, inquiryIds));
    }

    if (quoteIds.length > 0) {
      idConditions.push(inArray(followUps.quoteId, quoteIds));
    }

    if (idConditions.length > 0) {
      conditions.push(or(...idConditions)!);
    }

    const pendingRecurring = await tx
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        title: followUps.title,
      })
      .from(followUps)
      .where(and(...conditions))
      .for("update");

    if (pendingRecurring.length === 0) {
      return 0;
    }

    for (const fup of pendingRecurring) {
      // A quote-linked follow-up also carries the quote's inquiry id, so the
      // quote status is looked up first — the quote is the record that
      // actually reached a terminal status in the quote paths.
      const quoteStatus = fup.quoteId
        ? statusByQuote.get(fup.quoteId)
        : undefined;
      const inquiryStatus = fup.inquiryId
        ? statusByInquiry.get(fup.inquiryId)
        : undefined;
      const newStatus = quoteStatus ?? inquiryStatus;

      if (!newStatus) {
        continue;
      }

      const reasonLabel = quoteStatus
        ? `Quote reached terminal status: ${newStatus}`
        : `Inquiry reached terminal status: ${newStatus}`;

      const [updated] = await tx
        .update(followUps)
        .set({
          status: "skipped",
          skippedAt: now,
          completionNote: `Auto-terminated: ${reasonLabel}`,
          snoozedUntil: null,
          updatedAt: now,
        })
        .where(
          and(
            eq(followUps.id, fup.id),
            eq(followUps.businessId, businessId),
            eq(followUps.status, "pending"),
          ),
        )
        .returning({ id: followUps.id });

      if (!updated) {
        continue;
      }

      terminated++;

      await tx.insert(activityLogs).values({
        id: createActivityId(),
        businessId,
        inquiryId: fup.inquiryId,
        quoteId: fup.quoteId,
        actorUserId: null,
        type: "follow_up.auto_closed",
        summary: `Recurring follow-up terminated: ${reasonLabel}.`,
        metadata: {
          followUpId: fup.id,
          title: fup.title,
          reason: "terminal_status",
          newStatus,
        },
        createdAt: now,
        updatedAt: now,
      });
    }

    return terminated;
  });
}
