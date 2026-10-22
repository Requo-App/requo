import "server-only";

import { createHash } from "crypto";
import { z } from "zod";

import { getInquiryAssistantContextForBusiness } from "@/features/quote-drafting/queries";
import { sanitizeAiInput } from "@/lib/ai/input-sanitizer";
import { getAiCanaryToken } from "@/lib/ai/canary";
import { filterAiOutput } from "@/lib/ai/output-filter";
import { logAiSecurityEvent } from "@/lib/ai/security-events";
import { prefixedId } from "@/lib/ids";
import {
  type AiQuoteDraft,
  type AiQuoteDraftItem,
  type AiQuoteDraftItemConfidence,
  type AiQuoteDraftItemPricingSource,
  type AiQuoteDraftItemReviewStatus,
  type AiQuoteKnowledgeCitation,
  type AiQuoteMissingInfoItem,
  type AiQuoteProductStatus,
  type AiQuoteReadiness,
  type InquiryAssistantContext,
} from "@/features/quote-drafting/types";
import {
  normalizeAiQuoteClarificationMessage,
  normalizeAiQuoteMissingInfo,
} from "@/features/quote-drafting/quote-missing-info";
import { getBehaviorPack } from "@/features/businesses/behavior-packs";
import {
  applyPackMissingInfoCriticality,
  buildPackGuidanceSection,
  PACK_GUIDANCE_VERSION,
} from "@/features/businesses/pack-guidance";
import { getActiveRecipeForBusiness } from "@/features/businesses/pack-recipes";
import {
  formatPricingCandidates,
  resolvePricingCandidate,
  retrievePricingCandidates,
  type PricingCandidate,
} from "@/features/quote-drafting/pricing-retrieval";
import {
  formatKnowledgeEvidence,
  retrieveBusinessKnowledge,
  type KnowledgeEvidence,
} from "@/features/knowledge/retrieval";
import { computeQuoteAiReadiness, formatQuoteMoney } from "@/features/quotes/utils";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import {
  estimateTokens,
  generateWithFallback,
  logAiInvocation,
  recordUsage,
  releaseUsageReservation,
  settleUsageReservation,
  startCooldown,
  computeUsageWeight,
  setCachedOutput,
  getCachedOutput,
} from "@/lib/ai";
import type { UsageReservation } from "@/lib/ai/usage-limiter";
import type {
  AiCompletionRequest,
  AiQualityTier,
  AiProviderName,
  CacheKeyComponents,
  CachedAiOutput,
} from "@/lib/ai";
import type { PlanTier } from "@/lib/plans/plans";
import { buildQuoteDraftPrompt } from "@/features/quote-drafting/prompts/quote-draft";
import { buildQuoteImprovementPrompt } from "@/features/quote-drafting/prompts/quote-improvement";
import { eq } from "drizzle-orm";

const MAX_DRAFT_ITEMS = 30;
const MAX_UNIT_PRICE_CENTS = 100_000_000; // $1,000,000 cap per line.
const MAX_QUANTITY = 999_999;
const MAX_REASON_LENGTH = 280;
const MAX_NAME_LENGTH = 120;
const MAX_PRICING_SOURCE_LABEL_LENGTH = 160;

/** Semantic prompt version — bump when the prompt contract changes. */
const GROUNDED_DRAFT_PROMPT_VERSION = "grounded-draft-v2";
const GROUNDED_IMPROVEMENT_PROMPT_VERSION = "grounded-improvement-v2";

const PRICED_REVIEW_STATUSES = new Set<AiQuoteDraftItemReviewStatus>([
  "matched",
  "calculated",
]);

function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

/**
 * Normalizes the model's claimed match type.
 *
 * Returns `null` for a missing or unrecognised value so the schema can reject
 * the response. Defaulting to `"none"` here would silently downgrade a
 * claimed "exact" match to "no candidate" and strip the price from the draft.
 */
function coerceMatchType(value: unknown): "exact" | "suggested" | "none" | null {
  if (typeof value !== "string") return null;

  switch (value.trim().toLowerCase()) {
    case "exact":
      return "exact";
    case "suggested":
      return "suggested";
    case "none":
      return "none";
    default:
      return null;
  }
}

const groundedDraftResponseSchema = z.object({
  title: z.string().trim().min(2).max(160),
  notes: z
    .union([z.string(), z.null()])
    .transform((value) => (typeof value === "string" ? value.trim() : null))
    .optional()
    .default(null),
  rationale: z
    .union([z.string(), z.null()])
    .transform((value) => (typeof value === "string" ? value.trim() : null))
    .optional()
    .default(null),
  pricingLibraryEntryId: z
    .union([z.string(), z.null()])
    .transform((value) => (typeof value === "string" ? value.trim() : null))
    .optional()
    .default(null),
  items: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(MAX_NAME_LENGTH).optional(),
        description: z.string().trim().min(1).max(400),
        quantity: z.coerce.number().finite().positive(),
        /**
         * The model MUST return 0 here. Stage D hydration applies the saved
         * pricing-library price; any model-provided value is ignored.
         */
        unitPriceInCents: z.coerce.number().finite().nonnegative().optional().default(0),
        pricingCandidateId: z
          .union([z.string(), z.null()])
          .transform((value) => (typeof value === "string" ? value.trim() : null))
          .optional()
          .default(null),
        pricingItemId: z
          .union([z.string(), z.null()])
          .transform((value) => (typeof value === "string" ? value.trim() : null))
          .optional()
          .default(null),
        // Required on every item: a missing match type must fail the response
        // loudly rather than silently degrade a priced line to "unpriced".
        matchType: z.preprocess(
          (value) => coerceMatchType(value),
          z.enum(["exact", "suggested", "none"]),
        ),
        knowledgeCitationIds: z
          .array(z.string().trim().min(1).max(120))
          .max(6)
          .optional()
          .default([]),
        reason: z.string().trim().min(1).max(600).optional().default(""),
      }),
    )
    .min(1)
    .max(MAX_DRAFT_ITEMS),
  missingInfo: z
    .array(
      z.object({
        label: z.string().trim().min(2).max(120),
        question: z.string().trim().min(2).max(320),
        critical: z.boolean().optional().default(false),
      }),
    )
    .max(12)
    .optional()
    .default([]),
  clarificationMessage: z
    .union([z.string(), z.null()])
    .transform((value) => (typeof value === "string" ? value.trim() : null))
    .optional()
    .default(null),
});

type RawDraftItem = z.infer<typeof groundedDraftResponseSchema>["items"][number];

function truncate(value: string | null | undefined, limit: number) {
  const normalized = value?.replace(/\r\n?/g, "\n").trim() ?? "";

  if (!normalized) return "";

  if (normalized.length <= limit) return normalized;

  return `${normalized.slice(0, limit).trimEnd()}...`;
}

function clampQuantity(value: number): number {
  return Math.min(MAX_QUANTITY, Math.max(1, Math.trunc(value)));
}

function clampPrice(value: number): number {
  return Math.min(MAX_UNIT_PRICE_CENTS, Math.max(0, Math.round(value)));
}

function fallbackNameFromDescription(description: string) {
  const firstLine = description.split(/[\n.;:]/)[0] ?? description;

  return truncate(firstLine, MAX_NAME_LENGTH) || truncate(description, MAX_NAME_LENGTH);
}

// ---------------------------------------------------------------------------
// Context formatting
// ---------------------------------------------------------------------------

function formatPastQuotes(context: InquiryAssistantContext) {
  if (!context.relatedQuotes.length) {
    return "- No past quotes.";
  }

  return context.relatedQuotes
    .slice(0, 3)
    .map((quote) => {
      const items = quote.items
        .slice(0, 6)
        .map(
          (item) =>
            `  ${item.description} x${item.quantity} @${formatQuoteMoney(item.unitPriceInCents, quote.currency)}`,
        )
        .join("\n");
      const total = formatQuoteMoney(quote.totalInCents, quote.currency);

      return `- ${quote.quoteNumber} "${truncate(quote.title, 60)}" [${quote.status}] total:${total}${items ? "\n" + items : ""}`;
    })
    .join("\n");
}

