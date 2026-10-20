import "server-only";

import { db } from "@/lib/db/client";
import { writeAuditLog } from "@/features/audit/mutations";
import { newEntityId } from "@/lib/ids";
import {
  getBusinessInquiryDetailCacheTags,
  getBusinessInquiryListCacheTags,
  uniqueCacheTags,
} from "@/lib/cache/business-tags";
import {
  activityLogs,
  aiAgentSessions,
  businesses,
  inquiries,
  inquiryAttachments,
  inquiryNotes,
} from "@/lib/db/schema";
import { insertBusinessNotification } from "@/features/notifications/mutations";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { resolveInquiryAttachmentContentType } from "@/features/inquiries/attachment-content";
import {
  publicInquiryAttachmentBucket,
  type PublicInquirySubmissionInput,
} from "@/features/inquiries/schemas";
import type {
  InquiryStatus,
  InquiryWorkflowStatus,
  InquirySourceValue,
} from "@/features/inquiries/types";
import { inquirySources } from "@/features/inquiries/types";
import { getEffectiveInquiryStatus } from "@/features/inquiries/status-sql";
import { getInquiryStatusLabel } from "@/features/inquiries/utils";
import type { PublicInquiryBusiness } from "@/features/inquiries/types";
import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { revalidateTag } from "next/cache";
import { qualifyInquiry } from "./qualification/qualify-inquiry";
import {
  enqueueAiDraftQuoteOnQualify,
  maybeSendInquiryAckEmail,
} from "@/features/inquiries/defaults";

type InquirySubmissionBusinessRef = Pick<
  PublicInquiryBusiness,
  "id" | "name" | "slug"
> & {
  form?: PublicInquiryBusiness["form"] | null;
};

type CreateInquirySubmissionInput = {
  business: InquirySubmissionBusinessRef;
  submission: PublicInquirySubmissionInput;
  actorUserId: string | null;
  source: InquirySourceValue;
  activity: {
    type: string;
    summary: string;
  };
  notifyInAppOnNewInquiry: boolean;
  /** Attribution + routing flags for AI-assisted creation paths. */
  aiAssisted?: boolean;
  escalated?: boolean;
};

type CreatePublicInquirySubmissionResult = {
  inquiryId: string;
  attachmentName: string | null;
};

type PreparedAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  storagePath: string;
};

function normalizeLegacyArchivedInquiryStatus(status: InquiryStatus) {
  return status === "archived" ? "waiting" : status;
}

