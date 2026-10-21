"use server";

import { getValidationActionState } from "@/lib/action-state";
import { runRecordAction } from "@/lib/actions/run-record-action";
import {
  getBusinessFollowUpListCacheTags,
  getBusinessInquiryDetailCacheTags,
  getBusinessInquiryListCacheTags,
  getBusinessQuoteDetailCacheTags,
  getBusinessQuoteListCacheTags,
  uniqueCacheTags,
  updateCacheTags,
} from "@/lib/cache/business-tags";
import { getWorkspaceBusinessActionContext } from "@/lib/db/business-access";
import { parseFollowUpDateTimeInput } from "@/features/follow-ups/utils";
import {
  bulkCompleteFollowUpsForBusiness,
  bulkSkipFollowUpsForBusiness,
  completeFollowUpForBusiness,
  createFollowUpForBusiness,
  deleteFollowUpForBusiness,
  editFollowUpForBusiness,
  FollowUpCreateValidationError,
  reassignFollowUpForBusiness,
  rescheduleFollowUpForBusiness,
  skipFollowUpForBusiness,
  snoozeFollowUpForBusiness,
} from "@/features/follow-ups/mutations";
import {
  followUpBulkActionSchema,
  followUpCompleteSchema,
  followUpCreateSchema,
  followUpEditSchema,
  followUpReassignSchema,
  followUpRescheduleSchema,
  followUpSnoozeSchema,
} from "@/features/follow-ups/schemas";
import type {
  FollowUpBulkActionState,
  FollowUpCompleteActionState,
  FollowUpCreateActionState,
  FollowUpCreateFieldErrors,
  FollowUpDeleteActionState,
  FollowUpEditActionState,
  FollowUpEditFieldErrors,
  FollowUpReassignActionState,
  FollowUpReassignFieldErrors,
  FollowUpRecordActionState,
  FollowUpRescheduleActionState,
  FollowUpRescheduleFieldErrors,
  FollowUpSnoozeActionState,
} from "@/features/follow-ups/types";

function getFollowUpMutationCacheTags({
  businessId,
  inquiryId,
  quoteId,
}: {
  businessId: string;
  inquiryId?: string | null;
  quoteId?: string | null;
}) {
  return uniqueCacheTags([
    ...getBusinessFollowUpListCacheTags(businessId),
    ...getBusinessInquiryListCacheTags(businessId),
    ...getBusinessQuoteListCacheTags(businessId),
    ...(inquiryId ? getBusinessInquiryDetailCacheTags(businessId, inquiryId) : []),
    ...(quoteId ? getBusinessQuoteDetailCacheTags(businessId, quoteId) : []),
  ]);
}

function getCreateFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): FollowUpCreateFieldErrors {
  return {
    title: fieldErrors.title,
    reason: fieldErrors.reason,
    channel: fieldErrors.channel,
    category: fieldErrors.category,
    sendMode: fieldErrors.sendMode,
    dueDate: fieldErrors.dueDate,
    recurrence: fieldErrors.recurrence,
    recurrenceLimit: fieldErrors.recurrenceLimit,
    terminationCondition: fieldErrors.terminationCondition,
  };
}

function getEditFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): FollowUpEditFieldErrors {
  return {
    title: fieldErrors.title,
    reason: fieldErrors.reason,
    channel: fieldErrors.channel,
    category: fieldErrors.category,
    sendMode: fieldErrors.sendMode,
    dueDate: fieldErrors.dueDate,
    recurrence: fieldErrors.recurrence,
    recurrenceLimit: fieldErrors.recurrenceLimit,
    terminationCondition: fieldErrors.terminationCondition,
  };
}

function getRescheduleFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): FollowUpRescheduleFieldErrors {
  return {
    dueDate: fieldErrors.dueDate,
  };
}

function getReassignFieldErrors(
  fieldErrors: Record<string, string[] | undefined>,
): FollowUpReassignFieldErrors {
  return {
    assignedToUserId: fieldErrors.assignedToUserId,
  };
}

