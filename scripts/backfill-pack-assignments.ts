/**
 * scripts/backfill-pack-assignments.ts
 *
 * Verticalization migration strategy (step 4): seed behavior-pack
 * assignments for businesses created before F-01, deriving each pack from
 * the stored business type via the single resolver choke point.
 *
 * Additive and idempotent: only businesses WITHOUT an assignment row are
 * touched, and only new assignment + history rows are inserted. Stored
 * types, forms, quotes, invoices, and snapshots are never modified.
 *
 * Run: npx tsx scripts/backfill-pack-assignments.ts
 * Requires: DATABASE_URL (or the standard app env).
 */
import "./load-env";

import { eq, isNull } from "drizzle-orm";

import {
  BEHAVIOR_PACK_VERSION,
  getBehaviorPack,
} from "../features/businesses/behavior-packs";
import { db, dbConnection } from "../lib/db/client";
import {
  businessPackAssignmentHistory,
  businessPackAssignments,
  businesses,
} from "../lib/db/schema";
import { newEntityId } from "../lib/ids";

const batchSize = 500;

async function main() {
  let seeded = 0;
  let unpacked = 0;

  while (true) {
    const missing = await db
      .select({ id: businesses.id, businessType: businesses.businessType })
      .from(businesses)
      .leftJoin(
        businessPackAssignments,
        eq(businessPackAssignments.businessId, businesses.id),
      )
      .where(isNull(businessPackAssignments.id))
      .limit(batchSize);

    if (missing.length === 0) {
      break;
    }

    const now = new Date();

    await db.transaction(async (tx) => {
      await tx.insert(businessPackAssignments).values(
        missing.map((business) => ({
          id: newEntityId(),
          businessId: business.id,
          pack: getBehaviorPack(business.businessType),
          packVersion: BEHAVIOR_PACK_VERSION,
          source: "seed" as const,
          createdAt: now,
          updatedAt: now,
        })),
      );

      await tx.insert(businessPackAssignmentHistory).values(
        missing.map((business) => ({
          id: newEntityId(),
          businessId: business.id,
          pack: getBehaviorPack(business.businessType),
          packVersion: BEHAVIOR_PACK_VERSION,
          source: "seed" as const,
          actorUserId: null,
          createdAt: now,
        })),
      );
    });

    for (const business of missing) {
      if (getBehaviorPack(business.businessType) === null) {
        unpacked += 1;
      }
    }

    seeded += missing.length;
    console.log(`Seeded ${seeded} pack assignments…`);
  }

  console.log(
    `Done. ${seeded} businesses seeded (${unpacked} unpacked secondary/legacy).`,
  );
}

main()
  .catch((error) => {
    console.error("Failed to backfill pack assignments.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbConnection.end({ timeout: 5 });
  });
