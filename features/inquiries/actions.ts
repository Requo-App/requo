"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getValidationActionState } from "@/lib/action-state";
import { runRecordAction } from "@/lib/actions/run-record-action";
import {
  getBusinessInquiryDetailCacheTags,
  getBusinessInquiryFormsCacheTags,
  getBusinessInquiryListCacheTags,
  uniqueCacheTags,
  updateCacheTags,
} from "@/lib/cache/business-tags";
import {
  getWorkspaceBusinessActionContext,
} from "@/lib/db/business-access";
import { getEffectivePlanForBusiness } from "@/lib/billing/subscription-service";
import { assertPublicActionRateLimit } from "@/lib/rate-limit/redis-rate-limiter";
import {
  addInquiryNoteForBusiness,
  archiveInquiryForBusiness,
  bulkArchiveInquiriesForBusiness,
  bulkChangeInquiryStatusForBusiness,
  bulkDeleteInquiriesForBusiness,
  bulkUnarchiveInquiriesForBusiness,
  changeInquiryStatusForBusiness,
  createManualInquirySubmission,
  createPublicInquirySubmission,
  deleteInquiryForBusiness,
  markInquiryViewedForBusiness,
  unarchiveInquiryForBusiness,
} from "@/features/inquiries/mutations";
import {
  getInquiryEditorFormForBusiness,
  getPublicInquiryBusinessByFormSlug,
  getPublicInquiryBusinessBySlug,
} from "@/features/inquiries/queries";
import {
  inquiryFormSelectionSchema,
  inquiryNoteSchema,
  inquiryStatusChangeSchema,
  validateManualQuickInquirySubmission,
  validatePublicInquirySubmission,
} from "@/features/inquiries/schemas";
import { getBusinessInquiryPath } from "@/features/businesses/routes";
import type {
  InquiryBulkActionState,
  InquiryRecordActionState,
  InquiryNoteActionState,
  InquiryStatusActionState,
  ManualInquiryActionState,
  PublicInquiryFormState,
} from "@/features/inquiries/types";
import { getInquiryStatusLabel } from "@/features/inquiries/utils";
import {
  getPublicInquiryAttachmentMaxBytes,
  resolveInquiryFormConfigForPlan,
} from "@/features/inquiries/plan-rules";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { sendPushInquiryReceivedEvent } from "@/lib/inngest/send";

function getTextValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : null;
}

function getInquiryMutationCacheTags(businessId: string, inquiryId: string) {
  return uniqueCacheTags([
    ...getBusinessInquiryListCacheTags(businessId),
    ...getBusinessInquiryDetailCacheTags(businessId, inquiryId),
  ]);
}

const publicInquirySubmitRateLimit = {
  limit: 4,
  windowMs: 10 * 60 * 1000,
} as const;

function getSubmittedPublicInquiryUrl(business: {
  slug: string;
  form: { isDefault: boolean; slug: string };
}) {
  const pagePath = getBusinessPublicInquiryUrl(
    business.slug,
    business.form.isDefault ? undefined : business.form.slug,
  );

  return `${pagePath}?submitted=1`;
}

