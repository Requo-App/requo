import "server-only";

import { and, eq, gt, isNull, lt, lte, or } from "drizzle-orm";

import {
  buildFollowUpSuggestedMessage,
  getFollowUpCategory,
  getNextRecurrenceDueDate,
} from "@/features/follow-ups/utils";
import { spawnNextRecurrence } from "@/features/follow-ups/mutations";
import type {
  FollowUpChannel,
  FollowUpRecurrence,
  FollowUpSendMode,
  FollowUpTerminationCondition,
} from "@/features/follow-ups/types";
import { getPublicQuoteUrl } from "@/features/quotes/utils";
import { db } from "@/lib/db/client";
import { activityLogs, businesses, followUps, inquiries, quotes } from "@/lib/db/schema";
import { env, isFollowUpAutoSendEmailEnabled } from "@/lib/env";
import { newEntityId } from "@/lib/ids";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type { BusinessPlan } from "@/lib/plans/plans";
import {
  getDailyAutoFollowUpSendCount,
  getMonthlyAutoFollowUpSendCount,
} from "@/lib/plans/usage";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import {
  getRecipientKey,
  sendFollowUpAutoSendEmail,
  sendQuoteAutoFollowUpEmail,
} from "@/lib/email/transactional";

export type FollowUpAutoSendSummary = {
  processed: number;
  sent: number;
  skipped: number;
  limitReached: boolean;
};

const BATCH_SIZE = 100;
const MAX_BATCHES = 10;

/** Remaining automatic-send budget for one business in the current day/month. */
type AutoSendBudget = {
  dailyRemaining: number;
  monthlyRemaining: number;
};