export async function createInquirySubmission({
  business,
  submission,
  actorUserId,
  source,
  activity,
  notifyInAppOnNewInquiry,
  aiAssisted = false,
  escalated = false,
}: CreateInquirySubmissionInput): Promise<CreatePublicInquirySubmissionResult> {
  const inquiryId = newEntityId();
  const activityId = newEntityId();
  const now = new Date();
  const attachmentUpload = submission.attachmentUpload;
  let preparedAttachment: PreparedAttachment | null = null;

  if (attachmentUpload) {
    // The file was uploaded straight to storage before the form was
    // submitted, because a function request body cannot carry it. Confirm
    // the object is really there and use the size storage reports rather
    // than the one the client claimed.
    const storageClient = createSupabaseAdminClient();
    const { data: objectInfo, error: infoError } = await storageClient.storage
      .from(publicInquiryAttachmentBucket)
      .info(attachmentUpload.storagePath);

    if (infoError || !objectInfo) {
      throw new Error("Failed to confirm the uploaded inquiry attachment.");
    }

    const observedSize = objectInfo.size ?? 0;
    const maxAttachmentBytes = submission.maxAttachmentBytes;

    if (
      observedSize <= 0 ||
      (typeof maxAttachmentBytes === "number" &&
        observedSize > maxAttachmentBytes)
    ) {
      throw new Error("The uploaded inquiry attachment failed validation.");
    }

    const { data: object, error: downloadError } = await storageClient.storage
      .from(publicInquiryAttachmentBucket)
      .download(attachmentUpload.storagePath);

    if (downloadError || !object || object.size !== observedSize) {
      throw new Error("Failed to confirm the uploaded inquiry attachment.");
    }

    const contentType = await resolveInquiryAttachmentContentType(
      new Uint8Array(await object.arrayBuffer()),
      attachmentUpload.fileName,
    );

    if (contentType !== attachmentUpload.contentType) {
      throw new Error("The uploaded inquiry attachment failed validation.");
    }

    preparedAttachment = {
      id: newEntityId(),
      // This filename comes from the signed token payload; it is distinct
      // from the sanitized filename in the storage path.
      fileName: attachmentUpload.fileName.slice(0, 255),
      contentType,
      fileSize: observedSize,
      storagePath: attachmentUpload.storagePath,
    };
  }

  try {
    await db.transaction(async (tx) => {
      const serviceName = business.form?.name ?? "General inquiry";
      await tx.insert(inquiries).values({
        id: inquiryId,
        businessId: business.id,
        businessInquiryFormId: business.form?.id ?? null,
        status: "new",
        subject: serviceName,
        customerName: submission.customerName,
        customerEmail: submission.customerEmail ?? null,
        customerContactMethod: submission.customerContactMethod,
        customerContactHandle: submission.customerContactHandle,
        serviceCategory: null,
        requestedDeadline: submission.requestedDeadline ?? null,
        budgetText: submission.budgetText ?? null,
        details: submission.details,
        submittedFieldSnapshot: submission.submittedFieldSnapshot,
        source,
        aiAssisted,
        escalated,
        quoteRequested: true,
        submittedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      if (preparedAttachment) {
        await tx.insert(inquiryAttachments).values({
          id: preparedAttachment.id,
          businessId: business.id,
          inquiryId,
          fileName: preparedAttachment.fileName,
          contentType: preparedAttachment.contentType,
          fileSize: preparedAttachment.fileSize,
          storagePath: preparedAttachment.storagePath,
          createdAt: now,
          updatedAt: now,
        });
      }

      await tx.insert(activityLogs).values({
        id: activityId,
        businessId: business.id,
        inquiryId,
        actorUserId,
        type: activity.type,
        summary: activity.summary,
        metadata: {
          source,
          businessSlug: business.slug,
          inquiryFormId: business.form?.id ?? null,
          inquiryFormSlug: business.form?.slug ?? null,
          inquiryFormName: business.form?.name ?? null,
          hasAttachment: Boolean(preparedAttachment),
        },
        createdAt: now,
        updatedAt: now,
      });

      const [notificationSettings] = await tx
        .select({
          notifyInAppOnNewInquiry: businesses.notifyInAppOnNewInquiry,
        })
        .from(businesses)
        .where(eq(businesses.id, business.id))
        .limit(1);

      if (notifyInAppOnNewInquiry && notificationSettings?.notifyInAppOnNewInquiry) {
        await insertBusinessNotification(tx, {
          businessId: business.id,
          inquiryId,
          type: "public_inquiry_submitted",
          title: `New inquiry from ${submission.customerName}`,
          summary: `${business.form?.name ?? "General inquiry"} via ${source}`,
          metadata: {
            customerEmail: submission.customerEmail,
            customerName: submission.customerName,
            hasAttachment: Boolean(preparedAttachment),
            inquiryFormId: business.form?.id ?? null,
            inquiryFormName: business.form?.name ?? null,
            inquiryFormSlug: business.form?.slug ?? null,
          },
          now,
        });
      }
    });
  } catch (error) {
    throw error;
  }

  // Invalidate the cached inquiry list and detail so a lead created here is
  // visible without waiting for the cache window to lapse. This lives in
  // the mutation (not only in the callers) because the Agent and Assistant
  // write paths would otherwise leave the dashboard showing a stale list.
  //
  // `revalidateTag` (not `updateTag`): this mutation also runs from a route
  // handler, where `updateTag` is unsupported.
  for (const tag of uniqueCacheTags([
    ...getBusinessInquiryListCacheTags(business.id),
    ...getBusinessInquiryDetailCacheTags(business.id, inquiryId),
  ])) {
    revalidateTag(tag, "max");
  }

  // Notify the customer via email (in-app owner notification is handled above).
  void maybeSendInquiryAckEmail({
    businessId: business.id,
    inquiryId,
    customerEmail: submission.customerEmail,
    customerName: submission.customerName,
    serviceName: business.form?.name ?? "General inquiry",
    details: submission.details,
  }).catch((error) => {
    console.error("[inquiry.received] Failed to send acknowledgment email.", error);
  });

  // Run qualification after the transaction commits.
  // Wrapped in try/catch so failures never block inquiry creation.
  try {
    await qualifyInquiry({
      inquiryId,
      businessId: business.id,
      inquiry: {
        customerName: submission.customerName,
        customerEmail: submission.customerEmail ?? null,
        requestedDeadline: submission.requestedDeadline ?? null,
        budgetText: submission.budgetText ?? null,
        details: submission.details,
        subject: business.form?.name ?? "",
        submittedAt: now,
      },
    });

    // Queue the AI draft-quote default after successful qualification
    void enqueueAiDraftQuoteOnQualify({
      businessId: business.id,
      inquiryId,
      qualifiedAt: now.toISOString(),
    }).catch((error) => {
      console.error("[inquiry.qualified] Failed to queue AI draft quote.", error);
    });
  } catch (error) {
    console.error("Inquiry qualification failed:", error);
    // Inquiry is still created successfully
  }

  return {
    inquiryId,
    attachmentName: preparedAttachment?.fileName ?? null,
  };
}

export async function createPublicInquirySubmission({
  business,
  submission,
}: {
  business: InquirySubmissionBusinessRef;
  submission: PublicInquirySubmissionInput;
}): Promise<CreatePublicInquirySubmissionResult> {
  return createInquirySubmission({
    business,
    submission,
    actorUserId: null,
    source: inquirySources.serviceForm,
    activity: {
      type: "inquiry.submitted_public",
      summary: "Inquiry submitted through the service form.",
    },
    notifyInAppOnNewInquiry: true,
  });
}

export async function createManualInquirySubmission({
  business,
  submission,
  actorUserId,
  source = inquirySources.manual,
}: {
  business: InquirySubmissionBusinessRef;
  submission: PublicInquirySubmissionInput;
  actorUserId: string;
  source?: InquirySourceValue;
}): Promise<CreatePublicInquirySubmissionResult> {
  return createInquirySubmission({
    business,
    submission,
    actorUserId,
    source,
    activity: {
      type: "inquiry.created_manual",
      summary: "Inquiry created manually from the dashboard.",
    },
    notifyInAppOnNewInquiry: false,
  });
}

/**
 * Shared submission path for the customer-facing Agent surface.
 *
 * Preserves AI attribution (`source: "ai_assistant"`, `aiAssisted: true`) while
 * reusing intake behaviour (form linkage, activity, notifications,
 * acknowledgement email, qualification) identically to the public path.
 */
export async function createAgentInquirySubmission({
  business,
  submission,
  sessionId,
}: {
  business: InquirySubmissionBusinessRef;
  submission: PublicInquirySubmissionInput;
  sessionId?: string;
}): Promise<CreatePublicInquirySubmissionResult> {
  const result = await createInquirySubmission({
    business,
    submission,
    actorUserId: null,
    source: inquirySources.aiAssistant,
    activity: {
      type: "inquiry.submitted_ai_agent",
      summary: "Inquiry submitted through AI agent conversation.",
    },
    notifyInAppOnNewInquiry: true,
    aiAssisted: true,
  });

  if (sessionId) {
    // Attribute the originating session without blocking on failure.
    try {
      const [current] = await db
        .select()
        .from(aiAgentSessions)
        .where(
          and(
            eq(aiAgentSessions.id, sessionId),
            eq(aiAgentSessions.businessId, business.id),
          ),
        )
        .limit(1);
      const existingMetadata =
        (current?.metadata as Record<string, unknown> | null) ?? {};
      const createdInquiryIds = Array.isArray(
        (existingMetadata as { createdInquiryIds?: unknown }).createdInquiryIds,
      )
        ? [
            ...(existingMetadata as { createdInquiryIds: string[] })
              .createdInquiryIds,
          ]
        : [];
      await db
        .update(aiAgentSessions)
        .set({
          inquiryId: result.inquiryId,
          metadata: {
            ...existingMetadata,
            lastCreatedInquiryId: result.inquiryId,
            createdInquiryIds: [...createdInquiryIds, result.inquiryId],
          },
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiAgentSessions.id, sessionId),
            eq(aiAgentSessions.businessId, business.id),
          ),
        );
    } catch (error) {
      console.error("[inquiries] Failed to link agent session.", error);
    }
  }

  return result;
}

/**
 * Shared submission path for Agent escalation to a human.
 *
 * Files an Inquiry carrying the details the customer actually provided and
 * flags it for the inbox escalated queue.
 */
export async function createAgentHandoffSubmission({
  business,
  submission,
  sessionId,
}: {
  business: InquirySubmissionBusinessRef;
  submission: PublicInquirySubmissionInput;
  sessionId?: string;
}): Promise<CreatePublicInquirySubmissionResult> {
  const result = await createInquirySubmission({
    business,
    submission,
    actorUserId: null,
    source: inquirySources.aiAssistant,
    activity: {
      type: "inquiry.submitted_ai_agent",
      summary: "Customer escalated to a human from the AI assistant conversation.",
    },
    notifyInAppOnNewInquiry: true,
    aiAssisted: true,
    escalated: true,
  });

  if (sessionId) {
    try {
      await db
        .update(aiAgentSessions)
        .set({
          inquiryId: result.inquiryId,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(aiAgentSessions.id, sessionId),
            eq(aiAgentSessions.businessId, business.id),
          ),
        );
    } catch (error) {
      console.error("[inquiries] Failed to link handoff session.", error);
    }
  }

  return result;
}

/**
 * Shared submission path for the owner-facing Assistant surface.
 *
 * Same intake behaviour as a manual dashboard creation, attributed as
 * AI-assisted and to the acting member.
 */
export async function createAssistantInquirySubmission({
  business,
  submission,
  actorUserId,
}: {
  business: InquirySubmissionBusinessRef;
  submission: PublicInquirySubmissionInput;
  actorUserId: string;
}): Promise<CreatePublicInquirySubmissionResult> {
  return createInquirySubmission({
    business,
    submission,
    actorUserId,
    // The Assistant is an AI surface, so the record is attributed to the
    // AI Assistant source — not to "manual", which the dashboard and the
    // CSV export both read.
    source: inquirySources.aiAssistant,
    activity: {
      type: "inquiry.submitted_ai_agent",
      summary: "Inquiry created by the business Assistant.",
    },
    notifyInAppOnNewInquiry: false,
    aiAssisted: true,
  });
}

type AddInquiryNoteForBusinessInput = {
  businessId: string;
  inquiryId: string;
  authorUserId: string;
  body: string;
};

export async function addInquiryNoteForBusiness({
  businessId,
  inquiryId,
  authorUserId,
  body,
}: AddInquiryNoteForBusinessInput) {
  const noteId = newEntityId();
  const activityId = newEntityId();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [inquiry] = await tx
      .select({ id: inquiries.id })
      .from(inquiries)
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)))
      .limit(1);

    if (!inquiry) {
      return null;
    }

    await tx.insert(inquiryNotes).values({
      id: noteId,
      businessId,
      inquiryId,
      authorUserId,
      body,
      createdAt: now,
      updatedAt: now,
    });

    await tx.insert(activityLogs).values({
      id: activityId,
      businessId,
      inquiryId,
      actorUserId: authorUserId,
      type: "inquiry.note_added",
      summary: "Internal note added.",
      metadata: {
        noteId,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      noteId,
    };
  });
}

