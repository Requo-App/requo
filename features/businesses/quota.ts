import "server-only";

import { and, count, eq, isNull, sql } from "drizzle-orm";

import type { BusinessQuotaSnapshot } from "@/features/businesses/types";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { getUpgradePlan, planMeta, type PlanTier as plan } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import { businessSubscriptions } from "@/lib/db/schema/subscriptions";

type DatabaseClient =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const businessQuotaLockNamespace = 842_731_119;

export class BusinessQuotaExceededError extends Error {
  quota: BusinessQuotaSnapshot;

  constructor(quota: BusinessQuotaSnapshot) {
    super(getBusinessQuotaExceededMessage(quota));
    this.name = "BusinessQuotaExceededError";
    this.quota = quota;
  }
}

export function isBusinessQuotaExceededError(
  error: unknown,
): error is BusinessQuotaExceededError {
  return error instanceof BusinessQuotaExceededError;
}

export function getBusinessQuotaLimit(plan: plan) {
  return getUsageLimit(plan, "freeBusinessesPerOwner");
}

export async function getOwnedBusinessCountForUser(
  ownerUserId: string,
  client: DatabaseClient = db,
) {
  const [row] = await client
    .select({ value: count(businesses.id) })
    .from(businesses)
    .where(
      and(
        eq(businesses.ownerUserId, ownerUserId),
        isNull(businesses.deletedAt),
        isNull(businesses.archivedAt),
        isNull(businesses.lockedAt),
      ),
    );

  return Number(row?.value ?? 0);
}

export async function getBusinessQuotaForUser({
  ownerUserId,
  plan: planOverride,
  client = db,
}: {
  ownerUserId: string;
  /** Optional plan override. If not provided, resolves from account subscription. */
  plan?: plan;
  client?: DatabaseClient;
}): Promise<BusinessQuotaSnapshot> {
  const requestedPlan = planOverride ?? ("free" as const);
  const totalOwnedActive = await getOwnedBusinessCountForUser(
    ownerUserId,
    client,
  );

  // One active Free business per owner:
  // - An owner may always operate one business without a paid subscription.
  // - Every additional business must have its own paid subscription.
  // - A paid subscription never unlocks sibling businesses.
  //
  // Paid-ness is based on `business_subscriptions` status for the business.
  // Legacy owners with more than one active Free business keep access; the
  // `freeCount < limit` check below serves both the new and legacy policies.
  if (requestedPlan === "free") {
    const [paidRow] = await client
      .select({ value: count(businesses.id) })
      .from(businesses)
      .leftJoin(
        businessSubscriptions,
        eq(businessSubscriptions.businessId, businesses.id),
      )
      .where(
        and(
          eq(businesses.ownerUserId, ownerUserId),
          isNull(businesses.deletedAt),
          isNull(businesses.archivedAt),
          isNull(businesses.lockedAt),
          sql`(
            ${businessSubscriptions.status} in ('active','past_due')
            or (
              ${businessSubscriptions.status} = 'canceled'
              and ${businessSubscriptions.currentPeriodEnd} > now()
            )
          )`,
        ),
      );

    const paidCount = Number(paidRow?.value ?? 0);
    const freeCount = Math.max(0, totalOwnedActive - paidCount);

    const limit = getUsageLimit("free", "freeBusinessesPerOwner") ?? 1;
    const allowed = freeCount < limit;

    return {
      ownerUserId,
      plan: "free",
      current: freeCount,
      limit,
      allowed,
      upgradePlan: allowed ? null : getUpgradePlan("free"),
    };
  }

  // Paid plan creation is always allowed under the new rule.
  return {
    ownerUserId,
    plan: requestedPlan,
    current: totalOwnedActive,
    limit: null,
    allowed: true,
    upgradePlan: null,
  };
}

export function getBusinessQuotaExceededMessage(
  quota: BusinessQuotaSnapshot,
) {
  if (quota.plan !== "free") {
    return "Your plan can not create that business right now.";
  }

  const freeLimit = quota.limit ?? 1;
  const upgradeLabel = quota.upgradePlan ? planMeta[quota.upgradePlan].label : "Pro";

  return `Your Free plan supports ${freeLimit} free business${freeLimit === 1 ? "" : "es"}. You already have ${quota.current} free business${quota.current === 1 ? "" : "es"}. Archive a free business or upgrade to ${upgradeLabel} to create another.`;
}

async function lockBusinessQuotaForUser(
  tx: DatabaseClient,
  ownerUserId: string,
) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(${businessQuotaLockNamespace}, hashtext(${ownerUserId}))`,
  );
}

export async function assertBusinessQuotaAvailableForUser({
  tx,
  ownerUserId,
  plan,
}: {
  tx: DatabaseClient;
  ownerUserId: string;
  /** Optional plan override. If not provided, resolves from account subscription. */
  plan?: plan;
}) {
  await lockBusinessQuotaForUser(tx, ownerUserId);

  const quota = await getBusinessQuotaForUser({
    ownerUserId,
    plan,
    client: tx,
  });

  if (!quota.allowed) {
    throw new BusinessQuotaExceededError(quota);
  }

  return quota;
}
