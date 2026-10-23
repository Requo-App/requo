import { sql, type SQL } from "drizzle-orm";

import { PAST_DUE_GRACE_DAYS } from "@/lib/billing/subscription-service";
import { businessSubscriptions } from "@/lib/db/schema/subscriptions";

/**
 * SQL predicate matching `resolveEffectivePlanFromSubscription` for paid
 * access.
 *
 * Keep this in sync with the TypeScript resolver. It exists because several
 * quota/enforcement paths filter subscriptions in SQL rather than loading the
 * row, and those paths must apply the same past-due grace window.
 *
 * `trialing` is intentionally excluded: this predicate answers "paid
 * subscription", while a local trial still occupies the owner's one free
 * business slot.
 */
export function hasPaidBusinessSubscriptionSql(): SQL {
  const graceInterval = sql.raw(
    `interval '${String(PAST_DUE_GRACE_DAYS)} days'`,
  );

  return sql`(
    ${businessSubscriptions.status} = 'active'
    or (
      ${businessSubscriptions.status} = 'past_due'
      and ${businessSubscriptions.currentPeriodEnd} is not null
      and ${businessSubscriptions.currentPeriodEnd} + ${graceInterval} > now()
    )
    or (
      ${businessSubscriptions.status} = 'canceled'
      and ${businessSubscriptions.currentPeriodEnd} > now()
    )
  )`;
}
