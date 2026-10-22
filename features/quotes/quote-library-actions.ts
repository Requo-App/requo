"use server";

import { z } from "zod";
import { updateTag } from "next/cache";

import { getValidationActionState } from "@/lib/action-state";
import {
  getBusinessQuoteLibraryCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import { getOperationalBusinessActionContext } from "@/lib/db/business-access";
import {
  createQuoteLibraryEntryForBusiness,
  deleteQuoteLibraryEntryForBusiness,
  updateQuoteLibraryEntryForBusiness,
} from "@/features/quotes/quote-library-mutations";
import {
  quoteLibraryEntryIdSchema,
  quoteLibraryEntrySchema,
} from "@/features/quotes/quote-library-schemas";
import { getQuoteWithItemsForBusiness } from "@/features/quotes/queries";
import { getQuoteLibrarySummaryForBusiness } from "@/features/quotes/quote-library-queries";
import { hasFeatureAccess } from "@/lib/plans";
import { getUsageLimit } from "@/lib/plans/usage-limits";
import type {
  QuoteLibraryActionState,
  QuoteLibraryDeleteActionState,
} from "@/features/quotes/types";

const initialQuoteLibraryState: QuoteLibraryActionState = {};
const initialQuoteLibraryDeleteState: QuoteLibraryDeleteActionState = {};

function updateCacheTags(tags: string[]) {
  for (const tag of uniqueCacheTags(tags)) {
    updateTag(tag);
  }
}

function mapQuoteLibraryFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
) {
  return {
    kind: fieldErrors.kind,
    name: fieldErrors.name,
    description: fieldErrors.description,
    title: fieldErrors.title,
    notes: fieldErrors.notes,
    terms: fieldErrors.terms,
    validityDays: fieldErrors.validityDays,
    items: fieldErrors.items,
  };
}

export async function createQuoteLibraryEntryAction(
  prevState: QuoteLibraryActionState = initialQuoteLibraryState,
  formData: FormData,
): Promise<QuoteLibraryActionState> {
  void prevState;

  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  if (!hasFeatureAccess(businessContext.business.plan, "quoteLibrary")) {
    return {
      error: "Upgrade to Pro to save pricing library entries.",
    };
  }

  const validationResult = quoteLibraryEntrySchema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    description: formData.get("description"),
    title: formData.get("title"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
    validityDays: formData.get("validityDays"),
    items: formData.get("items"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the highlighted fields and try again.",
      mapQuoteLibraryFieldErrors,
    );
  }

  const pricingEntryLimit = getUsageLimit(
    businessContext.business.plan,
    "quoteLibraryEntriesPerBusiness",
  );

  if (pricingEntryLimit !== null) {
    const summary = await getQuoteLibrarySummaryForBusiness(
      businessContext.business.id,
    );

    if (summary.entryCount >= pricingEntryLimit) {
      return {
        error: `This plan supports ${pricingEntryLimit} saved pricing entries. Remove an entry or upgrade to save another.`,
      };
    }
  }

  try {
    await createQuoteLibraryEntryForBusiness({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      currency: businessContext.business.defaultCurrency,
      entry: validationResult.data,
    });

    updateCacheTags(getBusinessQuoteLibraryCacheTags(businessContext.business.id));

    const kindLabel =
      validationResult.data.kind === "block"
        ? "Pricing block"
        : validationResult.data.kind === "template"
          ? "Quote template"
          : "Service package";

    return {
      success: `${kindLabel} saved.`,
    };
  } catch (error) {
    console.error("Failed to create pricing library entry.", error);

    return {
      error: "We couldn't save that pricing entry right now.",
    };
  }
}

const saveQuoteLineItemToPricingSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Enter a line item description.")
    .max(400, "Line item descriptions must be 400 characters or fewer."),
  quantity: z.coerce.number().int().min(1).max(999_999),
  unitPriceInCents: z.coerce
    .number()
    .int()
    .min(1, "Set a unit price before saving to pricing."),
});

export type SaveQuoteLineItemToPricingResult =
  | { ok: true; entryName: string }
  | { ok: false; error: string };

export async function saveQuoteLineItemToPricingLibrary(
  input: z.infer<typeof saveQuoteLineItemToPricingSchema>,
): Promise<SaveQuoteLineItemToPricingResult> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      ok: false,
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  if (!hasFeatureAccess(businessContext.business.plan, "quoteLibrary")) {
    return {
      ok: false,
      error: "Upgrade to Pro to save pricing library entries.",
    };
  }

  const validationResult = saveQuoteLineItemToPricingSchema.safeParse(input);

  if (!validationResult.success) {
    return {
      ok: false,
      error:
        validationResult.error.issues[0]?.message ??
        "Check the line item and try again.",
    };
  }

  const { description, quantity, unitPriceInCents } = validationResult.data;
  const entryName =
    description.length > 120 ? `${description.slice(0, 117).trimEnd()}...` : description;

  const pricingEntryLimit = getUsageLimit(
    businessContext.business.plan,
    "quoteLibraryEntriesPerBusiness",
  );

  if (pricingEntryLimit !== null) {
    const summary = await getQuoteLibrarySummaryForBusiness(
      businessContext.business.id,
    );

    if (summary.entryCount >= pricingEntryLimit) {
      return {
        ok: false,
        error: `This plan supports ${pricingEntryLimit} saved pricing entries. Remove an entry or upgrade to save another.`,
      };
    }
  }

  try {
    await createQuoteLibraryEntryForBusiness({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      currency: businessContext.business.defaultCurrency,
      entry: {
        kind: "block",
        name: entryName,
        items: [
          {
            id: crypto.randomUUID(),
            description,
            quantity,
            unitPriceInCents,
          },
        ],
      },
    });

    updateCacheTags(getBusinessQuoteLibraryCacheTags(businessContext.business.id));

    return {
      ok: true,
      entryName,
    };
  } catch (error) {
    console.error("Failed to save quote line item to pricing library.", error);

    return {
      ok: false,
      error: "We couldn't save that line item to pricing right now.",
    };
  }
}