export async function submitPublicInquiryAction(
  slug: string,
  formSlug: string | null,
  _prevState: PublicInquiryFormState,
  formData: FormData,
): Promise<PublicInquiryFormState> {
  const honeypotValue = getTextValue(formData, "website")?.trim();

  const business = formSlug
    ? await getPublicInquiryBusinessByFormSlug({
        businessSlug: slug,
        formSlug,
      })
    : await getPublicInquiryBusinessBySlug(slug);

  if (!business) {
    return {
      error: "This inquiry page is unavailable right now.",
    };
  }

  if (honeypotValue) {
    redirect(getSubmittedPublicInquiryUrl(business));
  }

  const allowed = await assertPublicActionRateLimit({
    action: "public-inquiry-submit",
    scope: `${business.id}:${business.form.id}`,
    ...publicInquirySubmitRateLimit,
  });

  if (!allowed) {
    return {
      error: "Too many inquiry attempts. Please wait a few minutes before trying again.",
    };
  }

  const plan = await getEffectivePlanForBusiness(business.id);

  const effectiveFormConfig = resolveInquiryFormConfigForPlan(
    business.inquiryFormConfig,
    plan,
  );
  const validationResult = validatePublicInquirySubmission(
    effectiveFormConfig,
    formData,
    {
      maxAttachmentSizeBytes:
        getPublicInquiryAttachmentMaxBytes(plan),
    },
  );

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Check the highlighted fields and try again.");
  }

  try {
    const createdInquiry = await createPublicInquirySubmission({
      business,
      submission: validationResult.data,
    });

    updateCacheTags([
      ...getInquiryMutationCacheTags(business.id, createdInquiry.inquiryId),
      ...getBusinessInquiryFormsCacheTags(business.id),
    ]);

    void sendPushInquiryReceivedEvent({
      businessId: business.id,
      inquiryId: createdInquiry.inquiryId,
      businessSlug: slug,
      customerName: validationResult.data.customerName,
    }).catch((error) => {
      console.error("Failed to queue push notification for new inquiry.", error);
    });

  } catch (error) {
    console.error("Failed to submit public inquiry.", error);

    return {
      error: "We couldn't submit your inquiry right now. Please try again.",
    };
  }

  redirect(getSubmittedPublicInquiryUrl(business));
}

export async function createManualInquiryAction(
  _prevState: ManualInquiryActionState,
  formData: FormData,
): Promise<ManualInquiryActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const formSelectionResult = inquiryFormSelectionSchema.safeParse({
    formSlug: formData.get("formSlug"),
  });

  if (!formSelectionResult.success) {
    return getValidationActionState(
      formSelectionResult.error,
      "Choose an inquiry form.",
    );
  }

  const selectedForm = await getInquiryEditorFormForBusiness({
    businessId: businessContext.business.id,
    formSlug: formSelectionResult.data.formSlug,
  });

  if (!selectedForm) {
    return {
      error: "That inquiry form is unavailable.",
      fieldErrors: {
        formSlug: ["Choose an active inquiry form."],
      },
    };
  }

  const effectiveFormConfig = resolveInquiryFormConfigForPlan(
    selectedForm.inquiryFormConfig,
    businessContext.business.plan,
  );
  const validationResult = validateManualQuickInquirySubmission(
    effectiveFormConfig,
    formData,
    {
      maxAttachmentSizeBytes: getPublicInquiryAttachmentMaxBytes(
        businessContext.business.plan,
      ),
    },
  );

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the highlighted fields and try again.",
    );
  }

  let inquiryPath: string | null = null;

  try {
    const createdInquiry = await createManualInquirySubmission({
      business: {
        id: businessContext.business.id,
        name: businessContext.business.name,
        slug: businessContext.business.slug,
        form: {
          id: selectedForm.id,
          name: selectedForm.name,
          slug: selectedForm.slug,
          businessType: selectedForm.businessType,
          isDefault: selectedForm.isDefault,
          publicInquiryEnabled: selectedForm.publicInquiryEnabled,
        },
      },
      submission: validationResult.data,
      actorUserId: user.id,
    });

    updateCacheTags(
      getInquiryMutationCacheTags(
        businessContext.business.id,
        createdInquiry.inquiryId,
      ),
    );

    inquiryPath = getBusinessInquiryPath(
      businessContext.business.slug,
      createdInquiry.inquiryId,
    );
  } catch (error) {
    console.error("Failed to create manual inquiry.", error);

    return {
      error: "We couldn't create that inquiry right now.",
    };
  }

  if (inquiryPath) {
    redirect(inquiryPath);
  }

  return {
    error: "We couldn't create that inquiry right now.",
  };
}

