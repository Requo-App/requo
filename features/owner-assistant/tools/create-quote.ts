/**
 * Create Quote Tool
 * Write operation: creates a real draft quote via the shared quote service.
 * Drafting is not confirmation-gated; sending is.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { businesses, inquiries, quotes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { createQuoteSchema } from "../schemas";
import { createQuoteForBusiness } from "@/features/quotes/mutations";
import { quoteEditorSchema } from "@/features/quotes/schemas";
import { newEntityId } from "@/lib/ids";
import { requireToolRole, centsToDollars } from "../permissions";
import type { ErrorResult, ToolExecutionContext } from "../types";

type CreateQuoteInput = z.infer<typeof createQuoteSchema>;

type CreateQuoteOutput =
  | {
      type: "quote_created";
      data: {
        id: string;
        quoteNumber: string;
        customerName: string;
        total: number;
        currency: string;
        status: string;
        createdAt: string;
      };
      summary: string;
      metadata?: Record<string, unknown>;
    }
  | ErrorResult;

export const createQuoteTool = tool<CreateQuoteInput, CreateQuoteOutput>({
  description:
    "Create a new draft quote from an inquiry or from scratch with line items. This writes a real draft record — it never sends anything to the customer. Line items are created without prices: the owner sets the price from the saved pricing library or by hand before the quote can be sent.",
  inputSchema: createQuoteSchema,
  execute: async (params: CreateQuoteInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    const refusal = requireToolRole(context.userRole, "create_quote");
    if (refusal) return refusal;

    try {
      const [business] = await db
        .select({
          id: businesses.id,
          defaultCurrency: businesses.defaultCurrency,
        })
        .from(businesses)
        .where(eq(businesses.id, context.businessId))
        .limit(1);

      if (!business) {
        return {
          type: "error",
          error: "NOT_FOUND",
          message: "Business not found",
          summary: "Could not create the quote because the business was not found",
          retryable: false,
        };
      }

      // Resolve the customer + validate an explicit inquiryId belongs to us.
      let customerName = params.customerName ?? "";
      let customerEmail = params.customerEmail ?? "";
      let contactMethod = "email";
      let contactHandle = customerEmail;

      if (params.inquiryId) {
        const [inquiry] = await db
          .select({
            id: inquiries.id,
            customerName: inquiries.customerName,
            customerEmail: inquiries.customerEmail,
            customerContactMethod: inquiries.customerContactMethod,
            customerContactHandle: inquiries.customerContactHandle,
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
            summary: "Could not create the quote because the inquiry was not found",
            retryable: false,
          };
        }

        customerName = customerName || inquiry.customerName;
        customerEmail = customerEmail || inquiry.customerEmail || "";
        contactMethod = inquiry.customerContactMethod || contactMethod;
        contactHandle = inquiry.customerContactHandle || contactHandle;
      }

      if (!customerName) {
        return {
          type: "error",
          error: "VALIDATION_ERROR",
          message: "A customer name is required to create a quote",
          summary: "Could not create the quote without a customer name",
          retryable: false,
        };
      }

      if (contactMethod === "email" && !contactHandle) {
        contactHandle = customerEmail;
      }

      // The tool schema asks for a full UTC timestamp; the quote schema
      // wants a plain calendar date. Without the normalisation the two are
      // mutually unsatisfiable and "create a quote valid until X" always
      // failed.
      const validUntil = params.validUntil
        ? params.validUntil.slice(0, 10)
        : (() => {
            const d = new Date();
            d.setUTCDate(d.getUTCDate() + 30);
            return d.toISOString().slice(0, 10);
          })();

      const parsed = quoteEditorSchema.safeParse({
        title: `Quote for ${customerName}`,
        customerName,
        customerEmail: customerEmail || undefined,
        customerContactMethod: contactMethod,
        customerContactHandle: contactHandle,
        notes: params.notes,
        terms: params.terms,
        validUntil,
        discountInCents: 0,
        taxInCents: 0,
        items: params.lineItems.map((item) => ({
          id: newEntityId(),
          description: item.description,
          quantity: item.quantity,
          // The model never authors a price. Line items start unpriced and the
          // owner sets the amount in the quote editor; `send_quote` refuses a
          // quote that still has unpriced lines.
          unitPriceInCents: 0,
          aiProductStatus: "unpriced" as const,
        })),
      });

      if (!parsed.success) {
        return {
          type: "error",
          error: "VALIDATION_ERROR",
          message: "Quote details did not pass validation",
          summary: "Could not create the quote because the details were invalid",
          details: parsed.error.issues.map((issue) => issue.message),
          retryable: false,
        };
      }

      const created = await createQuoteForBusiness({
        businessId: context.businessId,
        actorUserId: context.userId,
        currency: business.defaultCurrency ?? "USD",
        inquiryId: params.inquiryId ?? null,
        quote: parsed.data,
      });

      if (!created) {
        return {
          type: "error",
          error: "NOT_FOUND",
          message: "Could not save the quote",
          summary: "An error occurred while saving the quote",
          retryable: true,
        };
      }

      const [row] = await db
        .select({ totalInCents: quotes.totalInCents })
        .from(quotes)
        .where(eq(quotes.id, created.id))
        .limit(1);

      const total = centsToDollars(row?.totalInCents);

      // createQuoteForBusiness already writes the audit record.
      return {
        type: "quote_created",
        data: {
          id: created.id,
          quoteNumber: created.quoteNumber,
          customerName,
          total,
          currency: business.defaultCurrency ?? "USD",
          status: "draft",
          createdAt: new Date().toISOString(),
        },
        summary: `Created draft quote ${created.quoteNumber} for ${customerName} with ${params.lineItems.length} line item${params.lineItems.length === 1 ? "" : "s"} awaiting pricing.`,
        metadata: { businessId: context.businessId },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to create quote",
        summary: "An error occurred while creating the quote",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});