const UNTRUSTED_CUSTOMER_CONTENT_OPEN = "<untrusted_customer_content>";
const UNTRUSTED_CUSTOMER_CONTENT_CLOSE = "</untrusted_customer_content>";

/**
 * Removes the fence tags (and near-variants) from untrusted text.
 *
 * Without this a customer could write `</untrusted_customer_content>` and
 * everything after it would sit outside the region the prompt defines as
 * data — the fence has to be unclosable from the inside.
 */
function stripFenceTags(value: string): string {
  return value
    .replace(/<\s*\/?\s*untrusted_customer_content\s*>/gi, "")
    .replace(/<\s*\/?\s*untrusted[_\s-]*(customer|business|knowledge)[_\s-]*content\s*>/gi, "");
}

/**
 * Wraps untrusted text in the customer-content fence.
 *
 * Every customer-controlled value goes through here: the fence is only a
 * boundary if it wraps everything the customer wrote, not just the message
 * body.
 */
function fenceUntrusted(value: string): string {
  return [
    UNTRUSTED_CUSTOMER_CONTENT_OPEN,
    stripFenceTags(value),
    UNTRUSTED_CUSTOMER_CONTENT_CLOSE,
  ].join("\n");
}

/**
 * Customer-supplied text reaches the model as data, never as instructions.
 * High-confidence injection attempts are redacted instead of aborting the
 * quote, so a hostile inquiry cannot steer the draft the owner sends.
 */
async function sanitizeCustomerText(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const sanitized = await sanitizeAiInput(value);

  if (sanitized.status === "rejected" || sanitized.status === "locked") {
    return "[redacted — content could not be processed]";
  }

  return stripFenceTags(sanitized.output || "");
}

async function formatInquiryContextLines(
  context: InquiryAssistantContext,
) {
  const customerName = await sanitizeCustomerText(context.inquiry.customerName);
  const customerEmail = await sanitizeCustomerText(context.inquiry.customerEmail);
  const subject = await sanitizeCustomerText(context.inquiry.subject);
  const requestedDeadline = await sanitizeCustomerText(
    context.inquiry.requestedDeadline,
  );
  const budgetText = await sanitizeCustomerText(context.inquiry.budgetText);

  // Every field the customer controls is inside the fence. The form name is
  // business-authored, but it shares the block so no customer-controlled
  // value can sit next to the fence boundary.
  const headerFields: string[] = [`Customer: ${customerName}`];
  if (customerEmail) headerFields.push(`email: ${customerEmail}`);
  if (context.inquiry.serviceName) headerFields.push(`service: ${context.inquiry.serviceName}`);
  if (subject) headerFields.push(`subject: ${subject}`);
  if (requestedDeadline) headerFields.push(`deadline: ${requestedDeadline}`);
  if (budgetText) headerFields.push(`budget: ${budgetText}`);

  const sections: string[] = [
    "Inquiry:",
    fenceUntrusted(headerFields.join("; ")),
  ];

  const snapshot = context.inquiry.submittedFieldSnapshot;
  if (snapshot?.fields.length) {
    const fieldLines = await Promise.all(
      snapshot.fields.map(async (field) => {
        const displayValue = await sanitizeCustomerText(field.displayValue);

        return `- ${truncate(field.label, 80)}: ${truncate(displayValue, 300)}`;
      }),
    );
    sections.push(
      "",
      "Submitted fields",
      fenceUntrusted(fieldLines.join("\n")),
    );
  }

  const details = await sanitizeCustomerText(context.inquiry.details);
  sections.push("", "Details", fenceUntrusted(truncate(details, 2000)));

  if (context.messages.length > 0) {
    const messageLines = context.messages
      .slice(0, 10)
      .map((msg) => `[${msg.role}]: ${truncate(msg.content, 400)}`)
      .join("\n");
    sections.push("", "Conversation", fenceUntrusted(messageLines));
  }

  if (context.notes.length) {
    sections.push(
      "",
      "Notes",
      context.notes
        .slice(0, 4)
        .map((note) => `- ${truncate(note.body, 200)}`)
        .join("\n"),
    );
  }

  sections.push("", "Past quotes (context only — never a price source)", formatPastQuotes(context));

  return sections.join("\n");
}

// ---------------------------------------------------------------------------
// JSON extraction/repair (defense in depth; Stage D re-validates everything)
// ---------------------------------------------------------------------------

function extractJsonObject(text: string): string | null {
  const trimmed = text.trim();

  if (!trimmed) return null;

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenceMatch ? fenceMatch[1].trim() : trimmed;

  let jsonStr: string | null = null;

  if (candidate.startsWith("{") && candidate.endsWith("}")) {
    jsonStr = candidate;
  } else {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start >= 0 && end > start) {
      jsonStr = candidate.slice(start, end + 1);
    }
  }

  if (!jsonStr) return null;

  return repairJson(jsonStr);
}

function repairJson(json: string): string {
  let result = json;

  result = result.replace(/\/\/[^\n]*/g, "");
  result = result.replace(/\/\*[\s\S]*?\*\//g, "");
  result = result.replace(/,\s*([}\]])/g, "$1");
  result = result.replace(
    /"([^"\\]*(?:\\.[^"\\]*)*)"/g,
    (match) => match.replace(/\n/g, "\\n").replace(/\r/g, "\\r"),
  );

  return result;
}

function parseJsonSafe(jsonStr: string): unknown | null {
  try {
    return JSON.parse(jsonStr);
  } catch {
    // continue
  }

  try {
    const cleaned = jsonStr
      .replace(/,\s*([}\]])/g, "$1")
      .replace(/\r\n/g, "\n");
    return JSON.parse(cleaned);
  } catch {
    // continue
  }

  try {
    const aggressive = jsonStr
      .replace(/'/g, '"')
      .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":')
      .replace(/,\s*([}\]])/g, "$1");
    return JSON.parse(aggressive);
  } catch {
    // continue
  }

  try {
    const start = jsonStr.indexOf("{");
    const end = jsonStr.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const inner = jsonStr.slice(start, end + 1).replace(/,\s*([}\]])/g, "$1");
      return JSON.parse(inner);
    }
  } catch {
    // all attempts failed
  }

  return null;
}

// ---------------------------------------------------------------------------
// Stage D: deterministic hydration + verification
// ---------------------------------------------------------------------------

type HydrationContext = {
  candidates: PricingCandidate[];
  currency: string;
  evidenceById: Map<string, KnowledgeEvidence>;
};

function sourceForKind(kind: PricingCandidate["kind"]): AiQuoteDraftItemPricingSource {
  switch (kind) {
    case "package":
      return "pricing_library_package";
    case "template":
      return "pricing_library_block";
    default:
      return "pricing_library_block";
  }
}

/**
 * Hydrates one model item into a grounded draft item.
 *
 * The model never authors prices: prices are loaded from the retrieved
 * pricing candidates (which were themselves loaded from the database).
 * - verified: candidate entry is `exact` and the model claimed `exact` with a
 *   resolvable item → saved price applied.
 * - suggested: candidate is only `suggested` (or claimed weaker than exact) →
 *   candidate price shown but owner confirmation required.
 * - unpriced: no candidate, unknown ids, currency mismatch, or context-only
 *   source (past quotes, knowledge, owner brief) → zero price.
 */