type ChangeInquiryStatusForBusinessInput = {
  businessId: string;
  inquiryId: string;
  actorUserId: string;
  nextStatus: InquiryWorkflowStatus;
};

export async function changeInquiryStatusForBusiness({
  businessId,
  inquiryId,
  actorUserId,
  nextStatus,
}: ChangeInquiryStatusForBusinessInput) {
  const activityId = newEntityId();
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingInquiry] = await tx
      .select({
        id: inquiries.id,
        status: inquiries.status,
        effectiveStatus: getEffectiveInquiryStatus,
        archivedAt: inquiries.archivedAt,
        businessId: businesses.id,
        customerName: inquiries.customerName,
      })
      .from(inquiries)
      .innerJoin(businesses, eq(inquiries.businessId, businesses.id))
      .where(
        and(
          eq(inquiries.id, inquiryId),
          eq(inquiries.businessId, businessId),
          // A soft-deleted inquiry is out of the list; mutating it would
          // only add a misleading activity row.
          isNull(inquiries.deletedAt),
        ),
      )
      .limit(1);

    if (!existingInquiry) {
      return null;
    }

    if (existingInquiry.archivedAt) {
      return {
        changed: false,
        locked: true,
        lockedReason: "archived" as const,
        previousStatus: existingInquiry.status,
        nextStatus: existingInquiry.status,
        effectiveStatus: existingInquiry.effectiveStatus,
      };
    }

    if (existingInquiry.status === nextStatus) {
      // Nothing to write. The visible status may still be derived (an open
      // inquiry with a past deadline reads as "overdue"), so the caller is
      // told the status the owner actually sees.
      return {
        changed: false,
        locked: false,
        previousStatus: existingInquiry.status,
        nextStatus,
        effectiveStatus: existingInquiry.effectiveStatus,
      };
    }

    await tx
      .update(inquiries)
      .set({
        status: nextStatus,
        updatedAt: now,
      })
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)));

    // Read the effective status back so the confirmation matches the badge
    // the owner is about to see.
    const [updatedInquiry] = await tx
      .select({ effectiveStatus: getEffectiveInquiryStatus })
      .from(inquiries)
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)))
      .limit(1);

    await tx.insert(activityLogs).values({
      id: activityId,
      businessId,
      inquiryId,
      actorUserId,
      type: "inquiry.status_changed",
      summary: `Inquiry moved from ${getInquiryStatusLabel(
        existingInquiry.status,
      )} to ${getInquiryStatusLabel(nextStatus)}.`,
      metadata: {
        previousStatus: existingInquiry.status,
        nextStatus,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      locked: false,
      previousStatus: existingInquiry.status,
      nextStatus,
      effectiveStatus: updatedInquiry?.effectiveStatus ?? nextStatus,
    };
  });
}