async function createFollowUpActionForRecord({
  inquiryId,
  quoteId,
  formData,
}: {
  inquiryId?: string | null;
  quoteId?: string | null;
  formData: FormData;
}): Promise<FollowUpCreateActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = followUpCreateSchema.safeParse({
    title: formData.get("title"),
    reason: formData.get("reason"),
    channel: formData.get("channel"),
    category: formData.get("category") || "sales",
    sendMode: formData.get("sendMode") || "manual",
    dueDate: formData.get("dueDate"),
    recurrence: formData.get("recurrence") || "none",
    recurrenceLimit: formData.get("recurrenceLimit") || null,
    terminationCondition: formData.get("terminationCondition") || null,
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the follow-up details and try again.",
      getCreateFieldErrors,
    );
  }

  // Automatic sending only supports email in v1 (no SMS/WhatsApp sender infra).
  if (
    validationResult.data.sendMode === "automatic" &&
    validationResult.data.channel !== "email"
  ) {
    return {
      error: "Automatic sending is only available for the email channel.",
      fieldErrors: {
        sendMode: ["Automatic sending is only available for the email channel."],
      },
    };
  }

  // Reject terminal_status condition when no linked item exists
  if (
    validationResult.data.terminationCondition === "terminal_status" &&
    !inquiryId &&
    !quoteId
  ) {
    return {
      error: "A linked inquiry or quote is required for the \u201Cuntil terminal status\u201D end condition.",
      fieldErrors: {
        terminationCondition: ["A linked inquiry or quote is required for this end condition."],
      },
    };
  }

  try {
    const result = await createFollowUpForBusiness({
      businessId: businessContext.business.id,
      inquiryId,
      quoteId,
      actorUserId: user.id,
      assignedToUserId: formData.get("assignedToUserId") as string || user.id,
      followUp: validationResult.data,
      timezone: businessContext.business.timezone,
    });

    if (!result) {
      return {
        error: "That inquiry or quote could not be found.",
      };
    }

    updateCacheTags(
      getFollowUpMutationCacheTags({
        businessId: businessContext.business.id,
        inquiryId: result.inquiryId,
        quoteId: result.quoteId,
      }),
    );

    return {
      success: "Follow-up created.",
      followUpId: result.followUpId,
    };
  } catch (error) {
    if (error instanceof FollowUpCreateValidationError) {
      return {
        error: error.message,
        fieldErrors: { [error.field]: [error.message] },
      };
    }

    console.error("Failed to create follow-up.", error);

    return {
      error: "We couldn't create that follow-up right now.",
    };
  }
}

export async function createInquiryFollowUpAction(
  inquiryId: string,
  _prevState: FollowUpCreateActionState,
  formData: FormData,
): Promise<FollowUpCreateActionState> {
  return createFollowUpActionForRecord({
    inquiryId,
    formData,
  });
}

export async function createQuoteFollowUpAction(
  quoteId: string,
  _prevState: FollowUpCreateActionState,
  formData: FormData,
): Promise<FollowUpCreateActionState> {
  return createFollowUpActionForRecord({
    quoteId,
    formData,
  });
}

async function runFollowUpRecordAction(
  followUpId: string,
  mutation: (input: {
    businessId: string;
    followUpId: string;
    actorUserId: string;
  }) => Promise<
    | {
        changed: boolean;
        locked: boolean;
        inquiryId: string | null;
        quoteId: string | null;
        status: string;
      }
    | null
  >,
  messages: {
    success: string;
    unchanged: string;
    locked: string;
    fallbackError: string;
  },
): Promise<FollowUpRecordActionState> {
  return runRecordAction<FollowUpRecordActionState, {
    changed: boolean;
    locked: boolean;
    inquiryId: string | null;
    quoteId: string | null;
    status: string;
  }>({
    runMutation: ({ businessId, actorUserId }) =>
      mutation({ businessId, followUpId, actorUserId }),
    missingError: "That follow-up could not be found.",
    lockedError: (result) => (result.locked ? messages.locked : null),
    isSuccessful: (result) => result.changed,
    invalidate: (result, businessId) =>
      updateCacheTags(
        getFollowUpMutationCacheTags({
          businessId,
          inquiryId: result.inquiryId,
          quoteId: result.quoteId,
        }),
      ),
    messages: {
      success: messages.success,
      unchanged: messages.unchanged,
      fallbackError: messages.fallbackError,
      genericError: "We couldn't update that follow-up right now.",
    },
  });
}

