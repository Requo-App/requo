/**
 * scripts/backfill-pack-recipes.ts
 *
 * Verticalization migration strategy (step 5): seed v1 pack recipes from
 * code defaults for packed businesses that predate F-02.
 *
 * Additive and idempotent: only businesses WITH a pack assignment and
 * WITHOUT recipe rows are touched, and only new inactive…active v1 rows are
 * inserted. Unpacked (secondary) businesses evaluate against code defaults
 * read-only and are skipped. Existing rows are never modified.
 *
 * Run: npx tsx scripts/backfill-pack-recipes.ts
 * Requires: DATABASE_URL (or the standard app env).
 */
import "./load-env";

import { and, eq, isNotNull, isNull } from "drizzle-orm";

import { isBehaviorPackKey } from "../features/businesses/behavior-packs";
import { packRecipeDefaults } from "../features/businesses/pack-recipe-defaults";
import { db, dbConnection } from "../lib/db/client";
import {
  businessPackAssignments,
  businesses,
  packRecipes,
} from "../lib/db/schema";
import { packRecipeKinds } from "../lib/db/schema/pack-recipes";
import { newEntityId } from "../lib/ids";

const batchSize = 200;

async function main() {
  let seeded = 0;
  let skippedUnpacked = 0;

  while (true) {
    const missing = await db
      .select({
        businessId: businesses.id,
        pack: businessPackAssignments.pack,
      })
      .from(businesses)
      .leftJoin(
        businessPackAssignments,
        eq(businessPackAssignments.businessId, businesses.id),
      )
      .leftJoin(
        packRecipes,
        and(
          eq(packRecipes.businessId, businesses.id),
          eq(packRecipes.kind, "intake"),
        ),
      )
      .where(and(isNotNull(businessPackAssignments.pack), isNull(packRecipes.id)))
      .limit(batchSize);

    if (missing.length === 0) {
      break;
    }

    const now = new Date();

    for (const row of missing) {
      if (!isBehaviorPackKey(row.pack)) {
        skippedUnpacked += 1;
        continue;
      }

      await db.insert(packRecipes).values(
        packRecipeKinds.map((kind) => ({
          id: newEntityId(),
          businessId: row.businessId,
          pack: row.pack as string,
          kind,
          version: 1,
          active: true,
          config: { ...packRecipeDefaults[row.pack as keyof typeof packRecipeDefaults][kind] },
          effectiveAt: now,
          createdAt: now,
          updatedAt: now,
        })),
      );

      seeded += 1;
    }

    console.log(`Seeded recipes for ${seeded} businesses… (${skippedUnpacked} unpacked skipped)`);
  }

  console.log(
    `Done. ${seeded} businesses seeded, ${skippedUnpacked} unpacked skipped.`,
  );
}

main()
  .catch((error) => {
    console.error("Failed to backfill pack recipes.");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await dbConnection.end({ timeout: 5 });
  });