type UpdateInquiryFieldsForBusinessInput = {
  businessId: string;
  inquiryId: string;
  actorUserId: string;
  fields: Partial<{
    subject: string | null;
    customerName: string;
    customerEmail: string | null;
    customerContactMethod: string;
    customerContactHandle: string;
    requestedDeadline: string | null;
    budgetText: string | null;
    details: string;
  }>;
};

export async function updateInquiryFieldsForBusiness({
  businessId,
  inquiryId,
  actorUserId,
  fields,
}: UpdateInquiryFieldsForBusinessInput) {
  const now = new Date();
  const cleanFields = Object.fromEntries(
    Object.entries(fields).filter(([, value]) => value !== undefined),
  ) as UpdateInquiryFieldsForBusinessInput["fields"];

  if (!Object.keys(cleanFields).length) {
    return {
      updated: false,
      locked: false,
    } as const;
  }

  return db.transaction(async (tx) => {
    const [existingInquiry] = await tx
      .select({
        id: inquiries.id,
        archivedAt: inquiries.archivedAt,
        businessId: businesses.id,
        customerName: inquiries.customerName,
      })
      .from(inquiries)
      .innerJoin(businesses, eq(inquiries.businessId, businesses.id))
      .where(
        and(
          eq(inquiries.id, inquiryId),
          eq(inquiries.businessId, businessId),
          // A soft-deleted inquiry is out of the list; mutating it would
          // only add a misleading activity row.
          isNull(inquiries.deletedAt),
        ),
      )
      .limit(1);

    if (!existingInquiry) {
      return null;
    }

    if (existingInquiry.archivedAt) {
      return {
        updated: false,
        locked: true,
        lockedReason: "archived",
      } as const;
    }

    await tx
      .update(inquiries)
      .set({
        ...cleanFields,
        updatedAt: now,
      })
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      inquiryId,
      actorUserId,
      type: "inquiry.updated",
      summary: "Inquiry details updated.",
      metadata: {
        changedFields: Object.keys(cleanFields),
      },
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId: existingInquiry.businessId,
      actorUserId,
      entityType: "request",
      entityId: inquiryId,
      action: "request.updated",
      metadata: {
        changedFields: Object.keys(cleanFields),
        customerName: existingInquiry.customerName,
      },
      createdAt: now,
    });

    return {
      updated: true,
      locked: false,
    } as const;
  });
}

