import "server-only";

import { and, eq, isNotNull, isNull, lt, or } from "drizzle-orm";

import {
  expireSubscription,
  PAST_DUE_GRACE_MS,
} from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import { businessSubscriptions } from "@/lib/db/schema/subscriptions";

export type ExpireSubscriptionsSummary = {
  processed: number;
  succeeded: number;
  failed: number;
  errors?: string[];
};

export async function processExpiredSubscriptions(): Promise<ExpireSubscriptionsSummary> {
  const now = new Date();
  let succeeded = 0;
  let failed = 0;
  const errors: string[] = [];

  const pastDueCutoff = new Date(now.getTime() - PAST_DUE_GRACE_MS);

  const stale = await db
    .select({
      id: businessSubscriptions.id,
      businessId: businessSubscriptions.businessId,
      status: businessSubscriptions.status,
      currentPeriodEnd: businessSubscriptions.currentPeriodEnd,
      trialEndsAt: businessSubscriptions.trialEndsAt,
    })
    .from(businessSubscriptions)
    .where(
      or(
        and(
          eq(businessSubscriptions.status, "canceled"),
          isNotNull(businessSubscriptions.currentPeriodEnd),
          lt(businessSubscriptions.currentPeriodEnd, now),
        ),
        and(
          eq(businessSubscriptions.status, "past_due"),
          or(
            isNull(businessSubscriptions.currentPeriodEnd),
            lt(businessSubscriptions.currentPeriodEnd, pastDueCutoff),
          ),
        ),
        and(
          eq(businessSubscriptions.status, "trialing"),
          isNotNull(businessSubscriptions.trialEndsAt),
          lt(businessSubscriptions.trialEndsAt, now),
        ),
      ),
    );

  for (const row of stale) {
    try {
      const isTrialExpiry = row.status === "trialing";

      await expireSubscription(row.businessId, undefined, {
        status: row.status,
        currentPeriodEndBefore: isTrialExpiry
          ? undefined
          : row.status === "past_due"
            ? pastDueCutoff
            : now,
        trialEndsAtBefore: isTrialExpiry ? now : undefined,
      });
      succeeded++;
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`${row.businessId}: ${message}`);
      console.error(
        `[expire-subscriptions] Failed to expire subscription for business ${row.businessId}:`,
        error,
      );
    }
  }

  return {
    processed: stale.length,
    succeeded,
    failed,
    ...(errors.length > 0 ? { errors: errors.slice(0, 10) } : {}),
  };
}
