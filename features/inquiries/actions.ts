"use server";

import { revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getValidationActionState } from "@/lib/action-state";
import { runRecordAction } from "@/lib/actions/run-record-action";
import {
  getBusinessInquiryDetailCacheTags,
  getServicesCacheTags,
  getBusinessInquiryListCacheTags,
  uniqueCacheTags,
  updateCacheTags,
} from "@/lib/cache/business-tags";
import {
  getMemberBusinessActionContext,
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
  validatePublicInquiryAttachmentUpload,
} from "@/features/inquiries/attachments";
import { verifyInquiryAttachmentUploadToken } from "@/features/inquiries/attachment-tokens";
import {
  getInquiryEditorServiceForBusiness,
  getInquiryIdsMatchingFiltersForBusiness,
  getPublicInquiryBusinessByServiceSlug,
  getPublicInquiryBusinessBySlug,
} from "@/features/inquiries/queries";
import {
  inquiryFormSelectionSchema,
  inquiryListFiltersSchema,
  inquiryNoteSchema,
  inquiryStatusChangeSchema,
  type PublicInquirySubmissionInput,
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
import {
  getInquiryStatusLabel,
  inquiryBulkSelectionLimit,
} from "@/features/inquiries/utils";
import {
  getPublicInquiryAttachmentMaxBytes,
  resolveInquiryFormConfigForPlan,
} from "@/features/inquiries/plan-rules";
import { publicInquiryRateLimit } from "@/features/inquiries/rate-limits";
import { getBusinessPublicInquiryUrl } from "@/features/settings/utils";
import { sendPushInquiryReceivedEvent } from "@/lib/inngest/send";

function getTextValue(formData: FormData, key: string) {
  const value = formData.get(key);

  return typeof value === "string" ? value : null;
}

/**
 * Resolves the uploaded attachment for an intake action.
 *
 * The file was uploaded straight to storage before the form was submitted,
 * so the action validates the storage path against the business and the
 * plan before the mutation confirms the object really exists.
 */
function resolveSubmittedAttachment({
  businessId,
  submission,
  maxBytes,
}: {
  businessId: string;
  submission: PublicInquirySubmissionInput;
  maxBytes: number;
}):
  | {
      ok: true;
      submission: PublicInquirySubmissionInput;
    }
  | { ok: false; error: string } {
  if (!submission.attachment) {
    return { ok: true, submission };
  }

  // The token is what binds the upload to this business. A token for
  // another business, a tampered token, or an expired one is refused.
  const payload = verifyInquiryAttachmentUploadToken(submission.attachment);

  if (!payload) {
    return {
      ok: false,
      error: "That file could not be used. Upload it again.",
    };
  }

  if (payload.businessId !== businessId) {
    return {
      ok: false,
      error: "That file could not be used. Upload it again.",
    };
  }

  const resolution = validatePublicInquiryAttachmentUpload({
    fileName: payload.fileName,
    fileSize: payload.size,
    maxBytes,
  });

  if (!resolution.ok) {
    return { ok: false, error: resolution.error };
  }

  return {
    ok: true,
    submission: {
      ...submission,
      attachmentUpload: {
        ...resolution.attachment,
        storagePath: payload.storagePath,
      },
      maxAttachmentBytes: maxBytes,
    },
  };
}

function getInquiryMutationCacheTags(businessId: string, inquiryId: string) {
  return uniqueCacheTags([
    ...getBusinessInquiryListCacheTags(businessId),
    ...getBusinessInquiryDetailCacheTags(businessId, inquiryId),
  ]);
}

const publicInquirySubmitRateLimit = publicInquiryRateLimit;

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
  serviceSlug: string | null,
  _prevState: PublicInquiryFormState,
  formData: FormData,
): Promise<PublicInquiryFormState> {
  const honeypotValue = getTextValue(formData, "company_fax_number")?.trim();

  const business = serviceSlug
    ? await getPublicInquiryBusinessByServiceSlug({
        businessSlug: slug,
        serviceSlug,
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
  );

  if (!validationResult.success) {
    return getValidationActionState(validationResult.error, "Check the highlighted fields and try again.");
  }

  const attachmentResolution = resolveSubmittedAttachment({
    businessId: business.id,
    submission: validationResult.data,
    maxBytes: getPublicInquiryAttachmentMaxBytes(plan),
  });

  if (!attachmentResolution.ok) {
    return {
      error: attachmentResolution.error,
      fieldErrors: {
        attachment: [attachmentResolution.error],
      },
    };
  }

  try {
    const createdInquiry = await createPublicInquirySubmission({
      business,
      submission: attachmentResolution.submission,
    });

    updateCacheTags([
      ...getInquiryMutationCacheTags(business.id, createdInquiry.inquiryId),
      ...getServicesCacheTags(business.id),
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
  const memberAccess = await getMemberBusinessActionContext();

  if (!memberAccess.ok) {
    return {
      error: memberAccess.error,
    };
  }

  const { user, businessContext } = memberAccess;
  const formSelectionResult = inquiryFormSelectionSchema.safeParse({
    serviceSlug: formData.get("serviceSlug"),
  });

  if (!formSelectionResult.success) {
    return getValidationActionState(
      formSelectionResult.error,
      "Choose a service.",
    );
  }

  const selectedService = await getInquiryEditorServiceForBusiness({
    businessId: businessContext.business.id,
    serviceSlug: formSelectionResult.data.serviceSlug,
  });

  if (!selectedService) {
    return {
      error: "That service is unavailable.",
      fieldErrors: {
        serviceSlug: ["Choose an active service."],
      },
    };
  }

  const effectiveFormConfig = resolveInquiryFormConfigForPlan(
    selectedService.inquiryFormConfig,
    businessContext.business.plan,
  );
  const validationResult = validateManualQuickInquirySubmission(
    effectiveFormConfig,
    formData,
  );

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the highlighted fields and try again.",
    );
  }

  const plan = await getEffectivePlanForBusiness(businessContext.business.id);
  const attachmentResolution = resolveSubmittedAttachment({
    businessId: businessContext.business.id,
    submission: validationResult.data,
    maxBytes: getPublicInquiryAttachmentMaxBytes(plan),
  });

  if (!attachmentResolution.ok) {
    return {
      error: attachmentResolution.error,
      fieldErrors: {
        attachment: [attachmentResolution.error],
      },
    };
  }

  let inquiryPath: string | null = null;

  try {
    const createdInquiry = await createManualInquirySubmission({
      business: {
        id: businessContext.business.id,
        name: businessContext.business.name,
        slug: businessContext.business.slug,
        form: {
          id: selectedService.id,
          name: selectedService.name,
          slug: selectedService.slug,
          businessType: selectedService.businessType,
          isDefault: selectedService.isDefault,
          publicInquiryEnabled: selectedService.publicInquiryEnabled,
        },
      },
      submission: attachmentResolution.submission,
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
  const memberAccess = await getMemberBusinessActionContext();

  if (!memberAccess.ok) {
    return {
      error: memberAccess.error,
    };
  }

  const { user, businessContext } = memberAccess;

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
  const memberAccess = await getMemberBusinessActionContext();

  if (!memberAccess.ok) {
    return {
      error: memberAccess.error,
    };
  }

  const { user, businessContext } = memberAccess;

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
        success: `Inquiry is already ${getInquiryStatusLabel(
          result.effectiveStatus ?? result.nextStatus,
        )}.`,
      };
    }

    return {
      success: `Inquiry moved to ${getInquiryStatusLabel(
        result.effectiveStatus ?? result.nextStatus,
      )}.`,
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
  // The redirect target arrives from a hidden input. `runRecordAction`
  // narrows it to a same-origin relative path before redirecting.
  const redirectHref = formData ? getTextValue(formData, "redirectHref") : null;

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
    .max(
      inquiryBulkSelectionLimit,
      `Cannot bulk-update more than ${inquiryBulkSelectionLimit} inquiries at once.`,
    ),
});

/**
 * Resolves the ids of every inquiry matching the given URL filters, capped
 * at the bulk-selection limit.
 *
 * The list route only warms a window of pages around the current one, so
 * the client cannot derive the full matching set on its own. Without this
 * the "Select all" affordance would silently select fewer rows than the
 * user was told, and a bulk archive/delete would affect a different set
 * than the one on screen.
 */
export async function getInquiryIdsForBulkSelectionAction(
  searchParams: Record<string, string | string[] | undefined>,
): Promise<string[]> {
  const memberAccess = await getMemberBusinessActionContext();

  if (!memberAccess.ok) {
    throw new Error(memberAccess.error);
  }

  const parsedFilters = inquiryListFiltersSchema.safeParse(searchParams);

  if (!parsedFilters.success) {
    throw new Error("We couldn't read the current inquiry filters.");
  }

  const { page: _page, ...filters } = parsedFilters.data;

  return getInquiryIdsMatchingFiltersForBusiness({
    businessId: memberAccess.businessContext.business.id,
    // The list page always renders with the unread filter off.
    filters: { ...filters, unread: false },
    limit: inquiryBulkSelectionLimit,
  });
}

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
  const memberAccess = await getMemberBusinessActionContext();
  if (!memberAccess.ok) return { error: memberAccess.error };

  const { user, businessContext } = memberAccess;
  const rawIds = getTextValue(formData, "inquiryIds");
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
  const memberAccess = await getMemberBusinessActionContext();
  if (!memberAccess.ok) return { error: memberAccess.error };

  const { user, businessContext } = memberAccess;
  const rawIds = getTextValue(formData, "inquiryIds");
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
  const memberAccess = await getMemberBusinessActionContext();
  if (!memberAccess.ok) return { error: memberAccess.error };

  const { user, businessContext } = memberAccess;
  const rawIds = getTextValue(formData, "inquiryIds");
  const rawStatus = getTextValue(formData, "targetStatus");
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
  const memberAccess = await getMemberBusinessActionContext();
  if (!memberAccess.ok) return { error: memberAccess.error };

  const { user, businessContext } = memberAccess;
  const rawIds = getTextValue(formData, "inquiryIds");
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
  const memberAccess = await getMemberBusinessActionContext();

  if (!memberAccess.ok) {
    return { marked: false };
  }

  const { user, businessContext } = memberAccess;

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
