/**
 * Send Quote Tool
 * HIGH-RISK outbound operation: stages a confirmation first and only executes
 * after the owner approves it. Execution reuses the product's quote delivery
 * path (`sendQuoteEmail` + `markQuoteSentForBusiness`) and writes an audit
 * record via that service.
 */

import { tool } from "ai";
import type { ToolExecutionOptions } from "ai";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { businesses, quotes } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { sendQuoteSchema } from "../schemas";
import {
  evaluateQuoteSendGates,
  markQuoteSentForBusiness,
} from "@/features/quotes/mutations";
import { getQuoteSendPayloadForBusiness } from "@/features/quotes/queries";
import { getPublicQuoteUrl } from "@/features/quotes/utils";
import {
  getBusinessMessagingSettings,
  getBusinessOwnerEmails,
} from "@/lib/db/business-access";
import {
  getBusinessInquiryDetailCacheTags,
  getBusinessQuoteDetailCacheTags,
  getBusinessQuoteListCacheTags,
  invalidateCacheTags,
} from "@/lib/cache/business-tags";
import { hasFeatureAccess } from "@/lib/plans";
import { checkUsageAllowance } from "@/lib/plans/usage";
import { env, isEmailConfigured } from "@/lib/env";
import {
  getResendFromEmailConfigurationError,
  getResendSendFailureMessage,
  sendQuoteEmail,
} from "@/lib/email/transactional";
import { requireToolRole } from "../permissions";
import { requestToolConfirmation } from "../session-service";
import type {
  ConfirmationRequiredResult,
  ErrorResult,
  ToolExecutionContext,
} from "../types";

type SendQuoteInput = z.infer<typeof sendQuoteSchema>;

type SendQuoteOutput =
  | ConfirmationRequiredResult
  | {
      type: "quote_sent";
      data: {
        id: string;
        quoteNumber: string;
        deliveryMethod: string;
        sentAt: string;
        publicLink: string;
      };
      summary: string;
    }
  | ErrorResult;

export const sendQuoteTool = tool<SendQuoteInput, SendQuoteOutput>({
  description:
    "Send a quote to the customer via email or generate a shareable link. This notifies the customer, so it always requires the owner's confirmation before executing.",
  inputSchema: sendQuoteSchema,
  execute: async (params: SendQuoteInput, options: ToolExecutionOptions) => {
    const context = options.experimental_context as ToolExecutionContext;

    const refusal = requireToolRole(context.userRole, "send_quote");
    if (refusal) return refusal;

    try {
      const [quote] = await db
        .select({
          id: quotes.id,
          quoteNumber: quotes.quoteNumber,
          status: quotes.status,
          customerName: quotes.customerName,
          updatedAt: quotes.updatedAt,
          totalInCents: quotes.totalInCents,
          currency: quotes.currency,
        })
        .from(quotes)
        .where(
          and(
            eq(quotes.id, params.quoteId),
            eq(quotes.businessId, context.businessId),
          ),
        )
        .limit(1);

      if (!quote) {
        return {
          type: "error",
          error: "NOT_FOUND",
          message: "Quote not found",
          summary: "Could not send the quote because it was not found",
          retryable: false,
        };
      }

      if (quote.status !== "draft") {
        return {
          type: "error",
          error: "VALIDATION_ERROR",
          message: "Only draft quotes can be sent",
          summary: `Quote ${quote.quoteNumber} is ${quote.status}, so it cannot be sent`,
          retryable: false,
        };
      }

      const channel = params.deliveryMethod === "email" ? "email" : "link";
      // Bind the confirmation to the quote the owner is approving. Without
      // this, an edit between staging and approval would be emailed under the
      // old approval — and the prompt showed no amount at all.
      const confirmationParameters: SendQuoteInput = {
        ...params,
        expectedUpdatedAt: quote.updatedAt.toISOString(),
        expectedTotalInCents: quote.totalInCents,
      };
      const totalLabel = new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: quote.currency || "USD",
      }).format(quote.totalInCents / 100);
      const confirmationPrompt = `Send quote ${quote.quoteNumber} to ${quote.customerName} via ${channel} for ${totalLabel}? This will notify the customer.`;
      const confirmationId = await requestToolConfirmation({
        sessionId: context.session.sessionId,
        operation: "send_quote",
        parameters: confirmationParameters,
        confirmationPrompt,
      });

      // This is a high-risk operation, return confirmation request
      return {
        type: "confirmation_required",
        confirmationId,
        operation: "send_quote",
        parameters: confirmationParameters,
        confirmationPrompt,
        riskLevel: "high",
        summary: "Confirmation required to send quote",
        metadata: {
          businessId: context.businessId,
        },
      };
    } catch (error) {
      return {
        type: "error",
        error: "INTERNAL_ERROR",
        message: "Failed to prepare quote sending",
        summary: "An error occurred while preparing to send the quote",
        details: error instanceof Error ? error.message : "Unknown error",
        retryable: true,
      };
    }
  },
});