type UpdateInquiryRecordStateForBusinessInput = {
  businessId: string;
  inquiryId: string;
  actorUserId: string;
};

/**
 * Shared per-business read receipt: opening the inquiry detail marks it
 * viewed for the whole business. Idempotent single UPDATE — only rows with
 * `firstViewedAt IS NULL` change. No activity/audit row: views must not
 * pollute the inquiry timeline. Returns whether this call marked the row.
 */
export async function markInquiryViewedForBusiness({
  businessId,
  inquiryId,
  actorUserId,
}: {
  businessId: string;
  inquiryId: string;
  actorUserId: string | null;
}): Promise<{ marked: boolean }> {
  const now = new Date();

  const updated = await db
    .update(inquiries)
    .set({
      firstViewedAt: now,
      firstViewedBy: actorUserId,
      updatedAt: now,
    })
    .where(
      and(
        eq(inquiries.id, inquiryId),
        eq(inquiries.businessId, businessId),
        isNull(inquiries.firstViewedAt),
        isNull(inquiries.deletedAt),
      ),
    )
    .returning({ id: inquiries.id });

  return { marked: updated.length > 0 };
}

export async function archiveInquiryForBusiness({
  businessId,
  inquiryId,
  actorUserId,
}: UpdateInquiryRecordStateForBusinessInput) {
  const now = new Date();

  const result = await db.transaction(async (tx) => {
    const [existingInquiry] = await tx
      .select({
        id: inquiries.id,
        status: inquiries.status,
        archivedAt: inquiries.archivedAt,
        businessId: businesses.id,
        customerName: inquiries.customerName,
      })
      .from(inquiries)
      .innerJoin(businesses, eq(inquiries.businessId, businesses.id))
      .where(
        and(
          eq(inquiries.id, inquiryId),
          eq(inquiries.businessId, businessId),
          // A soft-deleted inquiry is out of the list; mutating it would
          // only add a misleading activity row.
          isNull(inquiries.deletedAt),
        ),
      )
      .limit(1);

    if (!existingInquiry) {
      return null;
    }

    if (existingInquiry.archivedAt) {
      return {
        changed: false,
        locked: false,
      };
    }

    await tx
      .update(inquiries)
      .set({
        archivedAt: now,
        archivedBy: actorUserId,
        updatedAt: now,
      })
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      inquiryId,
      actorUserId,
      type: "inquiry.archived",
      summary: "Inquiry archived.",
      metadata: {
        previousStatus: existingInquiry.status,
      },
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId: existingInquiry.businessId,
      actorUserId,
      entityType: "request",
      entityId: inquiryId,
      action: "request.archived",
      metadata: {
        customerName: existingInquiry.customerName,
      },
      createdAt: now,
    });

    return {
      changed: true,
      locked: false,
    };
  });

  return result;
}

