import "server-only";

import { and, desc, eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { z } from "zod";

import {
  type BehaviorPackKey,
  isBehaviorPackKey,
} from "@/features/businesses/behavior-packs";
import {
  intakeBindingBehaviors,
  packRecipeDefaults,
} from "@/features/businesses/pack-recipe-defaults";
import type { BusinessMemberRole } from "@/lib/business-members";
import {
  canManageBusinessAdministration,
  canManageOperationalBusinessSettings,
} from "@/lib/business-members";
import { getBusinessPackCacheTags } from "@/lib/cache/business-tags";
import { db } from "@/lib/db/client";
import {
  businesses,
  packRecipes,
  type PackRecipe,
  type PackRecipeKind,
} from "@/lib/db/schema";
import { packRecipeKinds } from "@/lib/db/schema/pack-recipes";
import { newEntityId } from "@/lib/ids";
import { hasFeatureAccess } from "@/lib/plans";
import type { PlanTier } from "@/lib/plans/plans";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type RecipeSource = "code" | "db";

export type ActiveRecipeView = {
  source: RecipeSource;
  pack: BehaviorPackKey | null;
  kind: PackRecipeKind;
  version: number;
  config: Record<string, unknown>;
  active: boolean;
};

/**
 * Active recipe reader with code-default fallback (NULL-tolerant): unpacked
 * businesses and pre-migration rows without recipe rows evaluate against the
 * pack code defaults (or generic defaults when unpacked), never fail.
 */
export async function getActiveRecipeForBusiness(
  businessId: string,
  kind: PackRecipeKind,
  pack: BehaviorPackKey | null,
): Promise<ActiveRecipeView> {
  const [row] = await db
    .select()
    .from(packRecipes)
    .where(
      and(
        eq(packRecipes.businessId, businessId),
        eq(packRecipes.kind, kind),
        eq(packRecipes.active, true),
      ),
    )
    .limit(1);

  if (row && isBehaviorPackKey(row.pack)) {
    return {
      source: "db",
      pack: row.pack,
      kind,
      version: row.version,
      config: row.config,
      active: true,
    };
  }

  return {
    source: "code",
    pack,
    kind,
    version: 1,
    config: pack ? { ...packRecipeDefaults[pack][kind] } : {},
    active: true,
  };
}

export async function listRecipeVersionsForBusiness(
  businessId: string,
  kind: PackRecipeKind,
) {
  return db
    .select({
      id: packRecipes.id,
      pack: packRecipes.pack,
      version: packRecipes.version,
      active: packRecipes.active,
      effectiveAt: packRecipes.effectiveAt,
      createdAt: packRecipes.createdAt,
    })
    .from(packRecipes)
    .where(
      and(eq(packRecipes.businessId, businessId), eq(packRecipes.kind, kind)),
    )
    .orderBy(desc(packRecipes.version));
}

const executableContentPatterns = [
  "function(",
  "=>",
  "__proto__",
  "constructor",
  "process.",
  "require(",
  "SELECT ",
  "DROP ",
  "<script",
  "javascript:",
];

function assertRecipeConfigSafe(config: unknown) {
  let serialized: string;

  try {
    serialized = JSON.stringify(config) ?? "";
  } catch {
    throw new Error("Recipe config must be JSON-serializable.");
  }

  for (const pattern of executableContentPatterns) {
    if (serialized.includes(pattern)) {
      throw new Error(
        "Recipe config must contain data only — no code, SQL, or markup.",
      );
    }
  }
}

const intakeFieldSchema = z.object({
  label: z.string().trim().min(1).max(120),
  criticality: z.enum(["critical", "normal", "optional"]),
  behaviors: z.array(z.enum(intakeBindingBehaviors)),
});

const recipeConfigSchemas: Record<PackRecipeKind, z.ZodTypeAny> = {
  intake: z.object({
    version: z.literal(1),
    criticalFields: z.array(intakeFieldSchema).max(50),
  }).strict(),
  scope: z.object({
    version: z.literal(1),
    requiredKinds: z.array(z.string().min(1)).max(10),
    recommendedKinds: z.array(z.string().min(1)).max(10),
  }).strict(),
  approval: z.object({
    version: z.literal(1),
    recipes: z.record(
      z.string(),
      z.object({
        enabled: z.boolean(),
        expiryDays: z.number().int().min(1).max(90),
        reminderEveryDays: z.number().int().min(1).max(30),
        attestationRequired: z.boolean(),
      }),
    ),
  }).strict(),
  schedule: z.object({
    version: z.literal(1),
    structures: z.array(z.object({
      label: z.string().min(1).max(120),
      splits: z.array(z.object({
        category: z.string().min(1),
        percentBps: z.number().int().min(0).max(10000),
      })).min(1),
    })).max(10),
  }).strict(),
  ai_guidance: z.object({
    version: z.literal(1),
    terminology: z.array(z.string()).max(30),
    scopeRules: z.array(z.string()).max(30),
    completeness: z.array(z.string()).max(30),
    packageConcepts: z.array(z.string()).max(30),
    missingInfoGuidance: z.array(z.string()).max(30),
    criticalLabels: z.array(z.string()).max(30),
  }).strict(),
};

/**
 * Fail-closed recipe validation: unknown binding kinds refuse activation,
 * critical fields with unresolvable shape refuse activation. Anything else
 * is rejected by strict schemas.
 */
export function validateRecipeConfig(kind: PackRecipeKind, config: unknown) {
  assertRecipeConfigSafe(config);
  const parsed = recipeConfigSchemas[kind].safeParse(config);

  if (!parsed.success) {
    throw new Error("Recipe config failed validation and cannot activate.");
  }

  return parsed.data as Record<string, unknown>;
}

async function assertRecipeCustomizationAllowed(businessId: string) {
  const [business] = await db
    .select({ plan: businesses.plan })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business || !hasFeatureAccess(business.plan as PlanTier, "customWorkflowRecipes")) {
    throw new Error("Recipe customization requires a Pro plan or higher.");
  }
}

