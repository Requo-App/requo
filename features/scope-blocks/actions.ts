"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { upsertScopeBlockForQuote, waiveScopeBlockForQuote } from "@/features/scope-blocks/mutations";
import { getBusinessQuoteDetailCacheTags } from "@/lib/cache/business-tags";
import { getBusinessActionContext } from "@/lib/db/business-access";
import { invalidateCacheTags } from "@/lib/cache/business-tags";
import { getBusinessQuotePath } from "@/features/businesses/routes";
import { isScopeBlockKind } from "@/features/scope-blocks/schemas";

const quoteIdSchema = z.string().min(1).max(128);

export async function saveQuoteScopeBlockAction(
  quoteIdInput: string,
  kindInput: string,
  _previousState: { error?: string; success?: string },
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const access = await getBusinessActionContext({
    minimumRole: "manager",
    requireActiveBusiness: true,
    unauthorizedMessage: "Only an owner or manager can update quote scope.",
  });

  if (!access.ok) return { error: access.error };

  const parsedQuoteId = quoteIdSchema.safeParse(quoteIdInput);
  if (!parsedQuoteId.success || !isScopeBlockKind(kindInput)) {
    return { error: "This quote scope section could not be saved." };
  }

  const rawContent = formData.get("content");
  if (typeof rawContent !== "string") {
    return { error: "Add the scope details, then try again." };
  }

  let content: unknown;
  try {
    content = JSON.parse(rawContent);
  } catch {
    return { error: "The scope details could not be read. Review them and try again." };
  }

  try {
    await upsertScopeBlockForQuote({
      businessId: access.businessContext.business.id,
      quoteId: parsedQuoteId.data,
      kind: kindInput,
      content,
      actorUserId: access.user.id,
    });
  } catch {
    return { error: "We couldn't save this scope section. Review the details and try again." };
  }

  invalidateCacheTags(
    getBusinessQuoteDetailCacheTags(
      access.businessContext.business.id,
      parsedQuoteId.data,
    ),
  );
  revalidatePath(
    getBusinessQuotePath(access.businessContext.business.slug, parsedQuoteId.data),
  );

  return { success: "Quote scope saved." };
}

/**
 * Waive a required scope section with a manager-or-above approval and a
 * required reason. Works for an existing (incomplete) block and for a
 * required kind that has no row yet, which is the case the send gate reports
 * as "missing".
 */
export async function waiveQuoteScopeBlockAction(
  quoteIdInput: string,
  blockIdInput: string,
  _previousState: { error?: string; success?: string },
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const access = await getBusinessActionContext({
    minimumRole: "manager",
    requireActiveBusiness: true,
    unauthorizedMessage:
      "Only an owner or manager can waive a quote scope section.",
  });

  if (!access.ok) return { error: access.error };

  const parsedQuoteId = quoteIdSchema.safeParse(quoteIdInput);
  const kindInput = formData.get("kind");

  if (!parsedQuoteId.success || !isScopeBlockKind(kindInput)) {
    return { error: "This quote scope section could not be waived." };
  }

  const reason = formData.get("reason");

  if (typeof reason !== "string" || !reason.trim()) {
    return { error: "Add a reason for waiving this section." };
  }

  try {
    await waiveScopeBlockForQuote({
      businessId: access.businessContext.business.id,
      quoteId: parsedQuoteId.data,
      blockId: blockIdInput.trim() || null,
      kind: kindInput,
      reason,
      actorUserId: access.user.id,
      actorRole: access.businessContext.role,
      actorName: access.user.name ?? null,
      actorEmail: access.user.email ?? null,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error && error.message
          ? error.message
          : "We couldn't waive this scope section. Try again.",
    };
  }

  invalidateCacheTags(
    getBusinessQuoteDetailCacheTags(
      access.businessContext.business.id,
      parsedQuoteId.data,
    ),
  );
  revalidatePath(
    getBusinessQuotePath(access.businessContext.business.slug, parsedQuoteId.data),
  );

  return { success: "Scope section waived." };
}