export async function addInquiryNoteAction(
  inquiryId: string,
  _prevState: InquiryNoteActionState,
  formData: FormData,
): Promise<InquiryNoteActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = inquiryNoteSchema.safeParse({
    body: formData.get("body"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Check the note and try again.");
  }

  try {
    const result = await addInquiryNoteForBusiness({
      businessId: businessContext.business.id,
      inquiryId,
      authorUserId: user.id,
      body: validationResult.data.body,
    });

    if (!result) {
      return {
        error: "That inquiry could not be found.",
      };
    }

    updateCacheTags(getInquiryMutationCacheTags(businessContext.business.id, inquiryId));
    return {
      success: "Internal note added.",
    };
  } catch (error) {
    console.error("Failed to add inquiry note.", error);

    return {
      error: "We couldn't save that note right now.",
    };
  }
}

export async function changeInquiryStatusAction(
  inquiryId: string,
  _prevState: InquiryStatusActionState,
  formData: FormData,
): Promise<InquiryStatusActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  const validationResult = inquiryStatusChangeSchema.safeParse({
    status: formData.get("status"),
  });

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Choose a valid status.");
  }

  try {
    const result = await changeInquiryStatusForBusiness({
      businessId: businessContext.business.id,
      inquiryId,
      actorUserId: user.id,
      nextStatus: validationResult.data.status,
    });

    if (!result) {
      return {
        error: "That inquiry could not be found.",
      };
    }

    updateCacheTags(getInquiryMutationCacheTags(businessContext.business.id, inquiryId));
    if (result.locked) {
      return {
        error: "Unarchive this inquiry before updating its workflow status.",
      };
    }

    if (!result.changed) {
      return {
        success: `Inquiry is already ${getInquiryStatusLabel(result.nextStatus)}.`,
      };
    }

    return {
      success: `Inquiry moved to ${getInquiryStatusLabel(result.nextStatus)}.`,
    };
  } catch (error) {
    console.error("Failed to change inquiry status.", error);

    return {
      error: "We couldn't update the inquiry status right now.",
    };
  }
}

async function runInquiryRecordAction(
  inquiryId: string,
  mutation: (input: {
    businessId: string;
    inquiryId: string;
    actorUserId: string;
  }) => Promise<
    | {
        changed: boolean;
        deleted?: boolean;
        locked?: boolean;
        lockedReason?: "archived";
      }
    | null
  >,
  messages: {
    success: string;
    unchanged: string;
    missing?: string;
    archivedLocked?: string;
    fallbackError: string;
    redirectHref?: string;
  },
): Promise<InquiryRecordActionState> {
  return runRecordAction<InquiryRecordActionState, {
    changed: boolean;
    deleted?: boolean;
    locked?: boolean;
    lockedReason?: "archived";
  }>({
    runMutation: ({ businessId, actorUserId }) =>
      mutation({ businessId, inquiryId, actorUserId }),
    missingError: messages.missing ?? "That inquiry could not be found.",
    lockedError: (result) =>
      result.locked
        ? (messages.archivedLocked ?? "Unarchive this inquiry first.")
        : null,
    isSuccessful: (result) => (result.changed || result.deleted) ?? false,
    invalidate: (result, businessId) =>
      updateCacheTags(getInquiryMutationCacheTags(businessId, inquiryId)),
    messages: {
      success: messages.success,
      unchanged: messages.unchanged,
      fallbackError: messages.fallbackError,
      genericError: "We couldn't update that inquiry right now.",
      redirectHref: messages.redirectHref,
    },
  });
}

export async function archiveInquiryAction(
  inquiryId: string,
  _prevState: InquiryRecordActionState,
  _formData: FormData,
): Promise<InquiryRecordActionState> {
  void _prevState;
  void _formData;

  return runInquiryRecordAction(inquiryId, archiveInquiryForBusiness, {
    success: "Inquiry archived.",
    unchanged: "Inquiry is already archived.",
    fallbackError: "Failed to archive inquiry.",
  });
}

export async function unarchiveInquiryAction(
  inquiryId: string,
  _prevState: InquiryRecordActionState,
  _formData: FormData,
): Promise<InquiryRecordActionState> {
  void _prevState;
  void _formData;

  return runInquiryRecordAction(inquiryId, unarchiveInquiryForBusiness, {
    success: "Inquiry restored to active.",
    unchanged: "Inquiry is already active.",
    fallbackError: "Failed to unarchive inquiry.",
  });
}