/**
 * Seed v1 recipes from code defaults. Packed businesses only — unpacked
 * businesses evaluate against code defaults read-only (NULL-tolerant).
 */
export async function seedRecipesForBusiness(
  tx: DatabaseTransaction,
  input: { businessId: string; pack: BehaviorPackKey; now?: Date },
) {
  const now = input.now ?? new Date();

  await tx.insert(packRecipes).values(
    packRecipeKinds.map((kind) => ({
      id: newEntityId(),
      businessId: input.businessId,
      pack: input.pack,
      kind,
      version: 1,
      active: true,
      config: { ...packRecipeDefaults[input.pack][kind] },
      effectiveAt: now,
      createdAt: now,
      updatedAt: now,
    })),
  );
}

/** Manager+: draft a new inactive recipe version. Pro-gated (depth). */
export async function createRecipeVersionForBusiness(input: {
  businessId: string;
  pack: BehaviorPackKey;
  kind: PackRecipeKind;
  config: unknown;
  actorRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!canManageOperationalBusinessSettings(input.actorRole)) {
    throw new Error("Only an owner or manager can edit recipes.");
  }

  await assertRecipeCustomizationAllowed(input.businessId);
  const config = validateRecipeConfig(input.kind, input.config);
  const now = input.now ?? new Date();

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ version: packRecipes.version })
      .from(packRecipes)
      .where(
        and(
          eq(packRecipes.businessId, input.businessId),
          eq(packRecipes.kind, input.kind),
        ),
      )
      .orderBy(desc(packRecipes.version))
      .limit(1);

    const version = (existing[0]?.version ?? 0) + 1;

    const [row] = await tx
      .insert(packRecipes)
      .values({
        id: newEntityId(),
        businessId: input.businessId,
        pack: input.pack,
        kind: input.kind,
        version,
        active: false,
        config,
        effectiveAt: now,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: packRecipes.id, version: packRecipes.version });

    return row;
  });
}

/**
 * Owner-only transactional activation. Referenced rows are never mutated:
 * activation flips active flags only, and previously referenced versions
 * stay intact for pinned history.
 */
export async function activateRecipeVersionForBusiness(input: {
  businessId: string;
  kind: PackRecipeKind;
  version: number;
  actorRole: BusinessMemberRole;
  now?: Date;
}) {
  if (!canManageBusinessAdministration(input.actorRole)) {
    throw new Error("Only the business owner can activate recipes.");
  }

  await assertRecipeCustomizationAllowed(input.businessId);

  const [candidate] = await db
    .select()
    .from(packRecipes)
    .where(
      and(
        eq(packRecipes.businessId, input.businessId),
        eq(packRecipes.kind, input.kind),
        eq(packRecipes.version, input.version),
      ),
    )
    .limit(1);

  if (!candidate) {
    throw new Error("Recipe version not found.");
  }

  // Re-validate at activation so a version that became invalid (e.g. unknown
  // binding kind) can never activate — fail closed.
  validateRecipeConfig(input.kind, candidate.config);

  const now = input.now ?? new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(packRecipes)
      .set({ active: false, updatedAt: now })
      .where(
        and(
          eq(packRecipes.businessId, input.businessId),
          eq(packRecipes.kind, input.kind),
          eq(packRecipes.active, true),
        ),
      );

    await tx
      .update(packRecipes)
      .set({ active: true, effectiveAt: now, updatedAt: now })
      .where(eq(packRecipes.id, candidate.id));
  });

  for (const tag of getBusinessPackCacheTags(input.businessId)) {
    revalidateTag(tag, "max");
  }
}

export type { PackRecipe };
export { packRecipeKinds };
