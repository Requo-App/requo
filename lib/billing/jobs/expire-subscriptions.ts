import "server-only";

import { and, eq, isNotNull, lt } from "drizzle-orm";

import { expireSubscription } from "@/lib/billing/subscription-service";
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

  const stale = await db
    .select({
      id: businessSubscriptions.id,
      businessId: businessSubscriptions.businessId,
      currentPeriodEnd: businessSubscriptions.currentPeriodEnd,
    })
    .from(businessSubscriptions)
    .where(
      and(
        eq(businessSubscriptions.status, "canceled"),
        isNotNull(businessSubscriptions.currentPeriodEnd),
        lt(businessSubscriptions.currentPeriodEnd, now),
      ),
    );

  for (const row of stale) {
    try {
      await expireSubscription(row.businessId);
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
