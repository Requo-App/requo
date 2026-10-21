/**
 * Update Inquiry Status Tool
 *
 * State-changing operation: stages a confirmation first and only executes
 * after the owner approves it in the UI. Executes through the shared
 * `changeInquiryStatusForBusiness` service and writes an audit record.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { inquiries } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { updateInquiryStatusSchema } from "../schemas";
import { changeInquiryStatusForBusiness } from "@/features/inquiries/mutations";
import { writeAuditLog } from "@/features/audit/mutations";
import { requireToolRole } from "../permissions";
import { requestToolConfirmation } from "../session-service";
import type {
  ConfirmationRequiredResult,
  ErrorResult,
  ToolExecutionContext,
} from "../types";

type UpdateInquiryStatusInput = z.infer<typeof updateInquiryStatusSchema>;

type UpdateInquiryStatusOutput =
  | {
      type: "inquiry_updated";
      data: {
        id: string;
        previousStatus: string;
        nextStatus: string;
      };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ConfirmationRequiredResult
  | ErrorResult;

export const updateInquiryStatusTool = tool<
  UpdateInquiryStatusInput,
  UpdateInquiryStatusOutput
>({
  description:
    "Change an inquiry's pipeline status (quoted, waiting, won, lost). This alters the pipeline, so it always requires the owner's confirmation before executing.",
  inputSchema: updateInquiryStatusSchema,
  execute: async (
    params: UpdateInquiryStatusInput,
    options: ToolExecutionOptions,
  ) => {
    const context = options.experimental_context as ToolExecutionContext;

    const refusal = requireToolRole(context.userRole, "update_inquiry_status");
    if (refusal) return refusal;

    try {
      const [inquiry] = await db
        .select({
          id: inquiries.id,
          status: inquiries.status,
          customerName: inquiries.customerName,
        })
        .from(inquiries)
        .where(
          and(
            eq(inquiries.id, params.inquiryId),
            eq(inquiries.businessId, context.businessId),
          ),
        )
        .limit(1);

      if (!inquiry) {
        return {
          type: "error",
          error: "NOT_FOUND",
          message: "Inquiry not found",
          summary: "Could not change the status because the inquiry was not found",
          retryable: false,
        };
      }

      if (inquiry.status === params.newStatus) {
        return {
          type: "inquiry_updated",
          data: {
            id: inquiry.id,
            previousStatus: inquiry.status,
            nextStatus: params.newStatus,
          },
          summary: `Inquiry for ${inquiry.customerName} is already ${params.newStatus}`,
        };
      }

      // The staged payload freezes the state the owner was shown, so the
      // approval cannot be applied to an inquiry that moved on in between.
      const frozenParams = {
        ...params,
        expectedStatus: inquiry.status,
      };

      const confirmationPrompt = `Change inquiry for ${inquiry.customerName} from ${inquiry.status} to ${params.newStatus}?`;

      const confirmationId = await requestToolConfirmation({
        sessionId: context.session.sessionId,
        operation: "update_inquiry_status",
        parameters: frozenParams,
        confirmationPrompt,
      });

      return {
        type: "confirmation_required",
        confirmationId,
        operation: "update_inquiry_status",
        parameters: frozenParams,
        confirmationPrompt,
        riskLevel: "high",
        summary: "Confirmation required to change inquiry status",
        metadata: { businessId: context.businessId },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to prepare inquiry status change",
        summary: "An error occurred while preparing the status change",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});

/**
 * Execute a previously confirmed update_inquiry_status operation.
 * The confirmation is consumed exactly once by the caller beforehand.
 */
export async function executeUpdateInquiryStatus(
  context: ToolExecutionContext,
  params: UpdateInquiryStatusInput,
) {
  const refusal = requireToolRole(context.userRole, "update_inquiry_status");
  if (refusal) return refusal;

  // The staged confirmation froze the status the owner approved. If the
  // inquiry moved on in between, the approval no longer describes what
  // would happen — refuse instead of overwriting the newer state.
  if (params.expectedStatus) {
    const [current] = await db
      .select({ status: inquiries.status })
      .from(inquiries)
      .where(
        and(
          eq(inquiries.id, params.inquiryId),
          eq(inquiries.businessId, context.businessId),
        ),
      )
      .limit(1);

    if (current && current.status !== params.expectedStatus) {
      return {
        type: "error" as const,
        error: "VALIDATION_ERROR" as const,
        message: `This inquiry changed since you approved it — it is now ${current.status}. Review it and confirm again.`,
        summary: "Inquiry changed before the status update",
        retryable: false,
      };
    }
  }

  const result = await changeInquiryStatusForBusiness({
    businessId: context.businessId,
    inquiryId: params.inquiryId,
    actorUserId: context.userId,
    nextStatus: params.newStatus,
  });

  if (!result) {
    return {
      type: "error" as const,
      error: "NOT_FOUND" as const,
      message: "Inquiry not found",
      summary: "Could not change the status because the inquiry was not found",
      retryable: false,
    };
  }

  if (!result.changed) {
    return {
      type: "inquiry_updated" as const,
      data: {
        id: params.inquiryId,
        previousStatus: result.previousStatus,
        nextStatus: result.nextStatus,
      },
      summary: `Inquiry is already ${result.nextStatus}`,
    };
  }

  await writeAuditLog(db, {
    businessId: context.businessId,
    actorUserId: context.userId,
    entityType: "request",
    entityId: params.inquiryId,
    action: "request.status_changed",
    metadata: {
      source: "assistant",
      previousStatus: result.previousStatus,
      nextStatus: result.nextStatus,
      notes: params.notes ?? null,
    },
  });

  return {
    type: "inquiry_updated" as const,
    data: {
      id: params.inquiryId,
      previousStatus: result.previousStatus,
      nextStatus: result.nextStatus,
    },
    summary: `Inquiry moved from ${result.previousStatus} to ${result.nextStatus}`,
    metadata: { businessId: context.businessId },
  };
}