function hydrateDraftItem(
  raw: RawDraftItem,
  ctx: HydrationContext,
): AiQuoteDraftItem {
  const description = truncate(raw.description, 400);
  const name = truncate(
    raw.name?.trim() ? raw.name : fallbackNameFromDescription(description),
    MAX_NAME_LENGTH,
  );
  let quantity = clampQuantity(raw.quantity);
  const reason =
    truncate(raw.reason, MAX_REASON_LENGTH) ||
    "No reason provided by the assistant.";

  const citations: AiQuoteKnowledgeCitation[] = (raw.knowledgeCitationIds ?? [])
    .map((id) => ctx.evidenceById.get(id))
    .filter((evidence): evidence is KnowledgeEvidence => Boolean(evidence))
    .slice(0, 6)
    .map((evidence) => ({
      sourceType: evidence.sourceType,
      sourceId: evidence.sourceId,
      chunkId: evidence.chunkId,
      title: evidence.title,
    }));

  const resolution = resolvePricingCandidate({
    candidates: ctx.candidates,
    entryId: raw.pricingCandidateId,
    itemId: raw.pricingItemId,
    claimedMatchType: raw.matchType,
    currency: ctx.currency,
  });

  let reviewStatus: AiQuoteDraftItemReviewStatus = "needs_review";
  let unitPriceInCents = 0;
  let aiProductStatus: AiQuoteProductStatus = "unpriced";
  let pricingSource: AiQuoteDraftItemPricingSource = "none";
  let pricingSourceLabel: string | null = null;
  let confidence: AiQuoteDraftItemConfidence = "low";
  let aiEvidence: AiQuoteDraftItem["aiEvidence"] = {
    entryId: resolution?.entry.entryId ?? null,
    itemId: resolution?.item?.itemId ?? null,
    sourceLabel: resolution?.entry.name ?? null,
    matchType: "none",
    reason:
      resolution?.reason ??
      "No pricing candidate selected. The owner must price this line item.",
  };

  if (resolution) {
    const source = sourceForKind(resolution.entry.kind);
    pricingSource = source;
    pricingSourceLabel = truncate(resolution.entry.name, MAX_PRICING_SOURCE_LABEL_LENGTH);
    confidence = resolution.entry.matchType === "exact" ? "high" : "medium";

    if (resolution.verified) {
      // The saved price — never the model's price.
      unitPriceInCents = clampPrice(resolution.item?.unitPriceInCents ?? 0);
      reviewStatus = "matched";
      aiProductStatus = "verified";
      // The saved price belongs to the quantity it was authored for. The
      // model chose the quantity, and the quantity multiplies the DB unit
      // price — so an exact match takes the quantity from the priced item
      // instead of from the model.
      if (resolution.item) {
        quantity = clampQuantity(resolution.item.quantity);
      }
      aiEvidence = {
        entryId: resolution.entry.entryId,
        itemId: resolution.item?.itemId ?? null,
        sourceLabel: resolution.entry.name,
        matchType: "exact",
        reason: resolution.reason,
      };
    } else if (resolution.item) {
      // Suggested: candidate price shown, owner confirmation required.
      unitPriceInCents = clampPrice(resolution.item.unitPriceInCents);
      reviewStatus = "needs_review";
      aiProductStatus = "suggested";
      aiEvidence = {
        entryId: resolution.entry.entryId,
        itemId: resolution.item.itemId,
        sourceLabel: resolution.entry.name,
        matchType: "suggested",
        reason: resolution.reason,
      };
    } else {
      reviewStatus = "needs_review";
      aiProductStatus = "unpriced";
      aiEvidence = {
        entryId: resolution.entry.entryId,
        itemId: null,
        sourceLabel: resolution.entry.name,
        matchType: "none",
        reason: resolution.reason,
      };
    }
  }

  // Context-only sources (past_quote, business_memory, owner_brief) never
  // produce a price. The model's claimed source labels are ignored entirely;
  // only candidate ids can resolve to a price.
  return {
    name: name || truncate(description, MAX_NAME_LENGTH),
    description,
    quantity,
    unitPriceInCents,
    pricingSource,
    pricingSourceLabel,
    confidence,
    reviewStatus,
    aiProductStatus,
    aiEvidence,
    aiKnowledgeCitations: citations,
    reason,
  };
}

/**
 * Expands package selections from canonical saved package items and rejects
 * model rows that duplicate package contents.
 */
function expandPackageItemsFromCandidates(
  items: AiQuoteDraftItem[],
  candidates: PricingCandidate[],
): AiQuoteDraftItem[] {
  const packageIds = new Set(
    items
      .filter((item) => item.aiEvidence?.matchType === "exact")
      .map((item) => item.aiEvidence?.entryId)
      .filter((id): id is string => Boolean(id)),
  );

  if (packageIds.size === 0) {
    return items;
  }

  const packageItemDescriptions = new Set<string>();
  for (const candidate of candidates) {
    if (packageIds.has(candidate.entryId) && candidate.kind === "package") {
      for (const item of candidate.items) {
        packageItemDescriptions.add(item.description.trim().toLowerCase());
      }
    }
  }

  const expanded: AiQuoteDraftItem[] = [];
  const emittedPackageIds = new Set<string>();

  for (const item of items) {
    const entryId = item.aiEvidence?.entryId;

    if (entryId && packageIds.has(entryId)) {
      const candidate = candidates.find(
        (c) => c.entryId === entryId && c.kind === "package",
      );

      if (candidate && candidate.items.length > 0) {
        if (emittedPackageIds.has(entryId)) {
          continue;
        }

        emittedPackageIds.add(entryId);

        for (const packageItem of candidate.items) {
          expanded.push({
            name: truncate(packageItem.description, MAX_NAME_LENGTH),
            description: truncate(packageItem.description, 400),
            quantity: clampQuantity(packageItem.quantity),
            unitPriceInCents: clampPrice(packageItem.unitPriceInCents),
            pricingSource: "pricing_library_package",
            pricingSourceLabel: candidate.name,
            confidence: "high",
            reviewStatus: "matched",
            aiProductStatus: "verified",
            aiEvidence: {
              entryId: candidate.entryId,
              itemId: packageItem.itemId,
              sourceLabel: candidate.name,
              matchType: "exact",
              reason: `From "${candidate.name}" package.`,
            },
            aiKnowledgeCitations: item.aiKnowledgeCitations,
            reason: `From "${candidate.name}" package.`,
          });
        }

        continue;
      }
    }

    const descriptionKey = item.description.trim().toLowerCase();
    if (descriptionKey && packageItemDescriptions.has(descriptionKey)) {
      continue;
    }

    expanded.push(item);
  }

  return expanded;
}

function verifyGroundedDraft(
  items: AiQuoteDraftItem[],
): string[] {
  const errors: string[] = [];

  for (const item of items) {
    if (item.unitPriceInCents > 0) {
      if (
        item.aiProductStatus !== "verified" &&
        item.aiProductStatus !== "suggested" &&
        item.aiProductStatus !== "owner_set"
      ) {
        errors.push(`Item "${item.description}" has a price without an authorized pricing status.`);
      }
    }

    if (item.aiProductStatus === "verified") {
      if (!item.aiEvidence?.entryId || !item.aiEvidence.itemId) {
        errors.push(`Item "${item.description}" is verified but lacks source entry/item ids.`);
      }

      if (item.aiEvidence?.matchType !== "exact") {
        errors.push(`Item "${item.description}" is verified without an exact source match.`);
      }
    }

    if (item.aiEvidence?.matchType === "exact" && (!item.aiEvidence.entryId || !item.aiEvidence.itemId)) {
      errors.push(`Item "${item.description}" cites an exact match without ids.`);
    }
  }

  return errors;
}

/**
 * Attempts one constrained repair pass, then re-verifies. Any remaining
 * violation is a safe failure — the draft is rejected rather than sent
 * with unsupported data.
 */
function repairGroundedDraft(items: AiQuoteDraftItem[]) {
  let errors = verifyGroundedDraft(items);

  if (errors.length === 0) {
    return { ok: true as const, items };
  }

  // Repair pass: zero out every unauthorized price and demote to needs_review.
  const repaired = items.map((item) => {
    if (item.unitPriceInCents > 0 && item.aiProductStatus !== "owner_set") {
      const unauthorized =
        item.aiProductStatus !== "verified" && item.aiProductStatus !== "suggested";

      if (unauthorized || !item.aiEvidence?.entryId || !item.aiEvidence.itemId) {
        return {
          ...item,
          unitPriceInCents: 0,
          reviewStatus: "needs_review" as const,
          aiProductStatus: "unpriced" as const,
          aiEvidence: item.aiEvidence
            ? { ...item.aiEvidence, matchType: "none" as const, reason: "Verifier rejected the source; price reset for owner review." }
            : item.aiEvidence,
        };
      }
    }

    return item;
  });

  errors = verifyGroundedDraft(repaired);

  if (errors.length > 0) {
    return { ok: false as const, errors };
  }

  return { ok: true as const, items: repaired };
}

