"use server";

import { z } from "zod";

import { generateQuoteDraftForBusiness } from "@/features/quote-drafting/quote-generator";
import type { AiQuoteDraftActionState } from "@/features/quote-drafting/types";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { hasFeatureAccess } from "@/lib/plans";
import { releaseUsageReservation, reserveUsage } from "@/lib/ai";
import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import type { AiTaskType } from "@/lib/ai/types";
import { emptyToUndefined, firstString } from "@/lib/zod-helpers";

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

const aiGenerateQuoteDraftSchema = z
  .object({
    businessSlug: z.string().trim().min(1).max(120),
    inquiryId: z.preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z.string().trim().min(1).max(128).optional(),
    ),
    brief: z.preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z.string().trim().max(2000).optional(),
    ),
    revisionComment: z.preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z.string().trim().max(2000).optional(),
    ),
    currentItems: z.preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z.string().trim().max(4000).optional(),
    ),
    currentItemsJson: z.preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z.string().trim().max(20_000).optional(),
    ),
  })
  .superRefine((value, ctx) => {
    if (!value.inquiryId && !value.brief) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["brief"],
        message:
          "Describe the job in a short brief or open this quote from a linked inquiry before generating.",
      });
    }
  });

/**
 * Generate an AI-drafted quote for the current business.
 *
 * Returns a structured draft the client can merge into the quote editor.
 * The action never mutates saved quotes; saving still happens through
 * `createQuoteAction` / `updateQuoteAction`.
 *
 * Pipeline: validate input → check usage limit → invoke quote generator.
 */
export async function generateQuoteDraftAction(
  businessSlug: string,
  prevState: AiQuoteDraftActionState,
  formData: FormData,
): Promise<AiQuoteDraftActionState> {
  void prevState;

  // 1. Validate input (Zod)
  const parsed = aiGenerateQuoteDraftSchema.safeParse({
    businessSlug,
    inquiryId: formData.get("inquiryId"),
    brief: formData.get("brief"),
    revisionComment: formData.get("revisionComment"),
    currentItems: formData.get("currentItems"),
    currentItemsJson: formData.get("currentItemsJson"),
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];

    return {
      error: firstIssue?.message ?? "Check the request and try again.",
    };
  }

  // 2. Check business access
  const actionContext = await getBusinessActionContext({
    businessSlug: parsed.data.businessSlug,
    minimumRole: "staff",
    requireActiveBusiness: true,
    unauthorizedMessage: "You do not have access to that business action.",
  });

  if (!actionContext.ok) {
    return {
      error: actionContext.error,
    };
  }

  // 3. Resolve the effective plan and check feature access
  const businessId = actionContext.businessContext.business.id;
  const userId = actionContext.user.id;
  const plan = await getEffectivePlanForBusiness(businessId);

  if (!hasFeatureAccess(plan, "aiQuoteDrafting")) {
    return {
      error: "AI quote drafting isn't included in your plan.",
    };
  }

  // 4. Reserve usage. The credit is reserved (not merely read): a cached
  // read let every concurrent request pass the same stale total, and
  // `aiQuoteDrafting` ships on every plan, so the monthly pool is the only
  // real cost control on this endpoint.
  const taskType: AiTaskType = "quote_draft";

  const usageCheck = await reserveUsage({
    userId,
    businessId,
    taskType,
    plan,
  });

  if (!usageCheck.allowed) {
    return {
      error: usageCheck.message,
    };
  }

  const usageReservation = usageCheck.reservation;

  // 5. Invoke the quote generator
  let currentItemsData: Array<{
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }> | null = null;
  if (parsed.data.currentItemsJson) {
    try {
      const parsed_items = JSON.parse(parsed.data.currentItemsJson);
      if (Array.isArray(parsed_items)) {
        currentItemsData = parsed_items.filter(
          (item) =>
            item &&
            typeof item.description === "string" &&
            typeof item.quantity === "number" &&
            typeof item.unitPriceInCents === "number",
        );
      }
    } catch {
      // Ignore parse errors - fall back to text-only revision
    }
  }

  const result = await generateQuoteDraftForBusiness({
    businessId,
    userId,
    plan,
    inquiryId: parsed.data.inquiryId ?? null,
    brief: parsed.data.brief ?? null,
    revisionComment: parsed.data.revisionComment ?? null,
    currentItems: parsed.data.currentItems ?? null,
    currentItemsData,
    usageReservation,
  });

  if (!result.ok) {
    // The draft never reached the provider (or produced nothing): release
    // the reserved credit.
    await releaseUsageReservation(usageReservation).catch((error) => {
      console.warn("[ai-quote-draft] Failed to release AI credit:", error);
    });

    return {
      error: result.error,
    };
  }

  return {
    draft: result.draft,
  };
}
