/**
 * Create Inquiry Tool
 * Write operation: creates a real inquiry via the shared submission path.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { businesses, services } from "@/lib/db/schema";
import { and, eq, isNull } from "drizzle-orm";
import { createInquirySchema } from "../schemas";
import { createAssistantInquirySubmission } from "@/features/inquiries/mutations";
import { writeAuditLog } from "@/features/audit/mutations";
import { requireToolRole } from "../permissions";
import type { ErrorResult, ToolExecutionContext } from "../types";

type CreateInquiryInput = z.infer<typeof createInquirySchema>;

type CreateInquiryOutput =
  | {
      type: "inquiry_created";
      data: {
        id: string;
        customerName: string;
        customerEmail: string;
        status: string;
        createdAt: string;
      };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ErrorResult;

export const createInquiryTool = tool<CreateInquiryInput, CreateInquiryOutput>({
  description:
    "Create a new inquiry in the business inbox. This writes a real record — use it when the owner asks to log or create an inquiry.",
  inputSchema: createInquirySchema,
  execute: async (params: CreateInquiryInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    const refusal = requireToolRole(context.userRole, "create_inquiry");
    if (refusal) return refusal;

    try {
      const [business] = await db
        .select({ id: businesses.id, name: businesses.name, slug: businesses.slug })
        .from(businesses)
        .where(eq(businesses.id, context.businessId))
        .limit(1);

      if (!business) {
        return {
          type: "error",
          error: "NOT_FOUND",
          message: "Business not found",
          summary: "Could not create the inquiry because the business was not found",
          retryable: false,
        };
      }

      const contactMethod = params.customerContactMethod ?? "email";
      const contactHandle =
        params.customerContactHandle ??
        (contactMethod === "email" ? params.customerEmail : "") ??
        "";

      // Every inquiry belongs to a service. Resolve the requested slug,
      // falling back to the default service.
      const [selectedForm] = await db
        .select({
          id: services.id,
          name: services.name,
          slug: services.slug,
          businessType: services.businessType,
          isDefault: services.isDefault,
          publicInquiryEnabled: services.publicInquiryEnabled,
        })
        .from(services)
        .where(
          and(
            eq(services.businessId, business.id),
            eq(services.slug, params.serviceSlug),
            isNull(services.archivedAt),
          ),
        )
        .limit(1);
      const [resolvedForm] = selectedForm
        ? [selectedForm]
        : await db
            .select({
              id: services.id,
              name: services.name,
              slug: services.slug,
              businessType: services.businessType,
              isDefault: services.isDefault,
              publicInquiryEnabled: services.publicInquiryEnabled,
            })
            .from(services)
            .where(
              and(
                eq(services.businessId, business.id),
                eq(services.isDefault, true),
                isNull(services.archivedAt),
              ),
            )
            .limit(1);

      if (!resolvedForm) {
        return {
          type: "error",
          error: "NOT_FOUND",
          message: "No active service is available for this business",
          summary: "Could not create the inquiry because no service exists",
          retryable: false,
        };
      }

      const { inquiryId } = await createAssistantInquirySubmission({
        business: {
          id: business.id,
          name: business.name,
          slug: business.slug,
          form: {
            id: resolvedForm.id,
            name: resolvedForm.name,
            slug: resolvedForm.slug,
            businessType: resolvedForm.businessType as never,
            isDefault: resolvedForm.isDefault,
            publicInquiryEnabled: resolvedForm.publicInquiryEnabled,
          },
        },
        actorUserId: context.userId,
        submission: {
          customerName: params.customerName,
          customerEmail: params.customerEmail,
          customerContactMethod: contactMethod,
          customerContactHandle: contactHandle,
          requestedDeadline: params.requestedDeadline,
          budgetText: params.budgetText,
          details: params.details,
          submittedFieldSnapshot: {
            version: 1,
            businessType: "general_project_services",
            fields: [
              {
                id: "assistant-created",
                label: "Created by",
                value: "Business Assistant",
                displayValue: "Business Assistant",
              },
            ],
          },
        },
      });

      await writeAuditLog(db, {
        businessId: context.businessId,
        actorUserId: context.userId,
        entityType: "request",
        entityId: inquiryId,
        action: "request.created",
        metadata: {
          source: "assistant",
          customerName: params.customerName,
          serviceSlug: resolvedForm.slug,
        },
      });

      return {
        type: "inquiry_created",
        data: {
          id: inquiryId,
          customerName: params.customerName,
          customerEmail: params.customerEmail,
          status: "new",
          createdAt: new Date().toISOString(),
        },
        summary: `Created inquiry for ${params.customerName}`,
        metadata: { businessId: context.businessId },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to create inquiry",
        summary: "An error occurred while creating the inquiry",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