/**
 * Server-computed readiness. Never trusted from the model, and never trusted
 * from the browser: the quote mutations recompute it with the same helper
 * from the provenance that is actually persisted.
 */
function computeQuoteReadiness(
  items: AiQuoteDraftItem[],
  missingInfo: AiQuoteMissingInfoItem[],
): AiQuoteReadiness {
  return (
    computeQuoteAiReadiness({ items, missingInfo }) ??
    // Every draft item carries a server-assigned status, so the fallback is
    // unreachable in practice. It keeps the return type non-nullable.
    "ready"
  );
}

// ---------------------------------------------------------------------------
// Pack guidance resolution (AI-01)
// ---------------------------------------------------------------------------

type PackGuidanceResolution = {
  pack: ReturnType<typeof getBehaviorPack>;
  sectionText: string | null;
  fingerprint: string | null;
  recipeConfig: Record<string, unknown> | null;
};

/**
 * Resolves the behavior pack from the stored type and builds the guidance
 * section. Fail-open: guidance must never break drafting — a failure here
 * falls back to the pre-verticalization prompt.
 */
async function resolvePackGuidance(
  businessId: string,
  businessType: unknown,
): Promise<PackGuidanceResolution> {
  const pack = getBehaviorPack(businessType);

  if (!pack) {
    return { pack, sectionText: null, fingerprint: null, recipeConfig: null };
  }

  try {
    const recipe = await getActiveRecipeForBusiness(businessId, "ai_guidance", pack);
    const section = buildPackGuidanceSection(pack, recipe.config);

    return {
      pack,
      sectionText: section?.text ?? null,
      fingerprint: `${pack}:v${recipe.version}:g${PACK_GUIDANCE_VERSION}`,
      recipeConfig: recipe.config,
    };
  } catch {
    return { pack, sectionText: null, fingerprint: null, recipeConfig: null };
  }
}

type StageBResult = {
  candidates: PricingCandidate[];
  evidence: KnowledgeEvidence[];
  evidenceById: Map<string, KnowledgeEvidence>;
};

async function retrieveStageB(input: {
  businessId: string;
  queryText: string;
  currency: string;
}): Promise<StageBResult> {
  const [pricing, knowledge] = await Promise.all([
    retrievePricingCandidates({
      businessId: input.businessId,
      queryText: input.queryText,
      currency: input.currency,
    }),
    retrieveBusinessKnowledge({
      businessId: input.businessId,
      queryText: input.queryText,
    }),
  ]);

  const evidenceById = new Map<string, KnowledgeEvidence>();
  for (const evidence of knowledge.evidence) {
    evidenceById.set(evidence.chunkId, evidence);
    evidenceById.set(evidence.sourceId, evidence);
  }

  return {
    candidates: pricing.candidates,
    evidence: knowledge.evidence,
    evidenceById,
  };
}

function buildGroundedContext(input: {
  inquiryContextText: string;
  candidates: PricingCandidate[];
  evidence: KnowledgeEvidence[];
  revisionContext?: string | null;
  currentItemsText?: string | null;
  existingDraftText?: string | null;
  /** AI-01 pack guidance section (product data, separate from instructions). */
  packGuidanceText?: string | null;
}): string {
  const contextParts: string[] = [];

  if (input.inquiryContextText) {
    contextParts.push(`INQUIRY CONTEXT:\n${truncate(input.inquiryContextText, 3000)}`);
  }

  contextParts.push(
    `\nKNOWLEDGE EVIDENCE (scope, wording, policies, exclusions — NEVER prices):\n${formatKnowledgeEvidence(input.evidence)}`,
  );

  contextParts.push(
    `\nPRICING CANDIDATES (prices shown for reference — the server applies the saved price):\n${formatPricingCandidates(input.candidates)}`,
  );

  if (input.revisionContext) {
    // The revision request is written by the customer, so it is fenced like
    // every other customer-controlled value. The prompt gives it no special
    // standing: a customer could otherwise use it to steer which candidate the
    // model picks.
    contextParts.push(
      `\nREVISION REQUEST (customer-written, untrusted):\n${fenceUntrusted(truncate(input.revisionContext, 1000))}`,
    );
  }

  if (input.currentItemsText) {
    contextParts.push(`\nCURRENT ITEMS:\n${truncate(input.currentItemsText, 2000)}`);
  }

  if (input.existingDraftText) {
    contextParts.push(`\nEXISTING QUOTE DRAFT:\n${truncate(input.existingDraftText, 2000)}`);
  }

  if (input.packGuidanceText) {
    contextParts.push(`\n${truncate(input.packGuidanceText, 2000)}`);
  }

  return contextParts.join("\n");
}

function buildCacheSourceDataVersions(input: {
  inquiryKey: string | null;
  inquiryText: string;
  candidates: PricingCandidate[];
  evidence: KnowledgeEvidence[];
  brief: string | null;
  revisionComment: string | null;
  currentItems: string | null;
  currentItemsData: unknown;
  /** AI-01: pack + guidance versions in the fingerprint (no global invalidation). */
  packGuidanceVersion?: string | null;
}): Record<string, string | null> {
  return {
    inquiry: input.inquiryKey,
    packGuidance: input.packGuidanceVersion ?? null,
    inquiryContentHash: contentHash(input.inquiryText.slice(0, 4000)),
    pricingCandidates: input.candidates.length
      ? JSON.stringify(
          input.candidates.map((candidate) => ({
            id: candidate.entryId,
            currency: candidate.currency,
            kind: candidate.kind,
            matchType: candidate.matchType,
            items: candidate.items.map(
              (item) => `${item.itemId}:${item.unitPriceInCents}:${item.quantity}`,
            ),
          })),
        )
      : null,
    knowledge: input.evidence.length
      ? input.evidence
          .map((e) => `${e.chunkId}:${contentHash(e.content.slice(0, 500))}`)
          .sort()
          .join(",")
      : null,
    brief: input.brief ?? null,
    revisionComment: input.revisionComment ?? null,
    currentItems: input.currentItems ?? null,
    currentItemsData: input.currentItemsData
      ? JSON.stringify(input.currentItemsData)
      : null,
  };
}

/**
 * Carried-over revision items are resolved against candidates by exact
 * description match. A verified match re-applies the saved library price;
 * otherwise the owner's saved price is preserved and the item is marked
 * owner-set (the owner already priced it on a previous version).
 */
