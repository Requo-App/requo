import "server-only";

import { and, count, eq, isNull, ne, sql } from "drizzle-orm";

import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { db } from "@/lib/db/client";
import { services } from "@/lib/db/schema";
import type { PlanTier } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";

type DatabaseClient =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Advisory-lock namespace for the live-service limit. Kept distinct from the
 * business plan-enforcement namespace so the two locks never contend.
 */
const serviceLimitLockNamespace = 1_928_406_517;

/**
 * Resolves the plan that actually governs a business's entitlements.
 *
 * The `businesses.plan` column is a denormalized read cache of the
 * subscription row; the authoritative plan comes from the subscription.
 */
export async function resolveServicePlan(
  businessId: string,
): Promise<PlanTier> {
  return getEffectivePlanForBusiness(businessId);
}

/**
 * Serializes live-service limit checks for one business so a concurrent
 * create/publish cannot read a stale count and exceed the plan limit.
 */
export async function lockServiceLimitEnforcement(
  client: DatabaseClient,
  businessId: string,
) {
  await client.execute(
    sql`select pg_advisory_xact_lock(${serviceLimitLockNamespace}, hashtext(${businessId}))`,
  );
}

/**
 * Counts the live (published, non-archived) services of a business, optionally
 * excluding one service (the one being published/edited).
 */
export async function countLiveServices(
  client: DatabaseClient,
  businessId: string,
  excludeServiceId?: string,
): Promise<number> {
  const [row] = await client
    .select({ value: count() })
    .from(services)
    .where(
      and(
        eq(services.businessId, businessId),
        eq(services.publicInquiryEnabled, true),
        isNull(services.archivedAt),
        excludeServiceId
          ? ne(services.id, excludeServiceId)
          : undefined,
      ),
    );

  return Number(row?.value ?? 0);
}

/**
 * Returns `true` when the business still has a free live-service slot for the
 * given plan.
 *
 * Call this inside the same transaction as the write, after taking
 * {@link lockServiceLimitEnforcement}, so the count and the write observe the
 * same snapshot.
 */
export async function hasLiveServiceSlot(
  client: DatabaseClient,
  businessId: string,
  plan: PlanTier,
  excludeServiceId?: string,
): Promise<boolean> {
  const limit = getUsageLimit(plan, "liveServicesPerBusiness");

  if (limit === null) {
    return true;
  }

  const current = await countLiveServices(client, businessId, excludeServiceId);

  return current < limit;
}

/**
 * Detects a Postgres unique-violation so a slug race can be retried with a
 * different candidate instead of surfacing as a generic failure.
 */
export function isUniqueViolation(error: unknown): boolean {
  let current = error;

  for (let depth = 0; depth < 5; depth += 1) {
    if (typeof current !== "object" || current === null) {
      return false;
    }

    const candidate = current as { code?: unknown; cause?: unknown };

    if (candidate.code === "23505") {
      return true;
    }

    current = candidate.cause;
  }

  return false;
}