export async function completeFollowUpAction(
  followUpId: string,
  _prevState: FollowUpCompleteActionState,
  formData: FormData,
): Promise<FollowUpCompleteActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;
  const parsed = followUpCompleteSchema.safeParse({
    completionNote: formData.get("completionNote"),
  });

  if (!parsed.success) {
    return getValidationActionState(
      parsed.error,
      "Check the completion note and try again.",
      (fieldErrors) => ({ completionNote: fieldErrors.completionNote }),
    );
  }

  const completionNote = parsed.data.completionNote;

  try {
    const result = await completeFollowUpForBusiness({
      businessId: businessContext.business.id,
      followUpId,
      actorUserId: user.id,
      completionNote,
      timezone: businessContext.business.timezone,
    });

    if (!result) {
      return { error: "That follow-up could not be found." };
    }

    updateCacheTags(
      getFollowUpMutationCacheTags({
        businessId: businessContext.business.id,
        inquiryId: result.inquiryId,
        quoteId: result.quoteId,
      }),
    );

    if (result.locked) {
      return { error: "Only pending follow-ups can be completed." };
    }

    return {
      success: result.changed ? "Follow-up marked done." : "Follow-up is already completed.",
    };
  } catch (error) {
    console.error("Failed to complete follow-up.", error);
    return { error: "We couldn't update that follow-up right now." };
  }
}

export async function skipFollowUpAction(
  followUpId: string,
  _prevState: FollowUpRecordActionState,
  _formData: FormData,
): Promise<FollowUpRecordActionState> {
  void _prevState;
  void _formData;

  return runFollowUpRecordAction(followUpId, skipFollowUpForBusiness, {
    success: "Follow-up skipped.",
    unchanged: "Follow-up is already skipped.",
    locked: "Only pending follow-ups can be skipped.",
    fallbackError: "Failed to skip follow-up.",
  });
}

export async function rescheduleFollowUpAction(
  followUpId: string,
  _prevState: FollowUpRescheduleActionState,
  formData: FormData,
): Promise<FollowUpRescheduleActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = followUpRescheduleSchema.safeParse({
    dueDate: formData.get("dueDate"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Choose a valid follow-up date.",
      getRescheduleFieldErrors,
    );
  }

  try {
    const result = await rescheduleFollowUpForBusiness({
      businessId: businessContext.business.id,
      followUpId,
      actorUserId: user.id,
      followUp: validationResult.data,
      timezone: businessContext.business.timezone,
    });

    if (!result) {
      return {
        error: "That follow-up could not be found.",
      };
    }

    updateCacheTags(
      getFollowUpMutationCacheTags({
        businessId: businessContext.business.id,
        inquiryId: result.inquiryId,
        quoteId: result.quoteId,
      }),
    );

    if (result.locked) {
      return {
        error: "Only pending follow-ups can be rescheduled.",
      };
    }

    return {
      success: "Follow-up rescheduled.",
    };
  } catch (error) {
    console.error("Failed to reschedule follow-up.", error);

    return {
      error: "We couldn't reschedule that follow-up right now.",
    };
  }
}

