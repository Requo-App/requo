import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

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
 *
 * Shared with `features/settings/service-limits.ts`: publishing a service and
 * lowering the plan limit must serialize on the same count.
 */
const liveServiceLimitLockNamespace = 1_928_406_517;

/** Serializes live-service limit checks for one business. */
export async function lockLiveServiceLimit(
  client: DatabaseClient,
  businessId: string,
) {
  await client.execute(
    sql`select pg_advisory_xact_lock(${liveServiceLimitLockNamespace}, hashtext(${businessId}))`,
  );
}

/**
 * Disables public inquiry for live services above the plan's allowance.
 *
 * Called from the subscription writers when a status change lowers the
 * effective plan (trial expiry, downgrade, pause, or revocation). The default
 * service and the oldest services stay live so the business keeps its primary
 * public entry point; excess services stay in the dashboard and can be
 * republished after an upgrade.
 *
 * Runs on the caller's transaction so the plan write and the enforcement are
 * atomic. Returns the number of services moved offline.
 */
export async function enforceLiveServiceLimit(
  client: DatabaseClient,
  businessId: string,
  plan: PlanTier,
): Promise<number> {
  const limit = getUsageLimit(plan, "liveServicesPerBusiness");

  if (limit === null) {
    return 0;
  }

  await lockLiveServiceLimit(client, businessId);

  const liveServices = await client
    .select({ id: services.id })
    .from(services)
    .where(
      and(
        eq(services.businessId, businessId),
        eq(services.publicInquiryEnabled, true),
        isNull(services.archivedAt),
      ),
    )
    .orderBy(
      desc(services.isDefault),
      asc(services.createdAt),
      asc(services.id),
    );

  const overflowIds = liveServices.slice(limit).map((service) => service.id);

  if (overflowIds.length === 0) {
    return 0;
  }

  await client
    .update(services)
    .set({ publicInquiryEnabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(services.businessId, businessId),
        inArray(services.id, overflowIds),
      ),
    );

  return overflowIds.length;
}
