import { z } from "zod";

import type { ScopeBlockKind } from "@/lib/db/schema/scope-blocks";
import { scopeBlockKinds } from "@/lib/db/schema/scope-blocks";

/**
 * Typed content validation per scope-block kind (P3). Strict: unknown keys
 * rejected — scope blocks are structured commercial scope, never a JSON
 * dumping ground.
 */

const labelItem = z.object({ label: z.string().trim().min(1).max(200) }).strict();

export const scopeBlockContentSchemas: Record<ScopeBlockKind, z.ZodTypeAny> = {
  deliverables: z.object({
    items: z.array(labelItem.extend({ qty: z.number().int().min(1).max(100000).optional() })).min(0).max(100),
  }).strict(),
  exclusions: z.object({
    items: z.array(labelItem).min(0).max(100),
  }).strict(),
  assumptions: z.object({
    items: z.array(labelItem).min(0).max(100),
  }).strict(),
  allowances: z.object({
    items: z.array(z.object({
      label: z.string().trim().min(1).max(200),
      amountCents: z.number().int().min(0),
      brand: z.string().trim().max(200).optional(),
    }).strict()).min(0).max(100),
  }).strict(),
  revision_cap: z.object({
    rounds: z.number().int().min(0).max(100),
    overageCents: z.number().int().min(0).optional(),
    consolidationRule: z.string().trim().max(500).optional(),
    deemedApprovalDays: z.number().int().min(0).max(90).optional(),
  }).strict(),
  acceptance_criteria: z.object({
    items: z.array(z.object({
      criterion: z.string().trim().min(1).max(500),
      reviewer: z.string().trim().max(200).optional(),
      responseDays: z.number().int().min(0).max(90).optional(),
    }).strict()).min(0).max(100),
  }).strict(),
  usage_rights: z.object({
    matrix: z.array(z.object({
      media: z.string().trim().min(1).max(200),
      term: z.string().trim().min(1).max(200),
      territory: z.string().trim().min(1).max(200),
    }).strict()).min(0).max(50),
    carveouts: z.array(z.string().trim().max(300)).max(50).default([]),
  }).strict(),
  client_responsibilities: z.object({
    items: z.array(z.object({
      label: z.string().trim().min(1).max(200),
      due: z.string().trim().max(200).optional(),
    }).strict()).min(0).max(100),
  }).strict(),
  timeline: z.object({
    milestones: z.array(z.object({
      label: z.string().trim().min(1).max(200),
      date: z.string().trim().max(40).optional(),
    }).strict()).max(100).default([]),
    note: z.string().trim().max(1000).optional(),
  }).strict(),
  payment_schedule: z.object({
    // Pointer to the P5 payment schedule — no duplication.
    referenceSchedule: z.literal(true),
  }).strict(),
};

export function validateScopeBlockContent(kind: ScopeBlockKind, content: unknown) {
  const parsed = scopeBlockContentSchemas[kind].safeParse(content);

  if (!parsed.success) {
    throw new Error(`Scope block "${kind}" content failed validation.`);
  }

  return parsed.data as Record<string, unknown>;
}

export function isScopeBlockKind(value: unknown): value is ScopeBlockKind {
  return (
    typeof value === "string" &&
    (scopeBlockKinds as readonly string[]).includes(value)
  );
}

/**
 * Completeness per kind: structural presence, not commercial judgment.
 * Timeline milestones are display-only (never the Deadline Engine).
 */
export function isScopeBlockContentComplete(
  kind: ScopeBlockKind,
  content: Record<string, unknown>,
): boolean {
  try {
    const parsed = scopeBlockContentSchemas[kind].parse(content) as Record<string, unknown>;

    switch (kind) {
      case "deliverables":
      case "exclusions":
      case "assumptions":
      case "allowances":
      case "acceptance_criteria":
      case "client_responsibilities":
        return (parsed["items"] as unknown[]).length > 0;
      case "revision_cap":
        return true;
      case "usage_rights":
        return (parsed["matrix"] as unknown[]).length > 0;
      case "timeline":
        return true;
      case "payment_schedule":
        return parsed["referenceSchedule"] === true;
      default:
        return false;
    }
  } catch {
    return false;
  }
}