function resolveCarriedOverItem(
  currentItem: { description: string; quantity: number; unitPriceInCents: number },
  ctx: HydrationContext,
): AiQuoteDraftItem {
  const key = currentItem.description.trim().toLowerCase();

  for (const candidate of ctx.candidates) {
    if (candidate.name.toLowerCase() === key) {
      const item = candidate.items.length === 1 ? candidate.items[0] : null;
      if (item) {
        return {
          name: truncate(currentItem.description, MAX_NAME_LENGTH),
          description: currentItem.description,
          quantity: clampQuantity(item.quantity),
          unitPriceInCents: clampPrice(item.unitPriceInCents),
          pricingSource: sourceForKind(candidate.kind),
          pricingSourceLabel: candidate.name,
          confidence: "high",
          reviewStatus: "matched",
          aiProductStatus: "verified",
          aiEvidence: {
            entryId: candidate.entryId,
            itemId: item.itemId,
            sourceLabel: candidate.name,
            matchType: "exact",
            reason: `Verified from "${candidate.name}".`,
          },
          aiKnowledgeCitations: [],
          reason: `Carried over from previous version; matched "${candidate.name}".`,
        };
      }
    }

    for (const candidateItem of candidate.items) {
      if (candidateItem.description.trim().toLowerCase() === key) {
        return {
          name: truncate(currentItem.description, MAX_NAME_LENGTH),
          description: currentItem.description,
          quantity: clampQuantity(candidateItem.quantity),
          unitPriceInCents: clampPrice(candidateItem.unitPriceInCents),
          pricingSource: sourceForKind(candidate.kind),
          pricingSourceLabel: candidate.name,
          confidence: "high",
          reviewStatus: "matched",
          aiProductStatus: "verified",
          aiEvidence: {
            entryId: candidate.entryId,
            itemId: candidateItem.itemId,
            sourceLabel: candidate.name,
            matchType: "exact",
            reason: `Verified from "${candidate.name}".`,
          },
          aiKnowledgeCitations: [],
          reason: `Carried over from previous version; matched "${candidate.name}".`,
        };
      }
    }
  }

  // No library match: the owner already accepted this price on a previous
  // version — preserve it as owner-set.
  return {
    name: truncate(currentItem.description, MAX_NAME_LENGTH),
    description: currentItem.description,
    quantity: clampQuantity(currentItem.quantity),
    unitPriceInCents: clampPrice(currentItem.unitPriceInCents),
    pricingSource: "owner_brief",
    pricingSourceLabel: null,
    confidence: "high",
    reviewStatus: "matched",
    aiProductStatus: "owner_set",
    aiEvidence: {
      entryId: null,
      itemId: null,
      sourceLabel: null,
      matchType: "none",
      reason: "Price carried over from the previous quote version.",
    },
    aiKnowledgeCitations: [],
    reason: "Carried over from previous version.",
  };
}

/**
 * For revisions: start with the current items as the base (resolved
 * deterministically), then append genuinely new AI items that don't
 * duplicate carried items.
 */
function mergeRevisionWithCurrentItems(
  aiItems: AiQuoteDraftItem[],
  currentItemsData: Array<{
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }>,
  ctx: HydrationContext,
): AiQuoteDraftItem[] {
  const result: AiQuoteDraftItem[] = [];
  const seenDescriptions = new Set<string>();

  for (const currentItem of currentItemsData) {
    const key = currentItem.description.trim().toLowerCase();
    if (!key || seenDescriptions.has(key)) {
      continue;
    }

    seenDescriptions.add(key);
    result.push(resolveCarriedOverItem(currentItem, ctx));
  }

  for (const aiItem of aiItems) {
    const descLower = aiItem.description.trim().toLowerCase();
    const nameLower = (aiItem.name || "").trim().toLowerCase();

    if (!descLower || seenDescriptions.has(descLower)) {
      continue;
    }

    let tooSimilar = false;
    for (const existing of seenDescriptions) {
      if (
        existing.includes(descLower) ||
        descLower.includes(existing) ||
        (nameLower && (existing.includes(nameLower) || nameLower.includes(existing)))
      ) {
        tooSimilar = true;
        break;
      }
    }

    if (tooSimilar) {
      continue;
    }

    seenDescriptions.add(descLower);
    result.push(aiItem);
  }

  return result;
}

async function finalizeDraft(input: {
  businessId: string;
  userId: string;
  /** Plan in effect for this invocation — scopes the recorded credit weight. */
  plan: PlanTier;
  taskType: "quote_draft" | "quote_improvement";
  title: string;
  notes: string | null;
  rationale: string | null;
  pricingLibraryEntryId: string | null;
  rawItems: RawDraftItem[];
  rawMissingInfo: Array<{ label: string; question: string; critical?: boolean }>;
  rawClarification: string | null;
  candidates: PricingCandidate[];
  currency: string;
  evidenceById: Map<string, KnowledgeEvidence>;
  /** Revision-only: current items to carry over deterministically. */
  currentItemsData?: Array<{
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }> | null;
  model: string;
  provider: AiProviderName;
  taskConfig: { temperature: number; maxOutputTokens: number; qualityTier: AiQualityTier; cacheTTL: number };
  cacheKey: CacheKeyComponents;
  responseText: string;
  responseUsage: { promptTokens?: number; outputTokens?: number } | undefined;
  responseModel: string;
  responseProvider: string;
  startTime: number;
  /** Cache hits skip usage deduction and cooldown. */
  fromCache?: boolean;
  /**
   * The reserved credit for this invocation. When present the reserved row
   * settles with the real weight instead of a second row being written.
   */
  usageReservation?: UsageReservation;
  /**
   * AI-01 (b): pack for missing-information criticality overlay. Applied to
   * fresh generations only — cached outputs keep the attribution of the
   * version under which they were generated.
   */
  pack?: ReturnType<typeof getBehaviorPack>;
  packGuidanceRecipeConfig?: Record<string, unknown> | null;
}): Promise<AiQuoteDraft | null> {
  const hydrationContext = {
    candidates: input.candidates,
    currency: input.currency,
    evidenceById: input.evidenceById,
  };

  // Stage D: hydrate every item deterministically.
  const hydrated = input.rawItems.map((item) =>
    hydrateDraftItem(item, hydrationContext),
  );

  const merged =
    input.taskType === "quote_draft" &&
    input.currentItemsData &&
    input.currentItemsData.length > 0
      ? mergeRevisionWithCurrentItems(hydrated, input.currentItemsData, hydrationContext)
      : hydrated;

  const expanded = expandPackageItemsFromCandidates(
    merged.filter((item) => item.description.length > 0),
    input.candidates,
  ).slice(0, MAX_DRAFT_ITEMS);

  if (expanded.length === 0) {
    return null;
  }

  // Verifier: one constrained repair pass, then safe failure.
  const verification = repairGroundedDraft(expanded);

  if (!verification.ok) {
    console.error(
      "[quote-generator] Draft failed verification after repair:",
      verification.errors.join("; "),
    );
    return null;
  }

  const items = verification.items;
  const normalizedMissingInfo = normalizeAiQuoteMissingInfo(input.rawMissingInfo);
  const missingInfo =
    input.fromCache || !input.pack
      ? normalizedMissingInfo
      : applyPackMissingInfoCriticality(
          normalizedMissingInfo,
          input.pack,
          input.packGuidanceRecipeConfig ?? null,
        );
  const clarificationMessage = normalizeAiQuoteClarificationMessage({
    message: input.rawClarification,
    missingInfo,
  });

  const knownEntryId = input.pricingLibraryEntryId
    ? input.candidates.find(
        (candidate) =>
          candidate.entryId === input.pricingLibraryEntryId &&
          candidate.currency === input.currency,
      )?.entryId ?? null
    : null;

  const itemsNeedingReview = items.filter(
    (item) => !PRICED_REVIEW_STATUSES.has(item.reviewStatus),
  ).length;

  const citations = Array.from(
    new Map(
      items.flatMap((item) => item.aiKnowledgeCitations).map((citation) => [citation.chunkId, citation]),
    ).values(),
  );

  const readiness = computeQuoteReadiness(items, missingInfo);

  const draft: AiQuoteDraft = {
    title: truncate(input.title, 160),
    notes: input.notes?.trim() ? truncate(input.notes, 4000) : null,
    items,
    missingInfo,
    clarificationMessage,
    pricingLibraryEntryId: knownEntryId,
    rationale: input.rationale?.trim() ? truncate(input.rationale, 600) : null,
    model: input.model,
    provider: input.provider,
    itemsNeedingReview,
    readiness,
    aiGenerationId: prefixedId("qgen"),
    knowledgeCitations: citations,
  };

  // Cache only the final verified draft — the fingerprint includes candidate
  // prices and knowledge hashes, so a stale price can never be served.
  if (input.taskConfig.cacheTTL > 0 && !input.fromCache) {
    const cachedResult: CachedAiOutput = {
      text: input.responseText,
      model: input.responseModel,
      provider: input.responseProvider,
      createdAt: new Date().toISOString(),
      usage: input.responseUsage,
    };

    await setCachedOutput(input.cacheKey, cachedResult, input.taskConfig.cacheTTL);
  }

  if (input.fromCache) {
    // A cached draft spent no tokens: release the reserved credit so the
    // cache hit is free, exactly like the usage recording below skips it.
    if (input.usageReservation) {
      await releaseUsageReservation(input.usageReservation).catch((error) => {
        console.warn("[quote-generator] Failed to release AI credit:", error);
      });
    }

    return draft;
  }

  // Weight the credit against the tokens this draft actually spent. Falls back
  // to the fixed per-task weight only when the provider reported no usage.
  const weight = computeUsageWeight(input.taskType, {
    inputTokens: input.responseUsage?.promptTokens,
    outputTokens: input.responseUsage?.outputTokens,
  });

  if (input.usageReservation) {
    // The reservation row IS the usage event — settle it rather than adding
    // a second row for the same invocation.
    await settleUsageReservation(input.usageReservation, weight).catch((error) => {
      console.warn("[quote-generator] Failed to settle AI credit:", error);
    });
  } else {
    await recordUsage(
      input.userId,
      input.businessId,
      input.taskType,
      weight,
      input.plan,
    );
  }
  await startCooldown(input.userId, input.taskType);

  await logAiInvocation({
    businessId: input.businessId,
    taskType: input.taskType,
    model: input.responseModel,
    provider: input.responseProvider,
    inputTokens: input.responseUsage?.promptTokens ?? 0,
    outputTokens: input.responseUsage?.outputTokens ?? 0,
    cacheHit: false,
    latencyMs: Date.now() - input.startTime,
    status: "success",
    userId: input.userId,
  }).catch((logError) => {
    console.warn("[quote-generator] Failed to log invocation:", logError);
  });

  return draft;
}