export async function unarchiveInquiryForBusiness({
  businessId,
  inquiryId,
  actorUserId,
}: UpdateInquiryRecordStateForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingInquiry] = await tx
      .select({
        id: inquiries.id,
        status: inquiries.status,
        archivedAt: inquiries.archivedAt,
        businessId: businesses.id,
        customerName: inquiries.customerName,
      })
      .from(inquiries)
      .innerJoin(businesses, eq(inquiries.businessId, businesses.id))
      .where(
        and(
          eq(inquiries.id, inquiryId),
          eq(inquiries.businessId, businessId),
          // A soft-deleted inquiry is out of the list; mutating it would
          // only add a misleading activity row.
          isNull(inquiries.deletedAt),
        ),
      )
      .limit(1);

    if (!existingInquiry) {
      return null;
    }

    const nextStatus = normalizeLegacyArchivedInquiryStatus(existingInquiry.status);

    if (!existingInquiry.archivedAt && nextStatus === existingInquiry.status) {
      return {
        changed: false,
        locked: false,
      };
    }

    await tx
      .update(inquiries)
      .set({
        status: nextStatus,
        archivedAt: null,
        archivedBy: null,
        updatedAt: now,
      })
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      inquiryId,
      actorUserId,
      type: "inquiry.unarchived",
      summary: "Inquiry restored to active.",
      metadata: {
        previousStatus: existingInquiry.status,
        restoredStatus: nextStatus,
      },
      createdAt: now,
      updatedAt: now,
    });

    return {
      changed: true,
      locked: false,
      status: nextStatus,
    };
  });
}