export async function processAutomaticFollowUpSends(): Promise<FollowUpAutoSendSummary> {
  // Low-email deployments disable unattended customer sends via configuration
  // instead of deleting the feature. Manual reminders are unaffected.
  if (!isFollowUpAutoSendEmailEnabled) {
    return { processed: 0, sent: 0, skipped: 0, limitReached: false };
  }

  const now = new Date();
  let processed = 0;
  let sent = 0;
  let skipped = 0;
  let limitReached = false;
  let lastProcessedId: string | null = null;

  // Load each business's remaining budget once per run, then decrement as we
  // send so a single batch can never overshoot the plan allowance.
  const budgetByBusiness = new Map<string, AutoSendBudget>();

  async function getRemainingBudget(
    businessId: string,
    plan: BusinessPlan,
  ): Promise<AutoSendBudget> {
    const cached = budgetByBusiness.get(businessId);

    if (cached) {
      return cached;
    }

    const dailyLimit = getUsageLimit(plan, "autoFollowUpEmailsPerDay");
    const monthlyLimit = getUsageLimit(plan, "autoFollowUpEmailsPerMonth");

    const [dailyUsed, monthlyUsed] = await Promise.all([
      getDailyAutoFollowUpSendCount(businessId),
      getMonthlyAutoFollowUpSendCount(businessId),
    ]);

    const budget: AutoSendBudget = {
      dailyRemaining:
        dailyLimit === null
          ? Number.POSITIVE_INFINITY
          : Math.max(0, dailyLimit - dailyUsed),
      monthlyRemaining:
        monthlyLimit === null
          ? Number.POSITIVE_INFINITY
          : Math.max(0, monthlyLimit - monthlyUsed),
    };

    budgetByBusiness.set(businessId, budget);

    return budget;
  }

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const conditions = [
      eq(followUps.status, "pending"),
      eq(followUps.sendMode, "automatic"),
      eq(followUps.channel, "email"),
      isNull(followUps.deletedAt),
      lte(followUps.dueAt, now),
      // Exclude recurrences spawned during this run, regardless of ID order.
      lt(followUps.createdAt, now),
      // Respect snooze: skip if snoozedUntil is in the future
      or(isNull(followUps.snoozedUntil), lte(followUps.snoozedUntil, now))!,
    ];

    if (lastProcessedId) {
      conditions.push(gt(followUps.id, lastProcessedId));
    }

    const dueFollowUps = await db
      .select({
        followUpId: followUps.id,
        followUpTitle: followUps.title,
        followUpReason: followUps.reason,
        category: followUps.category,
        assignedToUserId: followUps.assignedToUserId,
        channel: followUps.channel,
        sendMode: followUps.sendMode,
        recurrence: followUps.recurrence,
        recurrenceCount: followUps.recurrenceCount,
        recurrenceLimit: followUps.recurrenceLimit,
        terminationCondition: followUps.terminationCondition,
        dueAt: followUps.dueAt,
        businessId: followUps.businessId,
        businessName: businesses.name,
        businessPlan: businesses.plan,
        businessContactEmail: businesses.contactEmail,
        businessTimezone: businesses.timezone,
        defaultEmailSignature: businesses.defaultEmailSignature,
        quoteFollowUpTemplate: businesses.quoteFollowUpTemplate,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        inquiryCustomerName: inquiries.customerName,
        inquiryCustomerEmail: inquiries.customerEmail,
        quoteCustomerName: quotes.customerName,
        quoteCustomerEmail: quotes.customerEmail,
        quoteNumber: quotes.quoteNumber,
        quoteTitle: quotes.title,
        quotePublicToken: quotes.publicToken,
        quoteViewedAt: quotes.publicViewedAt,
      })
      .from(followUps)
      .innerJoin(businesses, eq(followUps.businessId, businesses.id))
      .leftJoin(inquiries, eq(followUps.inquiryId, inquiries.id))
      .leftJoin(quotes, eq(followUps.quoteId, quotes.id))
      .where(and(...conditions))
      .orderBy(followUps.id)
      .limit(BATCH_SIZE);

    if (dueFollowUps.length === 0) {
      break;
    }

    for (const row of dueFollowUps) {
      const customerEmail = row.quoteCustomerEmail ?? row.inquiryCustomerEmail;

      // Creation guards this, but skip defensively so a stale row never blocks the batch.
      if (!customerEmail) {
        skipped++;
        lastProcessedId = row.followUpId;
        continue;
      }

      const customerName = row.quoteCustomerName ?? row.inquiryCustomerName ?? "there";
      const isQuoteFollowUp = Boolean(row.quoteId);
      const plan = row.businessPlan as BusinessPlan;

      // Unattended sends are a paid capability. A business that downgraded
      // keeps `sendMode = automatic` on the row but must stop sending, so the
      // entitlement is re-checked at send time rather than only at create time.
      if (!hasFeatureAccess(plan, "autoFollowUps")) {
        skipped++;
        lastProcessedId = row.followUpId;
        continue;
      }

      const budget = await getRemainingBudget(row.businessId, plan);

      if (budget.dailyRemaining <= 0 || budget.monthlyRemaining <= 0) {
        // Budget exhausted: leave the follow-up pending so it resumes when
        // the day/month window resets.
        skipped++;
        lastProcessedId = row.followUpId;
        continue;
      }

      const message = buildFollowUpSuggestedMessage({
        kind: isQuoteFollowUp ? "quote" : "inquiry",
        businessName: row.businessName,
        customerName,
        quoteUrl: null,
        quoteViewedAt: row.quoteViewedAt,
      });
      const subject = isQuoteFollowUp
        ? `Following up: ${row.quoteNumber ? `Quote ${row.quoteNumber}` : (row.quoteTitle ?? "your quote")}`
        : `Following up from ${row.businessName}`;

      let didSend = false;

      try {
        await db.transaction(async (tx) => {
          // Lock row to prevent concurrent workers from sending duplicates
          const [locked] = await tx
            .select({ id: followUps.id })
            .from(followUps)
            .where(
              and(
                eq(followUps.id, row.followUpId),
                eq(followUps.status, "pending"),
                eq(followUps.sendMode, "automatic"),
              ),
            )
            .for("update", { skipLocked: true });

          if (!locked) {
            // Already processed by another worker
            return;
          }

          const delivered = await sendFollowUpAutoSend(row, {
            customerEmail,
            customerName,
            message,
            subject,
            plan,
          });

          if (!delivered) {
            // Nothing reached the customer. Leave the follow-up pending so it
            // is retried, and do not charge the business's allowance.
            return;
          }

          // The email is on its way. Charge the allowance even if the
          // transaction below rolls back — otherwise a failed write would
          // let the business send more than its plan allows.
          didSend = true;

          await tx
            .update(followUps)
            .set({
              status: "completed",
              completedAt: now,
              completionNote: "Sent automatically.",
              snoozedUntil: null,
              updatedAt: now,
            })
            .where(eq(followUps.id, row.followUpId));

          await tx.insert(activityLogs).values({
            id: newEntityId(),
            businessId: row.businessId,
            inquiryId: row.inquiryId,
            quoteId: row.quoteId,
            actorUserId: null,
            type: "follow_up.auto_sent",
            summary: `Follow-up automatically sent to ${customerEmail}.`,
            metadata: {
              followUpId: row.followUpId,
              title: row.followUpTitle,
              to: customerEmail,
            },
            createdAt: now,
            updatedAt: now,
          });

          sent++;
          processed++;

          // A repeating automatic follow-up must keep repeating: the next
          // occurrence inherits the send mode and the recurrence, exactly as
          // it does when the owner completes the row by hand.
          // Skip missed occurrences so an overdue series resumes with the
          // first future slot. The spawn helper advances the parent once more.
          let recurrenceDueAt = row.dueAt;

          if (row.recurrence !== "none") {
            let nextDueAt = getNextRecurrenceDueDate(
              recurrenceDueAt, row.recurrence, row.businessTimezone,
            );

            while (nextDueAt <= now) {
              recurrenceDueAt = nextDueAt;
              nextDueAt = getNextRecurrenceDueDate(
                recurrenceDueAt, row.recurrence, row.businessTimezone,
              );
            }
          }

          await spawnNextRecurrence(tx, {
            businessId: row.businessId,
            actorUserId: null,
            parent: {
              inquiryId: row.inquiryId,
              quoteId: row.quoteId,
              title: row.followUpTitle,
              reason: row.followUpReason,
              category: getFollowUpCategory(row.category),
              channel: row.channel,
              assignedToUserId: row.assignedToUserId,
              dueAt: recurrenceDueAt,
              sendMode: row.sendMode,
              recurrence: row.recurrence,
              recurrenceCount: row.recurrenceCount,
              recurrenceLimit: row.recurrenceLimit,
              terminationCondition: row.terminationCondition,
            },
            parentFollowUpId: row.followUpId,
            now,
            timezone: row.businessTimezone,
          });
        });
      } catch (error) {
        console.error(
          `[follow-up-auto-send] Failed to process follow-up ${row.followUpId}`,
          error,
        );
      }

      // The budget is only consumed by an actual send, so a failed send does
      // not burn the allowance.
      if (didSend) {
        const budget = budgetByBusiness.get(row.businessId);

        if (budget) {
          budget.dailyRemaining -= 1;
          budget.monthlyRemaining -= 1;
        }
      }

      lastProcessedId = row.followUpId;
    }

    if (dueFollowUps.length < BATCH_SIZE) {
      break;
    }

    if (batch === MAX_BATCHES - 1) {
      limitReached = true;
      console.warn(
        `[follow-up-auto-send] Reached max batch limit (${MAX_BATCHES * BATCH_SIZE} items). Some follow-ups may be processed in the next run.`,
      );
    }
  }

  return { processed, sent, skipped, limitReached };
}