async function parseModelDraftResponse(
  responseText: string,
): Promise<z.infer<typeof groundedDraftResponseSchema> | null> {
  const rawJson = extractJsonObject(responseText);

  if (!rawJson) {
    // The raw text can echo the customer's own message, so it is not logged
    // verbatim — only its length and a short prefix.
    console.error(
      `[quote-generator] No JSON found in response. Length=${responseText.length} Preview=${responseText.slice(0, 120)}`,
    );
    return null;
  }

  const parsedJson = parseJsonSafe(rawJson);

  if (parsedJson === null) {
    console.error(
      `[quote-generator] JSON parse failed. Length=${rawJson.length} Preview=${rawJson.slice(0, 120)}`,
    );
    return null;
  }

  const validation = groundedDraftResponseSchema.safeParse(parsedJson);

  if (!validation.success) {
    console.error(
      "[quote-generator] Zod validation failed:",
      JSON.stringify(validation.error.issues.slice(0, 5)),
    );
    return null;
  }

  return validation.data;
}

// ---------------------------------------------------------------------------
// Quote draft generation
// ---------------------------------------------------------------------------

type GenerateQuoteDraftInput = {
  businessId: string;
  userId: string;
  /** Effective plan for the business — scopes the recorded credit weight. */
  plan: PlanTier;
  inquiryId?: string | null;
  brief?: string | null;
  revisionComment?: string | null;
  currentItems?: string | null;
  /** Structured current items for revision merging. */
  currentItemsData?: Array<{
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }> | null;
  /**
   * The reserved credit for this invocation. The reserved row settles with
   * the real token weight instead of a second usage row being written.
   */
  usageReservation?: UsageReservation;
};

type GenerateQuoteDraftResult =
  | { ok: true; draft: AiQuoteDraft }
  | { ok: false; error: string };