export async function deleteInquiryForBusiness({
  businessId,
  inquiryId,
  actorUserId,
}: UpdateInquiryRecordStateForBusinessInput) {
  const now = new Date();

  return db.transaction(async (tx) => {
    const [existingInquiry] = await tx
      .select({
        id: inquiries.id,
        status: inquiries.status,
        archivedAt: inquiries.archivedAt,
        deletedAt: inquiries.deletedAt,
        businessId: businesses.id,
        customerName: inquiries.customerName,
      })
      .from(inquiries)
      .innerJoin(businesses, eq(inquiries.businessId, businesses.id))
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)))
      .limit(1);

    if (!existingInquiry) {
      return null;
    }

    if (existingInquiry.deletedAt) {
      return {
        changed: false,
        locked: false,
      };
    }

    await tx
      .update(inquiries)
      .set({
        deletedAt: now,
        deletedBy: actorUserId,
        updatedAt: now,
      })
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)));

    await tx.insert(activityLogs).values({
      id: newEntityId(),
      businessId,
      inquiryId,
      actorUserId,
      type: "inquiry.deleted",
      summary: "Inquiry deleted.",
      metadata: {
        previousStatus: existingInquiry.status,
      },
      createdAt: now,
      updatedAt: now,
    });

    await writeAuditLog(tx, {
      businessId: existingInquiry.businessId,
      actorUserId,
      entityType: "request",
      entityId: inquiryId,
      action: "request.deleted",
      metadata: {
        customerName: existingInquiry.customerName,
      },
      createdAt: now,
    });

    return {
      changed: true,
      locked: false,
    };
  });
}

// --- Bulk Mutations ---

export async function bulkArchiveInquiriesForBusiness({
  businessId,
  inquiryIds,
  actorUserId,
}: {
  businessId: string;
  inquiryIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const result = await tx
      .update(inquiries)
      .set({
        archivedAt: now,
        archivedBy: actorUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(inquiries.businessId, businessId),
          inArray(inquiries.id, inquiryIds),
          isNull(inquiries.archivedAt),
          isNull(inquiries.deletedAt),
        ),
      )
      .returning({
        id: inquiries.id,
        status: inquiries.status,
        customerName: inquiries.customerName,
      });

    if (result.length > 0) {
      await tx.insert(activityLogs).values(
        result.map((row) => ({
          id: newEntityId(),
          businessId,
          inquiryId: row.id,
          actorUserId,
          type: "inquiry.archived",
          summary: "Inquiry archived.",
          metadata: {
            previousStatus: row.status,
          },
          createdAt: now,
          updatedAt: now,
        })),
      );

      for (const row of result) {
        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "request",
          entityId: row.id,
          action: "request.archived",
          metadata: {
            customerName: row.customerName,
          },
          createdAt: now,
        });
      }
    }

    return {
      affected: result.length,
      skipped: inquiryIds.length - result.length,
    };
  });
}

export async function bulkDeleteInquiriesForBusiness({
  businessId,
  inquiryIds,
  actorUserId,
}: {
  businessId: string;
  inquiryIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const result = await tx
      .update(inquiries)
      .set({
        deletedAt: now,
        deletedBy: actorUserId,
        updatedAt: now,
      })
      .where(
        and(
          eq(inquiries.businessId, businessId),
          inArray(inquiries.id, inquiryIds),
          isNull(inquiries.deletedAt),
        ),
      )
      .returning({
        id: inquiries.id,
        status: inquiries.status,
        customerName: inquiries.customerName,
      });

    if (result.length > 0) {
      await tx.insert(activityLogs).values(
        result.map((row) => ({
          id: newEntityId(),
          businessId,
          inquiryId: row.id,
          actorUserId,
          type: "inquiry.deleted",
          summary: "Inquiry deleted.",
          metadata: {
            previousStatus: row.status,
          },
          createdAt: now,
          updatedAt: now,
        })),
      );

      for (const row of result) {
        await writeAuditLog(tx, {
          businessId,
          actorUserId,
          entityType: "request",
          entityId: row.id,
          action: "request.deleted",
          metadata: {
            customerName: row.customerName,
          },
          createdAt: now,
        });
      }
    }

    return {
      affected: result.length,
      skipped: inquiryIds.length - result.length,
    };
  });
}

