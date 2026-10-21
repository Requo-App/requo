import "server-only";

import { and, eq, gt, isNotNull, isNull, lt, lte, or } from "drizzle-orm";

import { insertBusinessNotification } from "@/features/notifications/mutations";
import { getTodayDateStringInTimezone, getBusinessDayStartInstant } from "@/features/follow-ups/utils";
import {
  getBusinessHomePath,
  getBusinessInquiryPath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";
import { sendEmailWithFallback } from "@/lib/email";
import { db } from "@/lib/db/client";
import { businesses, followUps, inquiries, quotes } from "@/lib/db/schema";
import { env, isFollowUpReminderEmailEnabled } from "@/lib/env";

export type FollowUpRemindersSummary = {
  processed: number;
  emailsSent: number;
  inAppCreated: number;
  limitReached: boolean;
};

const BATCH_SIZE = 100;
const MAX_BATCHES = 10;

export async function processFollowUpReminders(): Promise<FollowUpRemindersSummary> {
  const now = new Date();
  let emailsSent = 0;
  let inAppCreated = 0;
  let processed = 0;
  let limitReached = false;

  // Paginated processing of due follow-ups
  let lastProcessedId: string | null = null;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const conditions = [
      eq(followUps.status, "pending"),
      isNull(followUps.deletedAt),
      isNull(followUps.reminderSentAt),
      lte(followUps.dueAt, now),
      // Respect snooze: skip if snoozedUntil is in the future
      or(
        isNull(followUps.snoozedUntil),
        lte(followUps.snoozedUntil, now),
      )!,
    ];

    if (lastProcessedId) {
      conditions.push(gt(followUps.id, lastProcessedId));
    }

    const dueFollowUps = await db
      .select({
        followUpId: followUps.id,
        followUpTitle: followUps.title,
        followUpReason: followUps.reason,
        businessId: followUps.businessId,
        businessName: businesses.name,
        businessSlug: businesses.slug,
        businessContactEmail: businesses.contactEmail,
        notifyEmail: businesses.notifyOnFollowUpReminder,
        notifyInApp: businesses.notifyInAppOnFollowUpReminder,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        customerName: inquiries.customerName,
        quoteCustomerName: quotes.customerName,
        quoteNumber: quotes.quoteNumber,
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
      const customerName = row.quoteCustomerName ?? row.customerName ?? "a customer";
      const recordLabel = row.quoteNumber
        ? `Quote ${row.quoteNumber}`
        : "an inquiry";

      try {
        await db.transaction(async (tx) => {
          // Lock row to prevent concurrent workers from sending duplicates
          const [locked] = await tx
            .select({ id: followUps.id })
            .from(followUps)
            .where(
              and(
                eq(followUps.id, row.followUpId),
                isNull(followUps.reminderSentAt)
              )
            )
            .for("update", { skipLocked: true });

          if (!locked) {
            // Already processed by another worker
            return;
          }

          if (row.notifyInApp) {
            await insertBusinessNotification(tx, {
              businessId: row.businessId,
              inquiryId: row.inquiryId,
              quoteId: row.quoteId,
              type: "follow_up_due",
              title: `Follow-up due: ${row.followUpTitle}`,
              summary: `Reminder to follow up with ${customerName} about ${recordLabel}.`,
            });
            inAppCreated++;
          }

          // Low-email mode disables reminder email while retaining the
          // in-app follow_up_due notification above. Per-business
          // notifyOnFollowUpReminder still controls non-low-email deployments.
          if (
            isFollowUpReminderEmailEnabled &&
            row.notifyEmail &&
            row.businessContactEmail
          ) {
            await sendEmailWithFallback({
              to: row.businessContactEmail,
              subject: `Follow-up due: ${row.followUpTitle}`,
              html: buildReminderEmailHtml({
                businessName: row.businessName,
                businessSlug: row.businessSlug,
                followUpTitle: row.followUpTitle,
                followUpReason: row.followUpReason,
                customerName,
                recordLabel,
                quoteId: row.quoteId,
                inquiryId: row.inquiryId,
              }),
              emailType: "notification",
              businessId: row.businessId,
              idempotencyKey: `fup-reminder-${row.followUpId}-${now.toISOString().slice(0, 10)}`,
            });
            emailsSent++;
          }

          await tx
            .update(followUps)
            .set({ reminderSentAt: now })
            .where(eq(followUps.id, row.followUpId));

          processed++;
        });
      } catch (error) {
        console.error(
          `[follow-up-reminders] Failed to process follow-up ${row.followUpId}`,
          error,
        );
      }

      lastProcessedId = row.followUpId;
    }

    if (dueFollowUps.length < BATCH_SIZE) {
      break;
    }

    if (batch === MAX_BATCHES - 1) {
      limitReached = true;
      console.warn(
        `[follow-up-reminders] Reached max batch limit (${MAX_BATCHES * BATCH_SIZE} items). Some follow-ups may be processed in the next run.`,
      );
    }
  }

  // Process overdue follow-ups (already reminded) — also paginated
  let lastOverdueId: string | null = null;

  for (let batch = 0; batch < MAX_BATCHES; batch++) {
    const overdueConditions = [
      eq(followUps.status, "pending"),
      isNull(followUps.deletedAt),
      isNotNull(followUps.reminderSentAt),
      lt(followUps.dueAt, now),
      // Respect snooze for overdue events too
      or(
        isNull(followUps.snoozedUntil),
        lte(followUps.snoozedUntil, now),
      )!,
    ];

    if (lastOverdueId) {
      overdueConditions.push(gt(followUps.id, lastOverdueId));
    }

    const overdueFollowUps = await db
      .select({
        followUpId: followUps.id,
        followUpTitle: followUps.title,
        businessId: followUps.businessId,
        timezone: businesses.timezone,
        dueAt: followUps.dueAt,
        quoteId: followUps.quoteId,
        inquiryId: followUps.inquiryId,
        overdueNotifiedAt: followUps.overdueNotifiedAt,
        notifyInApp: businesses.notifyInAppOnFollowUpReminder,
      })
      .from(followUps)
      .innerJoin(businesses, eq(followUps.businessId, businesses.id))
      .where(and(...overdueConditions))
      .orderBy(followUps.id)
      .limit(BATCH_SIZE);

    if (overdueFollowUps.length === 0) {
      break;
    }

    for (const overdue of overdueFollowUps) {
      const overdueBy = Math.floor(
        (now.getTime() - overdue.dueAt.getTime()) / (1000 * 60 * 60 * 24),
      );

      // Raise the "still overdue" notice at most once per business-local day.
      // Without this marker a follow-up left open would push a fresh
      // notification into the inbox every single day.
      const today = getTodayDateStringInTimezone(overdue.timezone, now);
      const lastNotifiedDay = overdue.overdueNotifiedAt
        ? getTodayDateStringInTimezone(overdue.timezone, overdue.overdueNotifiedAt)
        : null;

      if (overdueBy >= 1 && overdue.notifyInApp && lastNotifiedDay !== today) {
        // The claim itself is day-scoped: a second worker blocked on the row
        // lock re-evaluates this predicate against the new row version, so
        // the marker alone would not stop a second notification.
        const dayStart = getBusinessDayStartInstant(today, overdue.timezone);

        const claimed = await db.transaction(async (tx) => {
          const [row] = await tx
            .update(followUps)
            .set({ overdueNotifiedAt: now, updatedAt: now })
            .where(
              and(
                eq(followUps.id, overdue.followUpId),
                eq(followUps.businessId, overdue.businessId),
                eq(followUps.status, "pending"),
                isNull(followUps.deletedAt),
                or(
                  isNull(followUps.overdueNotifiedAt),
                  lt(followUps.overdueNotifiedAt, dayStart),
                )!,
              ),
            )
            .returning({ id: followUps.id });

          if (!row) {
            return false;
          }

          await insertBusinessNotification(tx, {
            businessId: overdue.businessId,
            inquiryId: overdue.inquiryId,
            quoteId: overdue.quoteId,
            type: "follow_up_due",
            title: `Follow-up overdue: ${overdue.followUpTitle}`,
            summary: `This follow-up was due ${overdueBy} day${overdueBy > 1 ? "s" : ""} ago and still needs attention.`,
            metadata: {
              followUpId: overdue.followUpId,
              overdueBy,
              dueAt: overdue.dueAt.toISOString(),
            },
            now,
          });

          return true;
        });

        if (claimed) {
          inAppCreated++;
        }
      }

      lastOverdueId = overdue.followUpId;
    }

    if (overdueFollowUps.length < BATCH_SIZE) {
      break;
    }
  }

  return { processed, emailsSent, inAppCreated, limitReached };
}

function buildReminderEmailHtml(input: {
  businessName: string;
  businessSlug: string;
  followUpTitle: string;
  followUpReason: string;
  customerName: string;
  recordLabel: string;
  quoteId: string | null;
  inquiryId: string | null;
}) {
  const appUrl = env.BETTER_AUTH_URL;

  // Dashboard routes live under `/{slug}/…`. Building the path by hand used
  // to produce `/b/{slug}/…`, which does not exist and 404s every reminder.
  const linkPath = input.quoteId
    ? getBusinessQuotePath(input.businessSlug, input.quoteId)
    : input.inquiryId
      ? getBusinessInquiryPath(input.businessSlug, input.inquiryId)
      : getBusinessHomePath(input.businessSlug);

  const fullLink = `${appUrl}${linkPath}`;

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px;">
      <h2 style="font-size: 18px; font-weight: 600; margin: 0 0 16px;">Follow-up reminder</h2>
      <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 12px;">
        <strong>${input.followUpTitle}</strong> is due for ${input.customerName} (${input.recordLabel}).
      </p>
      <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
        ${input.followUpReason}
      </p>
      <a href="${fullLink}" style="display: inline-block; background: #111827; color: #fff; padding: 10px 20px; border-radius: 8px; text-decoration: none; font-size: 14px; font-weight: 500;">
        Open Details
      </a>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">
        You're receiving this because follow-up reminders are enabled for ${input.businessName}.
      </p>
    </div>
  `;
}
