import "server-only";

import { and, eq } from "drizzle-orm";

import type { AiQuoteDraft } from "@/features/ai/types";
import { createQuoteForBusiness } from "@/features/quotes/mutations";
import { quoteEditorSchema } from "@/features/quotes/schemas";
import { getDefaultQuoteValidityDate } from "@/features/quotes/utils";
import { db } from "@/lib/db/client";
import { inquiries } from "@/lib/db/schema";
import { newEntityId } from "@/lib/ids";

/**
 * Persist an AI-generated draft as a real draft quote.
 *
 * The "draft a quote when an inquiry qualifies" setting promised the owner a
 * draft they could open. Generating the draft and discarding it burned the
 * business's AI credits on every qualified inquiry and produced nothing.
 */
export async function createAutoDraftQuote(input: {
  businessId: string;
  inquiryId: string;
  actorUserId: string;
  currency: string;
  draft: AiQuoteDraft;
}): Promise<{ quoteId: string } | null> {
  const { businessId, inquiryId, actorUserId, currency, draft } = input;

  const [inquiry] = await db
    .select({
      id: inquiries.id,
      customerName: inquiries.customerName,
      customerEmail: inquiries.customerEmail,
      customerContactMethod: inquiries.customerContactMethod,
      customerContactHandle: inquiries.customerContactHandle,
      details: inquiries.details,
    })
    .from(inquiries)
    .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)))
    .limit(1);

  if (!inquiry) {
    return null;
  }

  const items = draft.items.map((item) => ({
    id: newEntityId(),
    description: item.description,
    quantity: item.quantity,
    unitPriceInCents: item.unitPriceInCents,
    aiReview: {
      name: item.name,
      pricingSource: item.pricingSource,
      pricingSourceLabel: item.pricingSourceLabel,
      confidence: item.confidence,
      reviewStatus: item.reviewStatus,
      reason: item.reason,
    },
    aiProductStatus: item.aiProductStatus ?? undefined,
    aiEvidence: item.aiEvidence
      ? {
          entryId: item.aiEvidence.entryId,
          itemId: item.aiEvidence.itemId,
          sourceLabel: item.aiEvidence.sourceLabel,
          matchType: item.aiEvidence.matchType,
          reason: item.aiEvidence.reason,
        }
      : undefined,
  }));

  if (items.length === 0) {
    return null;
  }

  const parsed = quoteEditorSchema.safeParse({
    title: draft.title,
    customerName: inquiry.customerName,
    customerEmail: inquiry.customerEmail,
    customerContactMethod: inquiry.customerContactMethod,
    customerContactHandle:
      inquiry.customerContactHandle || inquiry.customerEmail || "",
    notes: draft.notes ?? inquiry.details ?? undefined,
    terms: undefined,
    validUntil: getDefaultQuoteValidityDate(),
    items,
    aiGenerationId: draft.aiGenerationId,
    aiMissingInfo: draft.missingInfo,
  });

  if (!parsed.success) {
    console.error(
      "[ai-auto-draft] Draft failed quote validation:",
      JSON.stringify(parsed.error.issues.slice(0, 5)),
    );
    return null;
  }

  const created = await createQuoteForBusiness({
    businessId,
    actorUserId,
    currency,
    inquiryId,
    quote: parsed.data,
  });

  return created ? { quoteId: created.id } : null;
}