export async function deleteInquiryAction(
  inquiryId: string,
  _prevState?: InquiryRecordActionState,
  formData?: FormData,
): Promise<InquiryRecordActionState> {
  const redirectHref = formData ? formData.get("redirectHref") as string | null : null;

  return runInquiryRecordAction(inquiryId, deleteInquiryForBusiness, {
    success: "Inquiry deleted.",
    unchanged: "Inquiry is already deleted.",
    fallbackError: "Failed to delete inquiry.",
    redirectHref: redirectHref || undefined,
  });
}


// --- Bulk Action Schemas ---

const inquiryBulkActionSchema = z.object({
  inquiryIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one inquiry.")
    .max(50, "Cannot bulk-update more than 50 inquiries at once."),
});

const inquiryBulkStatusTargets = [
  "new",
  "quoted",
  "waiting",
  "won",
  "lost",
] as const;

const inquiryBulkStatusChangeSchema = inquiryBulkActionSchema.extend({
  targetStatus: z.enum(inquiryBulkStatusTargets),
});

// --- Bulk Action Server Actions ---

export async function bulkArchiveInquiriesAction(
  _prevState: InquiryBulkActionState,
  formData: FormData,
): Promise<InquiryBulkActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();
  if (!ownerAccess.ok) return { error: ownerAccess.error };

  const { user, businessContext } = ownerAccess;
  const rawIds = formData.get("inquiryIds") as string;
  const parsed = inquiryBulkActionSchema.safeParse({
    inquiryIds: rawIds ? rawIds.split(",").filter(Boolean) : [],
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const result = await bulkArchiveInquiriesForBusiness({
      businessId: businessContext.business.id,
      inquiryIds: parsed.data.inquiryIds,
      actorUserId: user.id,
    });

    updateCacheTags(getBusinessInquiryListCacheTags(businessContext.business.id));

    if (result.affected === 0) {
      return {
        error: "No inquiries were archived. Selected inquiries may have already been archived.",
        affected: 0,
        skipped: result.skipped,
      };
    }

    return {
      success: `${result.affected} ${result.affected === 1 ? "inquiry" : "inquiries"} archived.`,
      affected: result.affected,
      skipped: result.skipped,
    };
  } catch (error) {
    console.error("Failed to bulk archive inquiries.", error);
    return { error: "We couldn't archive those inquiries right now." };
  }
}

export async function bulkDeleteInquiriesAction(
  _prevState: InquiryBulkActionState,
  formData: FormData,
): Promise<InquiryBulkActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();
  if (!ownerAccess.ok) return { error: ownerAccess.error };

  const { user, businessContext } = ownerAccess;
  const rawIds = formData.get("inquiryIds") as string;
  const parsed = inquiryBulkActionSchema.safeParse({
    inquiryIds: rawIds ? rawIds.split(",").filter(Boolean) : [],
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const result = await bulkDeleteInquiriesForBusiness({
      businessId: businessContext.business.id,
      inquiryIds: parsed.data.inquiryIds,
      actorUserId: user.id,
    });

    const cacheTags = [
      ...getBusinessInquiryListCacheTags(businessContext.business.id),
      ...parsed.data.inquiryIds.flatMap((id) =>
        getBusinessInquiryDetailCacheTags(businessContext.business.id, id),
      ),
    ];
    updateCacheTags(cacheTags);

    if (result.affected === 0) {
      return {
        error: "No inquiries were deleted. Selected inquiries may have already been deleted.",
        affected: 0,
        skipped: result.skipped,
      };
    }

    return {
      success: `${result.affected} ${result.affected === 1 ? "inquiry" : "inquiries"} deleted.`,
      affected: result.affected,
      skipped: result.skipped,
    };
  } catch (error) {
    console.error("Failed to bulk delete inquiries.", error);
    return { error: "We couldn't delete those inquiries right now." };
  }
}

