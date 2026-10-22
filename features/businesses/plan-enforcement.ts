import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { businesses, userRecentBusinesses } from "@/lib/db/schema";
import { businessSubscriptions } from "@/lib/db/schema/subscriptions";
import type { PlanTier } from "@/lib/plans/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";

type DatabaseClient =
  | typeof db
  | Parameters<Parameters<typeof db.transaction>[0]>[0];

const planEnforcementLockNamespace = 712_445_913;

type ActiveBusinessSummary = {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  lastOpenedAt: Date | null;
};

/**
 * The only business-count limit is the one-Free-business-per-owner rule.
 * Paid plans never cap the number of businesses an owner can operate.
 */
function getActiveBusinessLimit(plan: PlanTier) {
  return getUsageLimit(plan, "freeBusinessesPerOwner");
}

function getActiveBusinessCondition(ownerUserId: string) {
  return and(
    eq(businesses.ownerUserId, ownerUserId),
    isNull(businesses.deletedAt),
    isNull(businesses.archivedAt),
    isNull(businesses.lockedAt),
  );
}

async function lockPlanEnforcementForUser(
  client: DatabaseClient,
  ownerUserId: string,
) {
  await client.execute(
    sql`select pg_advisory_xact_lock(${planEnforcementLockNamespace}, hashtext(${ownerUserId}))`,
  );
}

export async function listActiveBusinessesForOwner(
  ownerUserId: string,
  client: DatabaseClient = db,
): Promise<ActiveBusinessSummary[]> {
  const rows = await client
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      createdAt: businesses.createdAt,
      updatedAt: businesses.updatedAt,
    })
    .from(businesses)
    .where(getActiveBusinessCondition(ownerUserId))
    .orderBy(
      desc(businesses.updatedAt),
      desc(businesses.createdAt),
      asc(businesses.name),
    );

  if (rows.length === 0) {
    return [];
  }

  const recentRows = await client
    .select({
      businessId: userRecentBusinesses.businessId,
      lastOpenedAt: userRecentBusinesses.lastOpenedAt,
    })
    .from(userRecentBusinesses)
    .where(
      and(
        eq(userRecentBusinesses.userId, ownerUserId),
        inArray(
          userRecentBusinesses.businessId,
          rows.map((business) => business.id),
        ),
      ),
    );

  const recentMap = new Map(
    recentRows.map((row) => [row.businessId, row.lastOpenedAt]),
  );

  return rows
    .map((business) => ({
      ...business,
      lastOpenedAt: recentMap.get(business.id) ?? null,
    }))
    .sort((a, b) => {
      const aTime = a.lastOpenedAt?.getTime() ?? 0;
      const bTime = b.lastOpenedAt?.getTime() ?? 0;

      if (aTime !== bTime) {
        return bTime - aTime;
      }

      return b.updatedAt.getTime() - a.updatedAt.getTime();
    });
}

/**
 * Lists the owner's active businesses that are operating without a paid
 * subscription (free businesses). Used by the downgrade preview to identify
 * the free businesses that must be archived before another business can
 * downgrade to Free.
 */
export async function listActiveFreeBusinessesForOwner(
  ownerUserId: string,
  client: DatabaseClient = db,
): Promise<ActiveBusinessSummary[]> {
  const activeBusinesses = await listActiveBusinessesForOwner(ownerUserId, client);

  if (activeBusinesses.length === 0) {
    return [];
  }

  const paidRows = await client
    .select({ id: businesses.id })
    .from(businesses)
    .leftJoin(
      businessSubscriptions,
      eq(businessSubscriptions.businessId, businesses.id),
    )
    .where(
      and(
        eq(businesses.ownerUserId, ownerUserId),
        inArray(
          businesses.id,
          activeBusinesses.map((business) => business.id),
        ),
        sql`(
          ${businessSubscriptions.status} in ('active','past_due')
          or (
            ${businessSubscriptions.status} = 'canceled'
            and ${businessSubscriptions.currentPeriodEnd} > now()
          )
        )`,
      ),
    );

  const paidIds = new Set(paidRows.map((row) => row.id));

  return activeBusinesses.filter((business) => !paidIds.has(business.id));
}