export async function generateQuoteDraftForBusiness(
  input: GenerateQuoteDraftInput,
): Promise<GenerateQuoteDraftResult> {
  const [businessRow] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      businessType: businesses.businessType,
      shortDescription: businesses.shortDescription,
      defaultCurrency: businesses.defaultCurrency,
      defaultQuoteNotes: businesses.defaultQuoteNotes,
    })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!businessRow) {
    return {
      ok: false,
      error: "That business could not be found.",
    };
  }

  // --- AI Input Sanitization ---
  const userInputText = [input.brief ?? "", input.revisionComment ?? ""]
    .filter(Boolean)
    .join(" ");

  if (userInputText.trim()) {
    const sanitization = await sanitizeAiInput(userInputText);

    if (sanitization.status === "rejected") {
      await logAiSecurityEvent({
        eventType: "injection_rejected",
        patternMatched: sanitization.patterns.join(", "),
        userId: input.userId,
        businessId: input.businessId,
        rawInput: userInputText,
      });
      return {
        ok: false,
        error: "Your input could not be processed. Please rephrase your request.",
      };
    }

    if (sanitization.status === "sanitized") {
      await logAiSecurityEvent({
        eventType: "injection_detected",
        patternMatched: sanitization.patterns.join(", "),
        userId: input.userId,
        businessId: input.businessId,
        rawInput: userInputText,
      });
      if (input.brief) {
        const briefSanitization = await sanitizeAiInput(input.brief);
        if (briefSanitization.status !== "rejected") {
          input = { ...input, brief: briefSanitization.output };
        }
      }
      if (input.revisionComment) {
        const revisionSanitization = await sanitizeAiInput(input.revisionComment);
        if (revisionSanitization.status !== "rejected") {
          input = { ...input, revisionComment: revisionSanitization.output };
        }
      }
    }
  }

  const currency = businessRow.defaultCurrency;

  // Stage A: inquiry context.
  const inquiryContext = input.inquiryId
    ? await getInquiryAssistantContextForBusiness({
        businessId: input.businessId,
        inquiryId: input.inquiryId,
      })
    : null;

  if (input.inquiryId && !inquiryContext) {
    return {
      ok: false,
      error: "That linked inquiry could not be found.",
    };
  }

  const inquiryText = inquiryContext
    ? [
        inquiryContext.inquiry.subject ?? "",
        inquiryContext.inquiry.details ?? "",
        inquiryContext.inquiry.serviceName ?? "",
      ]
        .filter(Boolean)
        .join(" ")
    : input.brief ?? "";

  // Stage B: retrieve knowledge evidence and pricing candidates.
  const stageB = await retrieveStageB({
    businessId: input.businessId,
    queryText: inquiryText,
    currency,
  });

  const inquiryContextText = inquiryContext
    ? await formatInquiryContextLines(inquiryContext)
    : input.brief?.trim()
      ? `Owner brief:\n${truncate(input.brief, 2000)}`
      : "";

  const taskType = "quote_draft" as const;
  const revisionContext = input.revisionComment?.trim() || null;
  const currentItemsText = input.currentItems?.trim() || null;

  // AI-01 (a): pack guidance injected into grounded-context assembly.
  const packGuidance = await resolvePackGuidance(input.businessId, businessRow.businessType);

  // Stage C: structured draft generation.
  const systemInstructions = buildQuoteDraftPrompt(
    buildGroundedContext({
      inquiryContextText,
      candidates: stageB.candidates,
      evidence: stageB.evidence,
      revisionContext,
      currentItemsText,
      packGuidanceText: packGuidance.sectionText,
    }),
  );

  const userMessage = [
    "Business and inquiry context is below. Generate the quote draft now.",
    "Return zero prices and select pricing candidate ids only — the server applies the saved prices.",
  ].join("\n");

  const taskConfig = {
    temperature: 0.3,
    maxOutputTokens: 4000,
    qualityTier: "balanced" as const,
    cacheTTL: 3600,
  };

  const promptVersionHash = contentHash(systemInstructions);

  const completionRequest: AiCompletionRequest = {
    messages: [
      { role: "system", content: systemInstructions },
      { role: "user", content: userMessage },
    ],
    temperature: taskConfig.temperature,
    maxOutputTokens: taskConfig.maxOutputTokens,
    qualityTier: taskConfig.qualityTier as AiQualityTier,
    routingProfile: "quote_draft",
    estimatedTokens:
      estimateTokens(systemInstructions + userMessage) +
      taskConfig.maxOutputTokens,
  };

  // Cache fingerprint: prompt version + template hash + source data hashes.
  const cacheKey: CacheKeyComponents = {
    businessId: input.businessId,
    userId: input.userId,
    taskType,
    promptVersion: `${GROUNDED_DRAFT_PROMPT_VERSION}:${promptVersionHash}`,
    modelTier: taskConfig.qualityTier as AiQualityTier,
    sourceDataVersions: buildCacheSourceDataVersions({
      inquiryKey: inquiryContext
        ? `${inquiryContext.inquiry.id}:${inquiryContext.inquiry.createdAt.toISOString()}`
        : null,
      inquiryText,
      candidates: stageB.candidates,
      evidence: stageB.evidence,
      brief: input.brief ?? null,
      revisionComment: input.revisionComment ?? null,
      currentItems: input.currentItems ?? null,
      currentItemsData: input.currentItemsData,
      packGuidanceVersion: packGuidance.fingerprint,
    }),
  };

  const cachedOutput = await getCachedOutput(cacheKey);

  if (cachedOutput) {
    // Cache hit: re-run the deterministic hydration/verification so the
    // cached response is never trusted without verification.
    const cachedJson = extractJsonObject(cachedOutput.text);

    if (cachedJson) {
      try {
        const cachedParsed = JSON.parse(cachedJson);
        const cachedValidation = groundedDraftResponseSchema.safeParse(cachedParsed);

        if (cachedValidation.success) {
          const cachedDraft = await finalizeDraft({
            businessId: input.businessId,
            userId: input.userId,
            plan: input.plan,
            taskType,
            title: cachedValidation.data.title,
            notes: cachedValidation.data.notes,
            rationale: cachedValidation.data.rationale,
            pricingLibraryEntryId: cachedValidation.data.pricingLibraryEntryId,
            rawItems: cachedValidation.data.items,
            rawMissingInfo: cachedValidation.data.missingInfo,
            rawClarification: cachedValidation.data.clarificationMessage,
            candidates: stageB.candidates,
            currency,
            evidenceById: stageB.evidenceById,
            currentItemsData: (input as GenerateQuoteDraftInput).currentItemsData ?? null,
            model: cachedOutput.model,
            provider: cachedOutput.provider as AiProviderName,
            taskConfig: { ...taskConfig, cacheTTL: 0 },
            cacheKey,
            responseText: cachedOutput.text,
            responseUsage: cachedOutput.usage,
            responseModel: cachedOutput.model,
            responseProvider: cachedOutput.provider,
            startTime: Date.now(),
            fromCache: true,
            usageReservation: input.usageReservation,
          });

          if (cachedDraft) {
            const cacheStartTime = Date.now();
            await logAiInvocation({
              userId: input.userId,
              businessId: input.businessId,
              taskType,
              model: cachedOutput.model,
              provider: cachedOutput.provider,
              inputTokens: 0,
              outputTokens: 0,
              cacheHit: true,
              latencyMs: Date.now() - cacheStartTime,
              status: "success",
            }).catch((logError) => {
              console.warn("[quote-generator] Failed to log cache hit:", logError);
            });

            return { ok: true, draft: cachedDraft };
          }
        }
      } catch {
        // Cached data is corrupt — fall through to fresh generation.
      }
    }
  }

  // Cache miss: invoke AI.
  const startTime = Date.now();

  try {
    const response = await generateWithFallback(completionRequest);

    // --- AI Output Filtering ---
    // The fragments must be instruction text the model would only echo when
    // it leaked the system prompt. Schema field names ("matchType",
    // "unitPriceInCents") are part of the requested JSON shape and must never
    // be listed here — redacting them would corrupt the structured output.
    const outputFilterResult = filterAiOutput(
      response.text,
      [
        "MONETARY RULES (CRITICAL",
        "You NEVER set prices",
        "PACKAGE RULES:",
      ],
      { canaryToken: getAiCanaryToken() },
    );
    if (outputFilterResult.status === "redacted") {
      await logAiSecurityEvent({
        eventType: "output_redacted",
        patternMatched: outputFilterResult.redactedPatterns.join(", "),
        userId: input.userId,
        businessId: input.businessId,
        rawInput: response.text.slice(0, 200),
      });
    }
    const filteredResponseText = outputFilterResult.output;

    const parsed = await parseModelDraftResponse(filteredResponseText);

    if (!parsed) {
      return {
        ok: false,
        error: "The assistant returned an incomplete draft. Try again.",
      };
    }

    const draft = await finalizeDraft({
      businessId: input.businessId,
      userId: input.userId,
      plan: input.plan,
      taskType,
      title: parsed.title,
      notes: parsed.notes,
      rationale: parsed.rationale,
      pricingLibraryEntryId: parsed.pricingLibraryEntryId,
      rawItems: parsed.items,
      rawMissingInfo: parsed.missingInfo,
      rawClarification: parsed.clarificationMessage,
      candidates: stageB.candidates,
      currency,
      evidenceById: stageB.evidenceById,
      model: response.model,
      provider: response.provider as AiProviderName,
      taskConfig,
      cacheKey,
      responseText: response.text,
      responseUsage: response.usage,
      responseModel: response.model,
      responseProvider: response.provider,
      startTime,
      pack: packGuidance.pack,
      packGuidanceRecipeConfig: packGuidance.recipeConfig,
      usageReservation: input.usageReservation,
    });

    if (!draft) {
      return {
        ok: false,
        error: "The assistant returned no usable line items. Try again.",
      };
    }

    return { ok: true, draft };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "AI provider error";

    await logAiInvocation({
      userId: input.userId,
      businessId: input.businessId,
      taskType,
      model: "unknown",
      provider: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      cacheHit: false,
      latencyMs,
      status: "error",
      errorMessage,
    }).catch((logError) => {
      console.warn("[quote-generator] Failed to log error:", logError);
    });

    console.error("Failed to generate quote draft.", error);

    return {
      ok: false,
      error:
        "The assistant could not generate a quote draft right now. Try again in a moment.",
    };
  }
}

// ---------------------------------------------------------------------------
// Quote improvement
// ---------------------------------------------------------------------------

type GenerateQuoteImprovementInput = {
  businessId: string;
  userId: string;
  /** Effective plan for the business — scopes the recorded credit weight. */
  plan: PlanTier;
  inquiryId: string;
  existingQuoteDraft: string;
  /**
   * The reserved credit for this invocation. The reserved row settles with
   * the real token weight instead of a second usage row being written.
   */
  usageReservation?: UsageReservation;
};

type GenerateQuoteImprovementResult =
  | { ok: true; draft: AiQuoteDraft }
  | { ok: false; error: string };