export async function bulkChangeInquiryStatusAction(
  _prevState: InquiryBulkActionState,
  formData: FormData,
): Promise<InquiryBulkActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();
  if (!ownerAccess.ok) return { error: ownerAccess.error };

  const { user, businessContext } = ownerAccess;
  const rawIds = formData.get("inquiryIds") as string;
  const rawStatus = formData.get("targetStatus") as string;
  const parsed = inquiryBulkStatusChangeSchema.safeParse({
    inquiryIds: rawIds ? rawIds.split(",").filter(Boolean) : [],
    targetStatus: rawStatus,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const result = await bulkChangeInquiryStatusForBusiness({
      businessId: businessContext.business.id,
      inquiryIds: parsed.data.inquiryIds,
      actorUserId: user.id,
      targetStatus: parsed.data.targetStatus,
    });

    updateCacheTags(getBusinessInquiryListCacheTags(businessContext.business.id));

    return {
      success: `${result.affected} inquiry${result.affected !== 1 ? "ies" : ""} updated.`,
      affected: result.affected,
      skipped: result.skipped,
    };
  } catch (error) {
    console.error("Failed to bulk change inquiry status.", error);
    return { error: "We couldn't update those inquiries right now." };
  }
}

export async function bulkUnarchiveInquiriesAction(
  _prevState: InquiryBulkActionState,
  formData: FormData,
): Promise<InquiryBulkActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();
  if (!ownerAccess.ok) return { error: ownerAccess.error };

  const { user, businessContext } = ownerAccess;
  const rawIds = formData.get("inquiryIds") as string;
  const parsed = inquiryBulkActionSchema.safeParse({
    inquiryIds: rawIds ? rawIds.split(",").filter(Boolean) : [],
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const result = await bulkUnarchiveInquiriesForBusiness({
      businessId: businessContext.business.id,
      inquiryIds: parsed.data.inquiryIds,
      actorUserId: user.id,
    });

    updateCacheTags(getBusinessInquiryListCacheTags(businessContext.business.id));

    if (result.affected === 0) {
      return {
        error: "No inquiries were restored. Selected inquiries may already be active.",
        affected: 0,
        skipped: result.skipped,
      };
    }

    return {
      success: `${result.affected} ${result.affected === 1 ? "inquiry" : "inquiries"} restored.`,
      affected: result.affected,
      skipped: result.skipped,
    };
  } catch (error) {
    console.error("Failed to bulk restore inquiries.", error);
    return { error: "We couldn't restore those inquiries right now." };
  }
}

/**
 * Shared per-business read receipt for opening the inquiry detail.
 *
 * Must run as a Server Action (invoked from a client tracker after paint) —
 * cache invalidation cannot happen during render or inside `"use cache"`
 * functions.
 *
 * Uses stale-while-revalidate (`revalidateTag(..., "max")`, invoices
 * `invalidate()` pattern) — never `updateTag`. Back navigation keeps serving
 * the instant router-cache payload with no skeleton (stale content is served
 * while the fresh read happens in the background). Instant read UI comes
 * from the client tracker (local viewed store patch applied by the list +
 * badge decrement gated on `marked`). The DB write persists the truth and
 * the revalidation converges the hot list/badge cache in the background, so
 * reloads and other sessions catch up without any manual refresh.
 */
export async function markInquiryViewedAction(
  inquiryId: string,
): Promise<{ marked: boolean }> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return { marked: false };
  }

  const { user, businessContext } = ownerAccess;

  try {
    const { marked } = await markInquiryViewedForBusiness({
      businessId: businessContext.business.id,
      inquiryId,
      actorUserId: user.id,
    });

    // Only the first view changes anything — skip revalidation on revisits
    // so repeat opens stay fully cache-hot. List + unread badge share these
    // tags, so one pass converges both.
    if (marked) {
      for (const tag of getBusinessInquiryListCacheTags(
        businessContext.business.id,
      )) {
        revalidateTag(tag, "max");
      }
    }

    return { marked };
  } catch (error) {
    console.error("Failed to mark inquiry viewed.", error);

    return { marked: false };
  }
}
