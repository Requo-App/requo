import "server-only";

import { and, eq, isNull, sql } from "drizzle-orm";

import { getPublicQuoteUrl } from "@/features/quotes/utils";
import { getLocalDateString } from "@/features/follow-ups/utils";
import { db } from "@/lib/db/client";
import { activityLogs, businesses, quotes } from "@/lib/db/schema";
import { env, isQuoteAutoFollowUpEmailEnabled } from "@/lib/env";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import type { BusinessPlan } from "@/lib/plans/plans";
import {
  getDailyAutoFollowUpSendCount,
  getMonthlyAutoFollowUpSendCount,
} from "@/lib/plans/usage";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { sendQuoteAutoFollowUpEmail } from "@/lib/email/transactional";
import { newEntityId } from "@/lib/ids";

export type AutoFollowUpsSummary = {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
};

/** Remaining sending budget for one business in the current day/month. */
type AutoFollowUpBudget = {
  dailyRemaining: number;
  monthlyRemaining: number;
};

export async function processQuoteAutoFollowUps(): Promise<AutoFollowUpsSummary> {
  // Low-email deployments disable unattended auto-follow-up sends via
  // configuration instead of deleting the feature. Per-quote
  // autoFollowUpEnabled still controls non-low-email deployments.
  if (!isQuoteAutoFollowUpEmailEnabled) {
    return { processed: 0, sent: 0, skipped: 0, errors: 0 };
  }

  const now = new Date();
  let sent = 0;
  let processed = 0;
  let skipped = 0;
  let errors = 0;

  // Load each business's remaining budget once per run, then decrement as we
  // send so a single batch can never overshoot the plan allowance.
  const budgetByBusiness = new Map<string, AutoFollowUpBudget>();

  async function getRemainingBudget(
    businessId: string,
    plan: BusinessPlan,
  ): Promise<AutoFollowUpBudget> {
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

    const budget: AutoFollowUpBudget = {
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

  const eligibleQuotes = await db
    .select({
      quoteId: quotes.id,
      businessId: quotes.businessId,
      businessName: businesses.name,
      businessPlan: businesses.plan,
      businessContactEmail: businesses.contactEmail,
      defaultEmailSignature: businesses.defaultEmailSignature,
      quoteFollowUpTemplate: businesses.quoteFollowUpTemplate,
      quoteNumber: quotes.quoteNumber,
      title: quotes.title,
      customerName: quotes.customerName,
      customerEmail: quotes.customerEmail,
      publicToken: quotes.publicToken,
      sentAt: quotes.sentAt,
      autoFollowUpDelayDays: quotes.autoFollowUpDelayDays,
      autoFollowUpMaxAttempts: quotes.autoFollowUpMaxAttempts,
      autoFollowUpAttempts: quotes.autoFollowUpAttempts,
      autoFollowUpLastSentAt: quotes.autoFollowUpLastSentAt,
      validUntil: quotes.validUntil,
      timezone: businesses.timezone,
    })
    .from(quotes)
    .innerJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(
      and(
        eq(quotes.status, "sent"),
        // Exclude expired quotes before they can consume the candidate limit.
        sql`${quotes.validUntil} >= (${now.toISOString()}::timestamptz AT TIME ZONE ${businesses.timezone})::date`,
        eq(quotes.autoFollowUpEnabled, true),
        isNull(quotes.autoFollowUpStoppedAt),
        isNull(quotes.publicViewedAt),
        isNull(quotes.customerRespondedAt),
        isNull(quotes.deletedAt),
        sql`${quotes.autoFollowUpAttempts} < ${quotes.autoFollowUpMaxAttempts}`,
      ),
    )
    .limit(50);

  for (const row of eligibleQuotes) {
    const referenceDate = row.autoFollowUpLastSentAt ?? row.sentAt;

    if (!referenceDate) {
      continue;
    }

    // Never chase a quote the customer can no longer accept.
    if (row.validUntil < getLocalDateString(now, row.timezone)) {
      continue;
    }

    const nextSendAfter = new Date(
      referenceDate.getTime() + row.autoFollowUpDelayDays * 24 * 60 * 60 * 1000,
    );

    if (now < nextSendAfter) {
      continue;
    }

    if (!row.customerEmail || !row.publicToken) {
      continue;
    }

    const plan = row.businessPlan as BusinessPlan;

    // A business that downgraded keeps `autoFollowUpEnabled` on the row but
    // must stop sending. Re-check the entitlement at send time, not just at
    // enable time, so a downgrade pauses the sequence instead of leaking sends.
    if (!hasFeatureAccess(plan, "autoFollowUps")) {
      skipped++;
      continue;
    }

    const budget = await getRemainingBudget(row.businessId, plan);

    if (budget.dailyRemaining <= 0 || budget.monthlyRemaining <= 0) {
      // Budget exhausted: leave the sequence pending and do NOT advance
      // attempts, so it resumes when the day/month window resets.
      skipped++;
      continue;
    }

    const attemptNumber = row.autoFollowUpAttempts + 1;

    try {
      const publicQuoteUrl = new URL(
        getPublicQuoteUrl(row.publicToken),
        env.BETTER_AUTH_URL,
      ).toString();

      await sendQuoteAutoFollowUpEmail({
        quoteId: row.quoteId,
        businessName: row.businessName,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        quoteNumber: row.quoteNumber,
        title: row.title,
        publicQuoteUrl,
        attemptNumber,
        emailSignature: row.defaultEmailSignature,
        templateOverrides: hasFeatureAccess(plan, "emailTemplates")
          ? (row.quoteFollowUpTemplate as Parameters<
              typeof sendQuoteAutoFollowUpEmail
            >[0]["templateOverrides"])
          : null,
        replyToEmail: row.businessContactEmail ?? undefined,
        businessId: row.businessId,
      });

      await db
        .update(quotes)
        .set({
          autoFollowUpAttempts: attemptNumber,
          autoFollowUpLastSentAt: now,
          updatedAt: now,
        })
        .where(eq(quotes.id, row.quoteId));

      await db.insert(activityLogs).values({
        id: newEntityId(),
        businessId: row.businessId,
        quoteId: row.quoteId,
        type: "quote.auto_follow_up_sent",
        summary: `Auto follow-up ${attemptNumber} of ${row.autoFollowUpMaxAttempts} sent to ${row.customerEmail}.`,
        metadata: {
          attemptNumber,
          maxAttempts: row.autoFollowUpMaxAttempts,
          delayDays: row.autoFollowUpDelayDays,
        },
        createdAt: now,
        updatedAt: now,
      });

      budget.dailyRemaining -= 1;
      budget.monthlyRemaining -= 1;
      sent++;
    } catch (error) {
      console.error(
        `[auto-follow-ups] Failed to send auto follow-up for quote ${row.quoteId} (attempt ${attemptNumber})`,
        error,
      );
      errors++;
    }

    processed++;
  }

  return { processed, sent, skipped, errors };
}
