import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import {
  getBehaviorPack,
  type BehaviorPackKey,
} from "@/features/businesses/behavior-packs";
import {
  normalizeBusinessType,
  type BusinessType,
} from "@/features/inquiries/business-types";
import {
  type IntakeBindingBehavior,
  intakeBindingBehaviors,
} from "@/features/businesses/pack-recipe-defaults";
import { getActiveRecipeForBusiness } from "@/features/businesses/pack-recipes";
import { getRecipeCriticalFieldIdForLabel } from "@/features/inquiries/form-config";
import { db } from "@/lib/db/client";
import { businesses, inquiries } from "@/lib/db/schema";
import type { PackRecipeKind } from "@/lib/db/schema/pack-recipes";

export type ReadinessEvaluation = {
  ready: boolean;
  pack: BehaviorPackKey | null;
  recipeVersion: number;
  recipeSource: "code" | "db";
  /** Critical blockers. Empty when ready. */
  blockedReasons: string[];
  /** Non-blocking notes (e.g. skipped optional references). */
  warnings: string[];
};

export type CriticalIntakeFieldDefinition = {
  label: string;
  normalizedLabel: string;
  criticality: string;
  behaviors: unknown[];
};

export type CriticalIntakeGap = {
  /** Existing snapshot field id, or the stable recipe-derived input id. */
  fieldId: string;
  label: string;
  reason: "missing" | "empty";
};

async function loadCriticalIntakeFields(input: {
  businessId: string;
  businessType: BusinessType;
}): Promise<CriticalIntakeFieldDefinition[] | null> {
  const pack = getBehaviorPack(input.businessType);
  if (!pack) return [];

  const recipe = await getActiveRecipeForBusiness(
    input.businessId,
    "intake" satisfies PackRecipeKind,
    pack,
  );

  return extractCriticalFields(recipe.config);
}

export async function getCriticalIntakeFieldLabelsForBusiness(input: {
  businessId: string;
  businessType: BusinessType;
}): Promise<string[]> {
  const fields = await loadCriticalIntakeFields(input);

  return (fields ?? [])
    .filter((field) => field.criticality === "critical")
    .map((field) => field.label);
}

/**
 * Critical questions this inquiry cannot answer from its submitted snapshot.
 * Read-only projection of the same resolver the send gate uses; the owner UI
 * uses it to collect historical values without weakening the server checks.
 */
export async function listCriticalIntakeGaps(input: {
  businessId: string;
  inquiryId: string;
}): Promise<CriticalIntakeGap[]> {
  const [business] = await db
    .select({ businessType: businesses.businessType })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business) return [];

  const fields = await loadCriticalIntakeFields({
    businessId: input.businessId,
    businessType: normalizeBusinessType(business.businessType),
  });

  if (!fields) return [];

  const [inquiry] = await db
    .select({ submittedFieldSnapshot: inquiries.submittedFieldSnapshot })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.id, input.inquiryId),
        eq(inquiries.businessId, input.businessId),
        isNull(inquiries.deletedAt),
      ),
    )
    .limit(1);

  if (!inquiry) return [];

  const snapshotFields = inquiry.submittedFieldSnapshot?.fields ?? [];
  const gaps: CriticalIntakeGap[] = [];

  for (const field of fields) {
    if (field.criticality !== "critical") continue;

    const submittedField = resolveSubmittedField(snapshotFields, field);

    if (!submittedField) {
      gaps.push({
        fieldId: getRecipeCriticalFieldIdForLabel(field.label),
        label: field.label,
        reason: "missing",
      });
    } else if (!isValuePresent(submittedField.value)) {
      gaps.push({
        fieldId: submittedField.id,
        label: field.label,
        reason: "empty",
      });
    }
  }

  return gaps;
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase();
}

function isValuePresent(value: string | string[] | boolean | null) {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some((entry) => String(entry).trim().length > 0);
  return String(value).trim().length > 0;
}

/**
 * The standard inquiry `details` field is the canonical project brief on both
 * the public form and the owner's quick-add form. Older form labels such as
 * "What do you need help with?" do not necessarily match a pack's "Project
 * details" recipe label, so use the stable system field key as a fallback when
 * there is no exact label match.
 */
const projectDetailsFieldLabels = new Set([
  "project details",
  "project brief",
  "challenge or goal",
]);

function resolveSubmittedField(
  fields: Array<{
    id: string;
    label: string;
    value: string | string[] | boolean | null;
  }>,
  field: CriticalIntakeFieldDefinition,
) {
  const exact = fields.find(
    (entry) => normalizeLabel(entry.label) === field.normalizedLabel,
  );

  if (exact) return exact;

  if (projectDetailsFieldLabels.has(field.normalizedLabel)) {
    return fields.find((entry) => entry.id === "details");
  }

  return undefined;
}

function isKnownBehavior(value: unknown): value is IntakeBindingBehavior {
  return (
    typeof value === "string" &&
    (intakeBindingBehaviors as readonly string[]).includes(value)
  );
}