export async function listLockCandidatesForDowngrade({
  ownerUserId,
  targetPlan,
  client = db,
}: {
  ownerUserId: string;
  targetPlan: PlanTier;
  client?: DatabaseClient;
}) {
  const activeBusinessLimit = getActiveBusinessLimit(targetPlan);

  if (targetPlan !== "free" || activeBusinessLimit === null) {
    return {
      activeBusinessLimit,
      activeBusinesses: [] as ActiveBusinessSummary[],
      requiresSelection: false,
    };
  }

  // Downgrading to Free is allowed only when the owner has no other active
  // Free business. The preview lists those businesses so the user can choose
  // to archive them (from the businesses hub) or not downgrade.
  // Legacy owners with multiple Free businesses keep access; the rule only
  // applies to new downgrades and new Free business creation.
  const freeBusinesses = await listActiveFreeBusinessesForOwner(
    ownerUserId,
    client,
  );

  return {
    activeBusinessLimit,
    activeBusinesses: freeBusinesses,
    requiresSelection: freeBusinesses.length >= activeBusinessLimit,
  };
}

export async function unlockBusinessIfAllowed({
  businessId,
  ownerUserId,
  actorUserId = null,
  client = db,
}: {
  businessId: string;
  ownerUserId: string;
  actorUserId?: string | null;
  client?: DatabaseClient;
}) {
  // A business with its own paid subscription can always be unlocked.
  const [paidRow] = await client
    .select({ id: businessSubscriptions.businessId })
    .from(businessSubscriptions)
    .where(
      and(
        eq(businessSubscriptions.businessId, businessId),
        sql`(
          ${businessSubscriptions.status} in ('active','past_due')
          or (
            ${businessSubscriptions.status} = 'canceled'
            and ${businessSubscriptions.currentPeriodEnd} > now()
          )
        )`,
      ),
    )
    .limit(1);

  if (!paidRow) {
    // Free business: unlocking it consumes the owner's one Free slot.
    // The locked business is not active, so any other active Free business
    // already occupies the slot.
    const freeBusinesses = await listActiveFreeBusinessesForOwner(
      ownerUserId,
      client,
    );

    if (freeBusinesses.length >= 1) {
      return {
        ok: false as const,
        reason: "active_business_limit_reached" as const,
      };
    }
  }

  const now = new Date();
  const [updatedBusiness] = await client
    .update(businesses)
    .set({
      lockedAt: null,
      lockedBy: null,
      lockedReason: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(businesses.id, businessId),
        eq(businesses.ownerUserId, ownerUserId),
        isNull(businesses.deletedAt),
        isNull(businesses.archivedAt),
      ),
    )
    .returning({
      id: businesses.id,
    });

  if (!updatedBusiness) {
    return {
      ok: false as const,
      reason: "not_found" as const,
    };
  }

  return {
    ok: true as const,
    businessId: updatedBusiness.id,
    actorUserId,
  };
}

/**
 * Enforces the one-Free-business-per-owner rule on a plan change.
 *
 * A downgrade to Free is allowed only when the owner has no other active
 * Free business. Nothing is locked automatically — the downgrade flow must
 * guide the owner to archive a Free business first (from the businesses hub)
 * or keep the paid plan. Paid target plans are never restricted.
 *
 * Returns the ids of the active Free businesses blocking the downgrade.
 */
export async function enforceActiveBusinessLimitOnPlanChange({
  ownerUserId,
  newPlan,
  keepBusinessId = null,
  actorUserId = null,
  client,
}: {
  ownerUserId: string;
  newPlan: PlanTier;
  keepBusinessId?: string | null;
  actorUserId?: string | null;
  client?: DatabaseClient;
}) {
  void actorUserId;

  const runEnforcement = async (tx: DatabaseClient) => {
    await lockPlanEnforcementForUser(tx, ownerUserId);

    const activeBusinessLimit = getActiveBusinessLimit(newPlan);

    if (newPlan !== "free" || activeBusinessLimit === null) {
      return {
        activeBusinessLimit,
        keptBusinessId: keepBusinessId ?? null,
        lockedBusinessIds: [] as string[],
        blockingFreeBusinessIds: [] as string[],
      };
    }

    const freeBusinesses = await listActiveFreeBusinessesForOwner(
      ownerUserId,
      tx,
    );
    const blockers = freeBusinesses.filter(
      (business) => business.id !== keepBusinessId,
    );

    return {
      activeBusinessLimit,
      keptBusinessId: keepBusinessId ?? null,
      lockedBusinessIds: [] as string[],
      blockingFreeBusinessIds: blockers.map((business) => business.id),
    };
  };

  if (client) {
    return runEnforcement(client);
  }

  return db.transaction(async (tx) => runEnforcement(tx));
}