type AutoSendRow = {
  followUpId: string;
  followUpTitle: string;
  followUpReason: string;
  category: string;
  assignedToUserId: string | null;
  channel: FollowUpChannel;
  sendMode: FollowUpSendMode;
  recurrence: FollowUpRecurrence;
  recurrenceCount: number;
  recurrenceLimit: number | null;
  terminationCondition: FollowUpTerminationCondition | null;
  dueAt: Date;
  businessId: string;
  businessName: string;
  businessContactEmail: string | null;
  businessTimezone: string;
  defaultEmailSignature: string | null;
  quoteFollowUpTemplate: unknown;
  inquiryId: string | null;
  quoteId: string | null;
  quoteNumber: string | null;
  quoteTitle: string | null;
  quotePublicToken: string | null;
};

/**
 * Send the follow-up email.
 *
 * A quote follow-up with a public URL uses the quote follow-up template, so
 * the business template, the signature and the quote link all apply. Anything
 * else falls back to the branded follow-up layout, and inquiry follow-ups are
 * recorded as `inquiry` emails instead of polluting the quote email metrics.
 */
async function sendFollowUpAutoSend(
  row: AutoSendRow,
  {
    customerEmail,
    customerName,
    message,
    subject,
    plan,
  }: {
    customerEmail: string;
    customerName: string;
    message: string;
    subject: string;
    plan: BusinessPlan;
  },
): Promise<boolean> {
  const replyToEmail = row.businessContactEmail ?? undefined;

  if (row.quoteId && row.quotePublicToken) {
    const publicQuoteUrl = new URL(
      getPublicQuoteUrl(row.quotePublicToken),
      env.BETTER_AUTH_URL,
    ).toString();

    return sendQuoteAutoFollowUpEmail({
      quoteId: row.quoteId,
      businessName: row.businessName,
      customerName,
      customerEmail,
      quoteNumber: row.quoteNumber ?? row.quoteTitle ?? "your quote",
      title: row.quoteTitle ?? row.followUpTitle,
      publicQuoteUrl,
      // The template copy must be truthful: a recurring follow-up is not
      // always the first attempt.
      attemptNumber: (row.recurrenceCount ?? 0) + 1,
      emailSignature: row.defaultEmailSignature,
      templateOverrides: hasFeatureAccess(plan, "emailTemplates")
        ? (row.quoteFollowUpTemplate as Parameters<
            typeof sendQuoteAutoFollowUpEmail
          >[0]["templateOverrides"])
        : null,
      replyToEmail,
      businessId: row.businessId,
      // Scoped to the follow-up, not the quote: two automatic follow-ups on
      // the same quote must both reach the customer.
      idempotencyKey: `follow-up-auto-send:${row.followUpId}:${getRecipientKey(customerEmail)}`,
    });
  }

  return sendFollowUpAutoSendEmail({
    followUpId: row.followUpId,
    businessId: row.businessId,
    businessName: row.businessName,
    customerEmail,
    customerName,
    message,
    subject,
    emailSignature: row.defaultEmailSignature,
    replyToEmail,
    emailType: row.quoteId ? "quote" : "inquiry",
  });
}