export async function generateQuoteImprovementForBusiness(
  input: GenerateQuoteImprovementInput,
): Promise<GenerateQuoteImprovementResult> {
  const [businessRow] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      slug: businesses.slug,
      businessType: businesses.businessType,
      shortDescription: businesses.shortDescription,
      defaultCurrency: businesses.defaultCurrency,
      defaultQuoteNotes: businesses.defaultQuoteNotes,
    })
    .from(businesses)
    .where(eq(businesses.id, input.businessId))
    .limit(1);

  if (!businessRow) {
    return {
      ok: false,
      error: "That business could not be found.",
    };
  }

  // --- AI Input Sanitization ---
  if (input.existingQuoteDraft.trim()) {
    const sanitization = await sanitizeAiInput(input.existingQuoteDraft);

    if (sanitization.status === "rejected") {
      await logAiSecurityEvent({
        eventType: "injection_rejected",
        patternMatched: sanitization.patterns.join(", "),
        userId: input.userId,
        businessId: input.businessId,
        rawInput: input.existingQuoteDraft,
      });
      return {
        ok: false,
        error: "Your input could not be processed. Please rephrase your request.",
      };
    }

    if (sanitization.status === "sanitized") {
      await logAiSecurityEvent({
        eventType: "injection_detected",
        patternMatched: sanitization.patterns.join(", "),
        userId: input.userId,
        businessId: input.businessId,
        rawInput: input.existingQuoteDraft,
      });
      input = { ...input, existingQuoteDraft: sanitization.output };
    }
  }

  const currency = businessRow.defaultCurrency;

  // Stage A: inquiry context.
  const inquiryContext = await getInquiryAssistantContextForBusiness({
    businessId: input.businessId,
    inquiryId: input.inquiryId,
  });

  if (!inquiryContext) {
    return {
      ok: false,
      error: "That linked inquiry could not be found.",
    };
  }

  const inquiryText = [
    inquiryContext.inquiry.subject ?? "",
    inquiryContext.inquiry.details ?? "",
    inquiryContext.inquiry.serviceName ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  // Stage B: retrieve knowledge evidence and pricing candidates.
  const stageB = await retrieveStageB({
    businessId: input.businessId,
    queryText: inquiryText,
    currency,
  });

  const inquiryContextText = await formatInquiryContextLines(inquiryContext);
  const taskType = "quote_improvement" as const;

  // AI-01 (a): pack guidance injected into grounded-context assembly.
  const packGuidance = await resolvePackGuidance(input.businessId, businessRow.businessType);

  const systemInstructions = buildQuoteImprovementPrompt(
    buildGroundedContext({
      inquiryContextText,
      candidates: stageB.candidates,
      evidence: stageB.evidence,
      existingDraftText: input.existingQuoteDraft,
      packGuidanceText: packGuidance.sectionText,
    }),
  );

  const userMessage = [
    "Improve the existing quote draft based on the context above.",
    "Return zero prices and select pricing candidate ids only — the server applies the saved prices.",
  ].join("\n");

  const taskConfig = {
    temperature: 0.3,
    maxOutputTokens: 4000,
    qualityTier: "balanced" as const,
    cacheTTL: 3600,
  };

  const promptVersionHash = contentHash(systemInstructions);

  const completionRequest: AiCompletionRequest = {
    messages: [
      { role: "system", content: systemInstructions },
      { role: "user", content: userMessage },
    ],
    temperature: taskConfig.temperature,
    maxOutputTokens: taskConfig.maxOutputTokens,
    qualityTier: taskConfig.qualityTier as AiQualityTier,
    routingProfile: "quote_improvement",
    estimatedTokens:
      estimateTokens(systemInstructions + userMessage) +
      taskConfig.maxOutputTokens,
  };

  const cacheKey: CacheKeyComponents = {
    businessId: input.businessId,
    userId: input.userId,
    taskType,
    promptVersion: `${GROUNDED_IMPROVEMENT_PROMPT_VERSION}:${promptVersionHash}`,
    modelTier: taskConfig.qualityTier as AiQualityTier,
    sourceDataVersions: buildCacheSourceDataVersions({
      inquiryKey: `${inquiryContext.inquiry.id}:${inquiryContext.inquiry.createdAt.toISOString()}`,
      inquiryText,
      candidates: stageB.candidates,
      evidence: stageB.evidence,
      brief: input.existingQuoteDraft.slice(0, 4000) ?? null,
      revisionComment: null,
      currentItems: null,
      currentItemsData: null,
      packGuidanceVersion: packGuidance.fingerprint,
    }),
  };

  const cachedOutput = await getCachedOutput(cacheKey);

  if (cachedOutput) {
    const cachedJson = extractJsonObject(cachedOutput.text);

    if (cachedJson) {
      try {
        const cachedParsed = JSON.parse(cachedJson);
        const cachedValidation = groundedDraftResponseSchema.safeParse(cachedParsed);

        if (cachedValidation.success) {
          const cachedDraft = await finalizeDraft({
            businessId: input.businessId,
            userId: input.userId,
            plan: input.plan,
            taskType,
            title: cachedValidation.data.title,
            notes: cachedValidation.data.notes,
            rationale: cachedValidation.data.rationale,
            pricingLibraryEntryId: cachedValidation.data.pricingLibraryEntryId,
            rawItems: cachedValidation.data.items,
            rawMissingInfo: cachedValidation.data.missingInfo,
            rawClarification: cachedValidation.data.clarificationMessage,
            candidates: stageB.candidates,
            currency,
            evidenceById: stageB.evidenceById,
            currentItemsData: (input as GenerateQuoteDraftInput).currentItemsData ?? null,
            model: cachedOutput.model,
            provider: cachedOutput.provider as AiProviderName,
            taskConfig: { ...taskConfig, cacheTTL: 0 },
            cacheKey,
            responseText: cachedOutput.text,
            responseUsage: cachedOutput.usage,
            responseModel: cachedOutput.model,
            responseProvider: cachedOutput.provider,
            startTime: Date.now(),
            fromCache: true,
            usageReservation: input.usageReservation,
          });

          if (cachedDraft) {
            const cacheStartTime = Date.now();
            await logAiInvocation({
              userId: input.userId,
              businessId: input.businessId,
              taskType,
              model: cachedOutput.model,
              provider: cachedOutput.provider,
              inputTokens: 0,
              outputTokens: 0,
              cacheHit: true,
              latencyMs: Date.now() - cacheStartTime,
              status: "success",
            }).catch((logError) => {
              console.warn("[quote-generator] Failed to log cache hit:", logError);
            });

            return { ok: true, draft: cachedDraft };
          }
        }
      } catch {
        // Corrupt cache — fall through to fresh generation.
      }
    }
  }

  const startTime = Date.now();

  try {
    const response = await generateWithFallback(completionRequest);

    const outputFilterResult = filterAiOutput(
      response.text,
      [
        "MONETARY RULES (CRITICAL",
        "You NEVER set prices",
        "PACKAGE RULES:",
      ],
      { canaryToken: getAiCanaryToken() },
    );
    if (outputFilterResult.status === "redacted") {
      await logAiSecurityEvent({
        eventType: "output_redacted",
        patternMatched: outputFilterResult.redactedPatterns.join(", "),
        userId: input.userId,
        businessId: input.businessId,
        rawInput: response.text.slice(0, 200),
      });
    }
    const filteredResponseText = outputFilterResult.output;

    const parsed = await parseModelDraftResponse(filteredResponseText);

    if (!parsed) {
      return {
        ok: false,
        error: "The assistant returned an incomplete improved draft. Try again.",
      };
    }

    const draft = await finalizeDraft({
      businessId: input.businessId,
      userId: input.userId,
      plan: input.plan,
      taskType,
      title: parsed.title,
      notes: parsed.notes,
      rationale: parsed.rationale,
      pricingLibraryEntryId: parsed.pricingLibraryEntryId,
      rawItems: parsed.items,
      rawMissingInfo: parsed.missingInfo,
      rawClarification: parsed.clarificationMessage,
      candidates: stageB.candidates,
      currency,
      evidenceById: stageB.evidenceById,
      model: response.model,
      provider: response.provider as AiProviderName,
      taskConfig,
      cacheKey,
      responseText: response.text,
      responseUsage: response.usage,
      responseModel: response.model,
      responseProvider: response.provider,
      startTime,
      pack: packGuidance.pack,
      packGuidanceRecipeConfig: packGuidance.recipeConfig,
      usageReservation: input.usageReservation,
    });

    if (!draft) {
      return {
        ok: false,
        error: "The assistant returned no usable line items. Try again.",
      };
    }

    return { ok: true, draft };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "AI provider error";

    await logAiInvocation({
      userId: input.userId,
      businessId: input.businessId,
      taskType,
      model: "unknown",
      provider: "unknown",
      inputTokens: 0,
      outputTokens: 0,
      cacheHit: false,
      latencyMs,
      status: "error",
      errorMessage,
    }).catch((logError) => {
      console.warn("[quote-generator] Failed to log error:", logError);
    });

    console.error("Failed to improve quote draft.", error);

    return {
      ok: false,
      error:
        "The assistant could not improve the quote draft right now. Try again in a moment.",
    };
  }
}