export async function saveQuoteAsTemplateAction(
  quoteId: string,
): Promise<QuoteLibraryActionState> {
  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;

  if (!hasFeatureAccess(businessContext.business.plan, "quoteLibrary")) {
    return { error: "Upgrade to Pro to save quote templates." };
  }

  const quote = await getQuoteWithItemsForBusiness({
    businessId: businessContext.business.id,
    quoteId,
  });

  if (!quote) {
    return { error: "That quote could not be found." };
  }

  // Calculate validity days from validUntil
  const validUntilDate = new Date(quote.validUntil);
  const createdDate = new Date(quote.createdAt);
  const validityDays = Math.max(
    1,
    Math.min(
      365,
      Math.ceil(
        (validUntilDate.getTime() - createdDate.getTime()) /
          (1000 * 60 * 60 * 24),
      ),
    ),
  );

  const pricingEntryLimit = getUsageLimit(
    businessContext.business.plan,
    "quoteLibraryEntriesPerBusiness",
  );

  if (pricingEntryLimit !== null) {
    const summary = await getQuoteLibrarySummaryForBusiness(
      businessContext.business.id,
    );

    if (summary.entryCount >= pricingEntryLimit) {
      return {
        error: `This plan supports ${pricingEntryLimit} saved pricing entries. Remove an entry or upgrade to save another.`,
      };
    }
  }

  try {
    await createQuoteLibraryEntryForBusiness({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      currency: businessContext.business.defaultCurrency,
      entry: {
        kind: "template",
        name: quote.title.slice(0, 100),
        title: quote.title,
        notes: quote.notes ?? undefined,
        terms: quote.terms ?? undefined,
        validityDays,
        items: quote.items.map((item) => ({
          id: crypto.randomUUID(),
          description: item.description,
          quantity: item.quantity,
          unitPriceInCents: item.unitPriceInCents,
        })),
      },
    });

    updateCacheTags(getBusinessQuoteLibraryCacheTags(businessContext.business.id));

    return { success: "Quote saved as template." };
  } catch (error) {
    console.error("Failed to save quote as template.", error);

    return { error: "We couldn't save that quote as a template right now." };
  }
}

export async function updateQuoteLibraryEntryAction(
  entryId: string,
  prevState: QuoteLibraryActionState = initialQuoteLibraryState,
  formData: FormData,
): Promise<QuoteLibraryActionState> {
  void prevState;

  const parsedId = quoteLibraryEntryIdSchema.safeParse(entryId);

  if (!parsedId.success) {
    return {
      error: "That pricing entry could not be found.",
    };
  }

  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  if (!hasFeatureAccess(businessContext.business.plan, "quoteLibrary")) {
    return {
      error: "Upgrade to Pro to update pricing library entries.",
    };
  }

  const validationResult = quoteLibraryEntrySchema.safeParse({
    kind: formData.get("kind"),
    name: formData.get("name"),
    description: formData.get("description"),
    title: formData.get("title"),
    notes: formData.get("notes"),
    terms: formData.get("terms"),
    validityDays: formData.get("validityDays"),
    items: formData.get("items"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the highlighted fields and try again.",
      mapQuoteLibraryFieldErrors,
    );
  }

  try {
    const result = await updateQuoteLibraryEntryForBusiness({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      entryId: parsedId.data,
      entry: validationResult.data,
    });

    if (!result) {
      return {
        error: "That pricing entry could not be found.",
      };
    }

    updateCacheTags(getBusinessQuoteLibraryCacheTags(businessContext.business.id));

    const kindLabel =
      validationResult.data.kind === "block"
        ? "Pricing block"
        : validationResult.data.kind === "template"
          ? "Quote template"
          : "Service package";

    return {
      success: `${kindLabel} updated.`,
    };
  } catch (error) {
    console.error("Failed to update pricing library entry.", error);

    return {
      error: "We couldn't update that pricing entry right now.",
    };
  }
}

export async function deleteQuoteLibraryEntryAction(
  entryId: string,
  prevState: QuoteLibraryDeleteActionState = initialQuoteLibraryDeleteState,
  formData: FormData,
): Promise<QuoteLibraryDeleteActionState> {
  void prevState;
  void formData;

  const parsedId = quoteLibraryEntryIdSchema.safeParse(entryId);

  if (!parsedId.success) {
    return {
      error: "That pricing entry could not be found.",
    };
  }

  const ownerAccess = await getOperationalBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  if (!hasFeatureAccess(businessContext.business.plan, "quoteLibrary")) {
    return {
      error: "Upgrade to Pro to delete pricing library entries.",
    };
  }

  try {
    const result = await deleteQuoteLibraryEntryForBusiness({
      businessId: businessContext.business.id,
      actorUserId: user.id,
      entryId: parsedId.data,
    });

    if (!result) {
      return {
        error: "That pricing entry could not be found.",
      };
    }

    updateCacheTags(getBusinessQuoteLibraryCacheTags(businessContext.business.id));
    return {
      success: true,
    };
  } catch (error) {
    console.error("Failed to delete pricing library entry.", error);

    return {
      error: "We couldn't delete that pricing entry right now.",
    };
  }
}