/**
 * Execute a previously confirmed send_quote operation.
 * The confirmation is consumed exactly once by the caller beforehand.
 */
export async function executeSendQuote(
  context: ToolExecutionContext,
  params: SendQuoteInput,
) {
  const refusal = requireToolRole(context.userRole, "send_quote");
  if (refusal) return refusal;

  const deliveryMethod = params.deliveryMethod === "email" ? "requo" : "manual";

  const [business] = await db
    .select({
      id: businesses.id,
      name: businesses.name,
      plan: businesses.plan,
    })
    .from(businesses)
    .where(eq(businesses.id, context.businessId))
    .limit(1);

  if (!business) {
    return {
      type: "error" as const,
      error: "NOT_FOUND" as const,
      message: "Business not found",
      summary: "Could not send the quote because the business was not found",
      retryable: false,
    };
  }

  const fail = (message: string, summary: string) => ({
    type: "error" as const,
    error: "VALIDATION_ERROR" as const,
    message,
    summary,
    retryable: false,
  });

  try {
    const quote = await getQuoteSendPayloadForBusiness({
      businessId: context.businessId,
      quoteId: params.quoteId,
    });

    if (!quote) return fail("That quote could not be found.", "Quote not found");
    if (quote.status !== "draft")
      return fail("Only draft quotes can be sent.", `Quote ${quote.quoteNumber} is ${quote.status}`);
    if (!quote.publicToken)
      return fail(
        "This quote's customer link is unavailable right now, so it can't be sent.",
        "Quote link unavailable",
      );

    // The quote must still be the one the owner approved.
    if (
      params.expectedUpdatedAt &&
      params.expectedUpdatedAt !== quote.updatedAt.toISOString()
    ) {
      return fail(
        "This quote changed since you approved it. Review the updated quote and confirm again.",
        "Quote changed before sending",
      );
    }

    if (
      typeof params.expectedTotalInCents === "number" &&
      params.expectedTotalInCents !== quote.totalInCents
    ) {
      return fail(
        "This quote's total changed since you approved it. Review the updated quote and confirm again.",
        "Quote total changed before sending",
      );
    }

    const unpricedItems = quote.items.filter(
      (item) => item.unitPriceInCents <= 0,
    );
    if (unpricedItems.length > 0)
      return fail(
        "One or more line items still need pricing review. Set a price before sending this quote.",
        "Quote needs pricing review",
      );

    if (quote.aiReadiness === "needs_confirmation" && !quote.aiAcknowledgedAt)
      return fail(
        "Some line items use suggested prices that need your confirmation first.",
        "Quote pricing needs confirmation",
      );

    // The send gates run BEFORE the customer email: a quote the server
    // considers unsendable must never reach the customer's inbox.
    const sendGates = await evaluateQuoteSendGates({
      businessId: context.businessId,
      quoteId: quote.id,
      actorUserId: context.userId,
      inquiryId: quote.inquiryId,
      quoteNumber: quote.quoteNumber,
      quoteTotalCents: quote.totalInCents,
      validUntil: quote.validUntil,
    });

    if (sendGates.blocked) {
      return fail(
        sendGates.blockers[0] ?? "This quote is not ready to send yet.",
        "Quote send blocked",
      );
    }

    if (deliveryMethod === "requo") {
      const [dailyAllowance, monthlyAllowance] = await Promise.all([
        checkUsageAllowance(business.id, business.plan, "requoDocumentEmailsPerDay"),
        checkUsageAllowance(business.id, business.plan, "requoDocumentEmailsPerMonth"),
      ]);

      if (!dailyAllowance.allowed || !monthlyAllowance.allowed)
        return fail(
          "You've reached the Requo email limit. You can still copy and share the public quote link.",
          "Email limit reached",
        );
    }

    const businessSettings = await getBusinessMessagingSettings(business.id);
    if (!businessSettings)
      return fail("This business could not be loaded.", "Business not found");

    const ownerEmails = await getBusinessOwnerEmails(business.id);
    const publicQuoteUrl = new URL(
      getPublicQuoteUrl(quote.publicToken),
      env.BETTER_AUTH_URL,
    ).toString();

    if (deliveryMethod === "requo") {
      if (!isEmailConfigured)
        return fail(
          "Quote email delivery is unavailable right now.",
          "Email unavailable",
        );

      const resendSenderConfigurationError =
        getResendFromEmailConfigurationError();
      if (resendSenderConfigurationError)
        return fail(resendSenderConfigurationError, "Email not configured");

      try {
        await sendQuoteEmail({
          quoteId: quote.id,
          updatedAt: quote.updatedAt,
          businessName: business.name,
          customerName: quote.customerName,
          customerEmail: quote.customerEmail,
          quoteNumber: quote.quoteNumber,
          title: quote.title,
          publicQuoteUrl,
          currency: quote.currency,
          validUntil: quote.validUntil,
          subtotalInCents: quote.subtotalInCents,
          discountInCents: quote.discountInCents,
          taxInCents: quote.taxInCents,
          taxLabel: quote.taxLabel,
          totalInCents: quote.totalInCents,
          notes: quote.notes,
          emailSignature: businessSettings.defaultEmailSignature,
          items: quote.items,
          templateOverrides: hasFeatureAccess(business.plan, "emailTemplates")
            ? businessSettings.quoteEmailTemplate
            : null,
          replyToEmail: businessSettings.contactEmail ?? ownerEmails[0],
          businessId: business.id,
          userId: context.userId,
        });
      } catch (error) {
        return fail(
          getResendSendFailureMessage(error) ?? "We couldn't send that quote right now.",
          "Quote email failed",
        );
      }
    }

    const result = await markQuoteSentForBusiness({
      businessId: business.id,
      quoteId: quote.id,
      actorUserId: context.userId,
      sendMethod: deliveryMethod,
    });

    if (!result) return fail("That quote could not be found.", "Quote not found");
    if (!result.changed)
      return fail("Only active draft quotes can be sent.", `Quote ${result.quoteNumber} is ${result.status}`);

    invalidateCacheTags([
      ...getBusinessQuoteListCacheTags(business.id),
      ...getBusinessQuoteDetailCacheTags(business.id, quote.id),
      ...(result.inquiryId
        ? getBusinessInquiryDetailCacheTags(business.id, result.inquiryId)
        : []),
    ]);

    // markQuoteSentForBusiness already writes the audit record.
    return {
      type: "quote_sent" as const,
      data: {
        id: quote.id,
        quoteNumber: result.quoteNumber,
        deliveryMethod: params.deliveryMethod,
        sentAt: new Date().toISOString(),
        publicLink: publicQuoteUrl,
      },
      summary:
        deliveryMethod === "manual"
          ? `Quote ${result.quoteNumber} marked as sent. Share link: ${publicQuoteUrl}`
          : `Quote ${result.quoteNumber} sent to ${quote.customerEmail}`,
      metadata: { businessId: business.id },
    };
  } catch (error) {
    return {
      type: "error" as const,
      error: "INTERNAL_ERROR" as const,
      message: "Failed to send quote",
      summary: "An error occurred while sending the quote",
      details: error instanceof Error ? error.message : "Unknown error",
      retryable: true,
    };
  }
}