export async function bulkChangeInquiryStatusForBusiness({
  businessId,
  inquiryIds,
  actorUserId,
  targetStatus,
}: {
  businessId: string;
  inquiryIds: string[];
  actorUserId: string;
  targetStatus: "new" | "quoted" | "waiting" | "won" | "lost";
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const previousRows = await tx
      .select({ id: inquiries.id, status: inquiries.status })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.businessId, businessId),
          inArray(inquiries.id, inquiryIds),
          isNull(inquiries.archivedAt),
          isNull(inquiries.deletedAt),
        ),
      );
    const previousById = new Map(previousRows.map((row) => [row.id, row.status]));

    // Only update non-archived, non-deleted inquiries
    const result = await tx
      .update(inquiries)
      .set({
        status: targetStatus,
        updatedAt: now,
      })
      .where(
        and(
          eq(inquiries.businessId, businessId),
          inArray(inquiries.id, inquiryIds),
          isNull(inquiries.archivedAt),
          isNull(inquiries.deletedAt),
        ),
      )
      .returning({ id: inquiries.id });

    // Mirror single-record semantics: already-at-target rows count as
    // affected (preserved contract) but receive no success event.
    const changed = result.filter(
      (row) => previousById.get(row.id) !== targetStatus,
    );

    if (changed.length > 0) {
      await tx.insert(activityLogs).values(
        changed.map((row) => {
          const previousStatus = previousById.get(row.id) ?? targetStatus;
          return {
            id: newEntityId(),
            businessId,
            inquiryId: row.id,
            actorUserId,
            type: "inquiry.status_changed",
            summary: `Inquiry moved from ${getInquiryStatusLabel(
              previousStatus,
            )} to ${getInquiryStatusLabel(targetStatus)}.`,
            metadata: {
              previousStatus,
              nextStatus: targetStatus,
            },
            createdAt: now,
            updatedAt: now,
          };
        }),
      );
    }

    return {
      affected: result.length,
      skipped: inquiryIds.length - result.length,
    };
  });
}

export async function bulkUnarchiveInquiriesForBusiness({
  businessId,
  inquiryIds,
  actorUserId,
}: {
  businessId: string;
  inquiryIds: string[];
  actorUserId: string;
}): Promise<{ affected: number; skipped: number }> {
  const now = new Date();

  return db.transaction(async (tx) => {
    const previousRows = await tx
      .select({ id: inquiries.id, status: inquiries.status })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.businessId, businessId),
          inArray(inquiries.id, inquiryIds),
          isNotNull(inquiries.archivedAt),
          isNull(inquiries.deletedAt),
        ),
      );
    const previousById = new Map(previousRows.map((row) => [row.id, row.status]));

    const cleared = await tx
      .update(inquiries)
      .set({
        archivedAt: null,
        archivedBy: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(inquiries.businessId, businessId),
          inArray(inquiries.id, inquiryIds),
          isNotNull(inquiries.archivedAt),
          isNull(inquiries.deletedAt),
        ),
      )
      .returning({ id: inquiries.id });

    if (cleared.length === 0) {
      return { affected: 0, skipped: inquiryIds.length };
    }

    // Legacy rows archived under the old "archived" status restore as "waiting",
    // mirroring `unarchiveInquiryForBusiness`.
    await tx
      .update(inquiries)
      .set({ status: "waiting", updatedAt: now })
      .where(
        and(
          eq(inquiries.businessId, businessId),
          inArray(
            inquiries.id,
            cleared.map((row) => row.id),
          ),
          eq(inquiries.status, "archived"),
        ),
      );

    await tx.insert(activityLogs).values(
      cleared.map((row) => {
        const previousStatus = previousById.get(row.id) ?? "new";
        const restoredStatus =
          previousStatus === "archived" ? "waiting" : previousStatus;
        return {
          id: newEntityId(),
          businessId,
          inquiryId: row.id,
          actorUserId,
          type: "inquiry.unarchived",
          summary: "Inquiry restored to active.",
          metadata: {
            previousStatus,
            restoredStatus,
          },
          createdAt: now,
          updatedAt: now,
        };
      }),
    );

    return {
      affected: cleared.length,
      skipped: inquiryIds.length - cleared.length,
    };
  });
}