/**
 * P4 readiness evaluation (single evaluator — bindings map (field,
 * behavior-kind) to existing code paths but never execute logic).
 *
 * Closed vocabulary, fail-closed:
 * - unknown binding kinds on any field refuse the recipe version at
 *   activation (see pack-recipes validation) and block here as defense in
 *   depth;
 * - unknown/invalid references on optional fields are skipped with warning;
 * - unknown or invalid references on critical fields block readiness, so a
 *   deleted critical field can never make a record look quote-ready.
 *
 * NULL-tolerant: unpacked businesses and missing inquiries evaluate ready
 * with no pinned context (legacy behavior preserved).
 */
export async function evaluateIntakeReadiness(input: {
  businessId: string;
  inquiryId: string | null;
}): Promise<ReadinessEvaluation> {
  const [business] = await db
    .select({ businessType: businesses.businessType })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!business) {
    return {
      ready: false,
      pack: null,
      recipeVersion: 1,
      recipeSource: "code",
      blockedReasons: ["Business not found."],
      warnings: [],
    };
  }

  const { getBehaviorPack } = await import(
    "@/features/businesses/behavior-packs"
  );
  const pack = getBehaviorPack(business.businessType);

  if (!pack || !input.inquiryId) {
    return {
      ready: true,
      pack,
      recipeVersion: 1,
      recipeSource: "code",
      blockedReasons: [],
      warnings: [],
    };
  }

  const recipe = await getActiveRecipeForBusiness(
    input.businessId,
    "intake" satisfies PackRecipeKind,
    pack,
  );

  const fields = extractCriticalFields(recipe.config);

  if (!fields) {
    return {
      ready: false,
      pack: recipe.pack,
      recipeVersion: recipe.version,
      recipeSource: recipe.source,
      blockedReasons: ["Intake recipe is unreadable; failing closed."],
      warnings: [],
    };
  }

  const [inquiry] = await db
    .select({
      submittedFieldSnapshot: inquiries.submittedFieldSnapshot,
    })
    .from(inquiries)
    .where(
      and(
        eq(inquiries.id, input.inquiryId),
        eq(inquiries.businessId, input.businessId),
      ),
    )
    .limit(1);

  if (!inquiry) {
    return {
      ready: true,
      pack: recipe.pack,
      recipeVersion: recipe.version,
      recipeSource: recipe.source,
      blockedReasons: [],
      warnings: [],
    };
  }

  const snapshotFields = inquiry.submittedFieldSnapshot?.fields ?? [];
  const blockedReasons: string[] = [];
  const warnings: string[] = [];

  for (const field of fields) {
    for (const behavior of field.behaviors) {
      if (!isKnownBehavior(behavior)) {
        // Unknown binding kinds fail closed regardless of criticality.
        blockedReasons.push(
          `Unknown intake binding "${String(behavior)}" on "${field.label}"; failing closed.`,
        );
      }
    }

    const submittedField = resolveSubmittedField(snapshotFields, field);

    if (!submittedField) {
      if (field.criticality === "critical") {
        blockedReasons.push(
          `Critical intake field "${field.label}" is not present on this inquiry; failing closed.`,
        );
      } else if (field.criticality === "normal") {
        warnings.push(`Intake field "${field.label}" is not present; skipped.`);
      }

      continue;
    }

    if (
      field.criticality === "critical" &&
      !isValuePresent(submittedField.value)
    ) {
      blockedReasons.push(`Critical intake field "${field.label}" is empty.`);
    }
  }

  return {
    ready: blockedReasons.length === 0,
    pack: recipe.pack,
    recipeVersion: recipe.version,
    recipeSource: recipe.source,
    blockedReasons,
    warnings,
  };
}

function extractCriticalFields(config: Record<string, unknown>) {
  const raw = config["criticalFields"];

  if (!Array.isArray(raw)) return null;

  const fields: Array<{
    label: string;
    normalizedLabel: string;
    criticality: string;
    behaviors: unknown[];
  }> = [];

  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) return null;
    const record = entry as Record<string, unknown>;

    if (typeof record["label"] !== "string") return null;
    const behaviors = Array.isArray(record["behaviors"]) ? record["behaviors"] : [];

    fields.push({
      label: record["label"],
      normalizedLabel: normalizeLabel(record["label"]),
      criticality: typeof record["criticality"] === "string" ? record["criticality"] : "optional",
      behaviors,
    });
  }

  return fields;
}

export { intakeBindingBehaviors };
export type { IntakeBindingBehavior };

const packFollowUpHints: Record<string, string> = {
  contractors_home_services: "Confirm site readiness (access, photos, dates) before the visit.",
  creative_marketing: "Consolidate feedback into one round before rescheduling.",
  professional_it: "Confirm the acceptance reviewer before the next check-in.",
  photo_video: "Reconfirm date, venue, and coverage hours before the shoot.",
  events_rentals: "Reconfirm the final guest count before the balance reminder.",
  fabrication_signage: "No production follow-up until the proof is approved at final spec.",
};

/**
 * P4 `follow_up_behavior` suggestion hook (recipes consume; suggestion only —
 * never automated sends, countdowns, or reminders). Returns a pack-aware
 * hint for follow-up surfaces, or null when unpacked.
 */
export async function getPackFollowUpHint(businessId: string): Promise<string | null> {
  const [business] = await db
    .select({ businessType: businesses.businessType })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business) return null;

  const { getBehaviorPack } = await import(
    "@/features/businesses/behavior-packs"
  );
  const pack = getBehaviorPack(business.businessType);

  if (!pack) return null;

  return packFollowUpHints[pack] ?? null;
}