export async function editFollowUpAction(
  followUpId: string,
  _prevState: FollowUpEditActionState,
  formData: FormData,
): Promise<FollowUpEditActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = followUpEditSchema.safeParse({
    title: formData.get("title"),
    reason: formData.get("reason"),
    channel: formData.get("channel"),
    category: formData.get("category") || "sales",
    sendMode: formData.get("sendMode") || "manual",
    dueDate: formData.get("dueDate"),
    recurrence: formData.get("recurrence") || "none",
    recurrenceLimit: formData.get("recurrenceLimit") || null,
    terminationCondition: formData.get("terminationCondition") || null,
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Check the follow-up details and try again.",
      getEditFieldErrors,
    );
  }

  if (
    validationResult.data.sendMode === "automatic" &&
    validationResult.data.channel !== "email"
  ) {
    return {
      error: "Automatic sending is only available for the email channel.",
      fieldErrors: {
        sendMode: ["Automatic sending is only available for the email channel."],
      },
    };
  }

  try {
    const result = await editFollowUpForBusiness({
      businessId: businessContext.business.id,
      followUpId,
      actorUserId: user.id,
      followUp: validationResult.data,
      timezone: businessContext.business.timezone,
    });

    if (!result) {
      return {
        error: "That follow-up could not be found.",
      };
    }

    updateCacheTags(
      getFollowUpMutationCacheTags({
        businessId: businessContext.business.id,
        inquiryId: result.inquiryId,
        quoteId: result.quoteId,
      }),
    );

    if (result.locked) {
      return {
        error: "Only pending follow-ups can be edited.",
      };
    }

    return {
      success: "Follow-up updated.",
    };
  } catch (error) {
    if (error instanceof FollowUpCreateValidationError) {
      return {
        error: error.message,
        fieldErrors: { [error.field]: [error.message] },
      };
    }

    console.error("Failed to edit follow-up.", error);

    return {
      error: "We couldn't update that follow-up right now.",
    };
  }
}

export async function deleteFollowUpAction(
  followUpId: string,
  _prevState: FollowUpDeleteActionState,
  _formData: FormData,
): Promise<FollowUpDeleteActionState> {
  void _prevState;
  void _formData;

  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;

  try {
    const result = await deleteFollowUpForBusiness({
      businessId: businessContext.business.id,
      followUpId,
      actorUserId: user.id,
    });

    if (!result) {
      return {
        error: "That follow-up could not be found.",
      };
    }

    updateCacheTags(
      getFollowUpMutationCacheTags({
        businessId: businessContext.business.id,
        inquiryId: result.inquiryId,
        quoteId: result.quoteId,
      }),
    );

    return {
      success: result.changed ? "Follow-up deleted." : "Follow-up was already deleted.",
    };
  } catch (error) {
    console.error("Failed to delete follow-up.", error);

    return {
      error: "We couldn't delete that follow-up right now.",
    };
  }
}

export async function reassignFollowUpAction(
  followUpId: string,
  _prevState: FollowUpReassignActionState,
  formData: FormData,
): Promise<FollowUpReassignActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return {
      error: ownerAccess.error,
    };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = followUpReassignSchema.safeParse({
    assignedToUserId: formData.get("assignedToUserId"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Choose a team member to assign.",
      getReassignFieldErrors,
    );
  }

  try {
    const result = await reassignFollowUpForBusiness({
      businessId: businessContext.business.id,
      followUpId,
      actorUserId: user.id,
      reassign: validationResult.data,
    });

    if (!result) {
      return {
        error: "That follow-up could not be found.",
      };
    }

    updateCacheTags(
      getFollowUpMutationCacheTags({
        businessId: businessContext.business.id,
        inquiryId: result.inquiryId,
        quoteId: result.quoteId,
      }),
    );

    if (result.locked) {
      return {
        error: "Only pending follow-ups can be reassigned.",
      };
    }

    return {
      success: result.changed ? "Follow-up reassigned." : "Already assigned to that person.",
    };
  } catch (error) {
    if (error instanceof FollowUpCreateValidationError) {
      return {
        error: error.message,
        fieldErrors: { [error.field]: [error.message] },
      };
    }

    console.error("Failed to reassign follow-up.", error);

    return {
      error: "We couldn't reassign that follow-up right now.",
    };
  }
}


// ---------------------------------------------------------------------------
// Snooze
// ---------------------------------------------------------------------------

export async function snoozeFollowUpAction(
  followUpId: string,
  _prevState: FollowUpSnoozeActionState,
  formData: FormData,
): Promise<FollowUpSnoozeActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;
  const validationResult = followUpSnoozeSchema.safeParse({
    snoozedUntil: formData.get("snoozedUntil"),
  });

  if (!validationResult.success) {
    return getValidationActionState(
      validationResult.error,
      "Choose a valid snooze time.",
      (fieldErrors) => ({ snoozedUntil: fieldErrors.snoozedUntil }),
    );
  }

  const snoozedUntil = parseFollowUpDateTimeInput(
    validationResult.data.snoozedUntil,
    businessContext.business.timezone,
  );

  try {
    const result = await snoozeFollowUpForBusiness({
      businessId: businessContext.business.id,
      followUpId,
      actorUserId: user.id,
      snoozedUntil,
      timezone: businessContext.business.timezone,
    });

    if (!result) {
      return { error: "That follow-up could not be found." };
    }

    updateCacheTags(
      getFollowUpMutationCacheTags({
        businessId: businessContext.business.id,
        inquiryId: result.inquiryId,
        quoteId: result.quoteId,
      }),
    );

    if (result.locked) {
      return { error: "Only pending follow-ups can be snoozed." };
    }

    return { success: "Follow-up snoozed." };
  } catch (error) {
    console.error("Failed to snooze follow-up.", error);
    return { error: "We couldn't snooze that follow-up right now." };
  }
}

