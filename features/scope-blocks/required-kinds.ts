import "server-only";

import { eq } from "drizzle-orm";

import {
  getBehaviorPack,
  type BehaviorPackKey,
} from "@/features/businesses/behavior-packs";
import { getPackAssignmentForBusiness } from "@/features/businesses/pack-assignments";
import {
  getActiveRecipeForBusiness,
  type ActiveRecipeView,
} from "@/features/businesses/pack-recipes";
import { normalizeBusinessType } from "@/features/inquiries/business-types";
import { isScopeBlockKind } from "@/features/scope-blocks/schemas";
import { db } from "@/lib/db/client";
import { businesses, type ScopeBlockKind } from "@/lib/db/schema";

export function parseRequiredScopeKinds(
  config: Record<string, unknown>,
): ScopeBlockKind[] {
  const raw = config["requiredKinds"];

  if (!Array.isArray(raw)) return [];

  return raw.filter(isScopeBlockKind);
}

export type ActiveScopeRecipe = {
  pack: BehaviorPackKey | null;
  recipe: ActiveRecipeView;
  requiredKinds: ScopeBlockKind[];
};

/**
 * The single required-kinds resolver shared by the owner editor, the send
 * gate, and write-time requiredness stamping.
 *
 * A business with no pack assignment — legacy or directly seeded — falls back
 * to the code pack for its business type, exactly like the editor. Without
 * this fallback, scope rows would be stamped `required = false` while the
 * editor still rendered them as required, so the gate could be bypassed.
 */
export async function resolveActiveScopeRecipe(input: {
  businessId: string;
  /** Optional pre-resolved type, to avoid a lookup on surfaces that have it. */
  businessType?: unknown;
}): Promise<ActiveScopeRecipe> {
  const assignment = await getPackAssignmentForBusiness(input.businessId);
  let pack = assignment?.pack ?? null;

  if (!pack) {
    let businessType = input.businessType;

    if (businessType === undefined) {
      const [business] = await db
        .select({ businessType: businesses.businessType })
        .from(businesses)
        .where(eq(businesses.id, input.businessId))
        .limit(1);

      businessType = business?.businessType;
    }

    pack = getBehaviorPack(normalizeBusinessType(businessType));
  }

  const recipe = await getActiveRecipeForBusiness(
    input.businessId,
    "scope",
    pack,
  );

  return {
    pack,
    recipe,
    requiredKinds: parseRequiredScopeKinds(recipe.config),
  };
}

export async function resolveRequiredScopeKinds(input: {
  businessId: string;
  businessType?: unknown;
}): Promise<ScopeBlockKind[]> {
  return (await resolveActiveScopeRecipe(input)).requiredKinds;
}