// ---------------------------------------------------------------------------
// Bulk Complete
// ---------------------------------------------------------------------------

export async function bulkCompleteFollowUpsAction(
  _prevState: FollowUpBulkActionState,
  formData: FormData,
): Promise<FollowUpBulkActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;
  const rawIds = formData.get("followUpIds") as string;
  const completionNote = (formData.get("completionNote") as string) || undefined;

  const parsed = followUpBulkActionSchema.safeParse({
    followUpIds: rawIds ? rawIds.split(",").filter(Boolean) : [],
    completionNote,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const result = await bulkCompleteFollowUpsForBusiness({
      businessId: businessContext.business.id,
      followUpIds: parsed.data.followUpIds,
      actorUserId: user.id,
      completionNote: parsed.data.completionNote,
      timezone: businessContext.business.timezone,
    });

    const tags = getFollowUpMutationCacheTags({
      businessId: businessContext.business.id,
    });
    // Also invalidate specific inquiry/quote caches
    for (const inquiryId of result.inquiryIds) {
      tags.push(...getBusinessInquiryDetailCacheTags(businessContext.business.id, inquiryId));
    }
    for (const quoteId of result.quoteIds) {
      tags.push(...getBusinessQuoteDetailCacheTags(businessContext.business.id, quoteId));
    }
    updateCacheTags(uniqueCacheTags(tags));

    return {
      success: result.affected > 0
        ? `${result.affected} follow-up${result.affected > 1 ? "s" : ""} marked done.`
        : "No pending follow-ups to complete.",
      affected: result.affected,
    };
  } catch (error) {
    console.error("Failed to bulk complete follow-ups.", error);
    return { error: "We couldn't complete those follow-ups right now." };
  }
}

// ---------------------------------------------------------------------------
// Bulk Skip
// ---------------------------------------------------------------------------

export async function bulkSkipFollowUpsAction(
  _prevState: FollowUpBulkActionState,
  formData: FormData,
): Promise<FollowUpBulkActionState> {
  const ownerAccess = await getWorkspaceBusinessActionContext();

  if (!ownerAccess.ok) {
    return { error: ownerAccess.error };
  }

  const { user, businessContext } = ownerAccess;
  const rawIds = formData.get("followUpIds") as string;

  const parsed = followUpBulkActionSchema.safeParse({
    followUpIds: rawIds ? rawIds.split(",").filter(Boolean) : [],
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  try {
    const result = await bulkSkipFollowUpsForBusiness({
      businessId: businessContext.business.id,
      followUpIds: parsed.data.followUpIds,
      actorUserId: user.id,
    });

    const tags = getFollowUpMutationCacheTags({
      businessId: businessContext.business.id,
    });
    for (const inquiryId of result.inquiryIds) {
      tags.push(...getBusinessInquiryDetailCacheTags(businessContext.business.id, inquiryId));
    }
    for (const quoteId of result.quoteIds) {
      tags.push(...getBusinessQuoteDetailCacheTags(businessContext.business.id, quoteId));
    }
    updateCacheTags(uniqueCacheTags(tags));

    return {
      success: result.affected > 0
        ? `${result.affected} follow-up${result.affected > 1 ? "s" : ""} skipped.`
        : "No pending follow-ups to skip.",
      affected: result.affected,
    };
  } catch (error) {
    console.error("Failed to bulk skip follow-ups.", error);
    return { error: "We couldn't skip those follow-ups right now." };
  }
}
