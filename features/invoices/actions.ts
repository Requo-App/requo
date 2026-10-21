"use server";

import { revalidateTag, updateTag } from "next/cache";
import { z } from "zod";

import { getValidationActionState, getUserSafeErrorMessage } from "@/lib/action-state";
import { getOperationalBusinessActionContext } from "@/lib/db/business-access";
import {
  checkDocumentSendConfiguration,
  checkDocumentSendQuota,
  loadDocumentMessagingContext,
} from "@/lib/email/send-prerequisites";
import { getBusinessInvoiceDetailCacheTags, getBusinessInvoiceListCacheTags, getBusinessOverviewCacheTags, uniqueCacheTags } from "@/lib/cache/business-tags";
import { createInvoiceForBusiness, markInvoiceSentForBusiness, recordPaymentForBusiness, updateInvoiceDraftForBusiness, voidInvoiceForBusiness, voidPaymentForBusiness, bulkVoidInvoicesForBusiness } from "@/features/invoices/mutations";
import { getInvoiceForBusiness } from "@/features/invoices/queries";
import { getInvoiceDraftSchema, invoiceSchema, paymentSchema, voidInvoiceSchema, voidPaymentSchema } from "@/features/invoices/schemas";
import type { InvoiceActionState, InvoiceBulkActionState, PaymentActionState } from "@/features/invoices/types";
import { sendPushInvoicePaidEvent, sendPushInvoiceSentEvent } from "@/lib/inngest/send";
import { hasFeatureAccess } from "@/lib/plans/entitlements";
import { getResendSendFailureMessage, sendInvoiceEmail } from "@/lib/email/transactional";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

function invalidate(businessId: string, invoiceId?: string) {
  const tags = uniqueCacheTags([
    ...getBusinessInvoiceListCacheTags(businessId),
    ...getBusinessOverviewCacheTags(businessId),
    ...(invoiceId ? getBusinessInvoiceDetailCacheTags(businessId, invoiceId) : []),
  ]);
  // updateTag purges "use cache" reads (list, detail, payments, activity);
  // revalidateTag converges the route/fetch cache. Quotes uses the same pair.
  for (const tag of tags) updateTag(tag);
  for (const tag of tags) revalidateTag(tag, "max");
}

export async function createInvoiceAction(quoteId: string | null, _prev: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };
  const parsed = invoiceSchema.safeParse({
    title: text(formData, "title"), customerName: text(formData, "customerName"), customerEmail: text(formData, "customerEmail"), customerContactMethod: text(formData, "customerContactMethod") || "email", customerContactHandle: text(formData, "customerContactHandle"), issueDate: text(formData, "issueDate"), dueDate: text(formData, "dueDate"), discountInCents: text(formData, "discount"), taxInCents: text(formData, "tax"), taxLabel: text(formData, "taxLabel"), notes: text(formData, "notes"), paymentTerms: text(formData, "paymentTerms"), items: (() => { try { return JSON.parse(text(formData, "items")); } catch { return []; } })(),
  });
  if (!parsed.success) return getValidationActionState(parsed.error, "Check the highlighted fields and try again.");
  try {
    const result = await createInvoiceForBusiness({ ...parsed.data, quoteId, businessId: access.businessContext.business.id, actorUserId: access.user.id, currency: access.businessContext.business.defaultCurrency });
    if (!result) return { error: "Unable to create invoice." };
    if ("error" in result) return { error: result.error };
    invalidate(access.businessContext.business.id, result.id);
    return { success: result.existing ? "This quote already has an invoice." : "Invoice created.", invoiceId: result.id, invoiceNumber: result.invoiceNumber };
  } catch (error) {
    return { error: getUserSafeErrorMessage(error, "Unable to create invoice. Please try again.") };
  }
}

export async function updateInvoiceDraftAction(invoiceId: string, _prev: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };
  const businessId = access.businessContext.business.id;

  try {
    const invoice = await getInvoiceForBusiness({ businessId, invoiceId });
    if (!invoice) return { error: "Invoice not found." };

    // A quote-linked invoice keeps the quote's line items and totals, so the
    // server discards the submitted ones — validating them against each other
    // would reject a legitimate edit of the customer-facing fields. The
    // persisted invoice decides which rule applies, never the client.
    const schema = getInvoiceDraftSchema(invoice);
    const parsed = schema.safeParse({
      title: text(formData, "title"), customerName: text(formData, "customerName"), customerEmail: text(formData, "customerEmail"), customerContactMethod: text(formData, "customerContactMethod") || "email", customerContactHandle: text(formData, "customerContactHandle"), issueDate: text(formData, "issueDate"), dueDate: text(formData, "dueDate"), discountInCents: text(formData, "discount"), taxInCents: text(formData, "tax"), taxLabel: text(formData, "taxLabel"), notes: text(formData, "notes"), paymentTerms: text(formData, "paymentTerms"), items: (() => { try { return JSON.parse(text(formData, "items")); } catch { return []; } })(),
    });
    if (!parsed.success) return getValidationActionState(parsed.error, "Check the highlighted fields and try again.");
    const result = await updateInvoiceDraftForBusiness({ ...parsed.data, invoiceId, businessId, actorUserId: access.user.id });
    if (!result) return { error: "Invoice not found." };
    if ("error" in result) return { error: result.error };
    invalidate(businessId, invoiceId);
    return { success: "Invoice updated.", invoiceId, invoiceNumber: result.invoiceNumber };
  } catch (error) {
    return { error: getUserSafeErrorMessage(error, "Unable to update invoice. Please try again.") };
  }
}

export async function sendInvoiceAction(invoiceId: string, _prev: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };
  const deliveryMethod = formData.get("deliveryMethod") === "manual" ? "manual" : "requo";

  try {
    const invoice = await getInvoiceForBusiness({ businessId: access.businessContext.business.id, invoiceId });
    if (!invoice) return { error: "Invoice not found." };
    if (invoice.status !== "draft") return { error: "Only draft invoices can be sent." };
    if (deliveryMethod === "requo" && !invoice.customerEmail) {
      return { error: "Add a customer email before sending this invoice with Requo email." };
    }

    if (deliveryMethod === "requo") {
      const quotaAllowed = await checkDocumentSendQuota({
        businessId: access.businessContext.business.id,
        plan: access.businessContext.business.plan,
        dailyKey: "requoDocumentEmailsPerDay",
        monthlyKey: "requoDocumentEmailsPerMonth",
      });
      if (!quotaAllowed) {
        return { error: "You've reached this month's Requo email limit. You can still mark the invoice as sent after manual delivery." };
      }
    }

    const messagingContext = await loadDocumentMessagingContext(access.businessContext.business.id);
    if (!messagingContext) return { error: "This business could not be loaded." };
    const { settings: businessSettings, ownerEmails } = messagingContext;

    if (deliveryMethod === "requo") {
      const configurationError = checkDocumentSendConfiguration(
        "Invoice email delivery is unavailable right now. Configure email and try again.",
      );
      if (configurationError) return { error: configurationError };
      await sendInvoiceEmail({
        invoiceId: invoice.id,
        updatedAt: new Date(),
        businessName: access.businessContext.business.name,
        customerName: invoice.customerName,
        customerEmail: invoice.customerEmail,
        invoiceNumber: invoice.invoiceNumber,
        title: invoice.title,
        currency: invoice.currency,
        issueDate: invoice.issueDate,
        dueDate: invoice.dueDate,
        subtotalInCents: invoice.subtotalInCents,
        discountInCents: invoice.discountInCents,
        taxInCents: invoice.taxInCents,
        taxLabel: invoice.taxLabel,
        totalInCents: invoice.totalInCents,
        balanceInCents: invoice.balanceInCents,
        notes: invoice.notes,
        paymentTerms: invoice.paymentTerms,
        emailSignature: businessSettings.defaultEmailSignature,
        items: invoice.items,
        templateOverrides: hasFeatureAccess(
          access.businessContext.business.plan,
          "emailTemplates",
        )
          ? businessSettings.invoiceEmailTemplate
          : null,
        replyToEmail: businessSettings.contactEmail ?? ownerEmails[0],
        businessId: access.businessContext.business.id,
        userId: access.user.id,
      });
    }

    const result = await markInvoiceSentForBusiness({
      businessId: access.businessContext.business.id,
      invoiceId,
      actorUserId: access.user.id,
      sendMethod: deliveryMethod,
    });
    if (!result) return { error: "Invoice not found." };
    if (!result.changed) return { error: "Only draft invoices can be sent." };
    void sendPushInvoiceSentEvent({
      businessId: access.businessContext.business.id,
      businessSlug: access.businessContext.business.slug,
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      customerName: invoice.customerName,
    }).catch((error) => {
      console.error("Failed to queue push notification for invoice sent.", error);
    });
    invalidate(access.businessContext.business.id, invoiceId);
    return {
      success:
        deliveryMethod === "manual"
          ? `Invoice ${invoice.invoiceNumber} marked as sent after manual delivery.`
          : `Invoice ${invoice.invoiceNumber} sent to ${invoice.customerEmail}.`,
    };
  } catch (error) {
    return { error: getResendSendFailureMessage(error) ?? getUserSafeErrorMessage(error, "We couldn't send that invoice right now.") };
  }
}

export async function markInvoiceSentAction(invoiceId: string, _prev: InvoiceActionState, _formData: FormData): Promise<InvoiceActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };
  try {
    const result = await markInvoiceSentForBusiness({ businessId: access.businessContext.business.id, invoiceId, actorUserId: access.user.id, sendMethod: "manual" });
    if (!result) return { error: "Invoice not found." };
    invalidate(access.businessContext.business.id, invoiceId);
    return { success: result.changed ? "Invoice marked as sent." : "Invoice is already sent." };
  } catch (error) {
    return { error: getUserSafeErrorMessage(error, "Unable to update invoice.") };
  }
}

export async function recordPaymentAction(invoiceId: string, _prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };
  const parsed = paymentSchema.safeParse({ amountInCents: text(formData, "amount"), paymentDate: text(formData, "paymentDate"), method: text(formData, "method"), reference: text(formData, "reference"), notes: text(formData, "notes"), idempotencyKey: text(formData, "idempotencyKey"), currency: text(formData, "currency") });
  if (!parsed.success) return getValidationActionState(parsed.error, "Check the highlighted fields and try again.");
  try {
    const invoice = await getInvoiceForBusiness({ businessId: access.businessContext.business.id, invoiceId });
    const result = await recordPaymentForBusiness({ ...parsed.data, invoiceId, businessId: access.businessContext.business.id, actorUserId: access.user.id });
    if ("error" in result) return { error: result.error };
    if (result.status === "paid" && invoice && !("duplicate" in result && result.duplicate)) {
      void sendPushInvoicePaidEvent({
        businessId: access.businessContext.business.id,
        businessSlug: access.businessContext.business.slug,
        invoiceId,
        invoiceNumber: invoice.invoiceNumber,
        customerName: invoice.customerName,
      }).catch((error) => {
        console.error("Failed to queue push notification for invoice paid.", error);
      });
    }
    invalidate(access.businessContext.business.id, invoiceId);
    return { success: "duplicate" in result && result.duplicate ? `Payment ${result.paymentNumber} already recorded.` : `Payment ${result.paymentNumber} recorded.` };
  } catch (error) {
    return { error: getUserSafeErrorMessage(error, "This payment could not be recorded because the invoice balance has changed. Please review the balance due and try again.") };
  }
}

export async function voidPaymentAction(paymentId: string, invoiceId: string, _prev: PaymentActionState, formData: FormData): Promise<PaymentActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };
  const parsed = voidPaymentSchema.safeParse({ reason: text(formData, "reason"), reasonDetail: text(formData, "reasonDetail") });
  if (!parsed.success) return getValidationActionState(parsed.error, "Choose a reason for voiding this payment.");
  const reason = parsed.data.reasonDetail ? `${parsed.data.reason}|${parsed.data.reasonDetail}` : parsed.data.reason;
  try {
    const result = await voidPaymentForBusiness({ businessId: access.businessContext.business.id, paymentId, actorUserId: access.user.id, reason });
    if (!result) return { error: "Payment not found or already voided." };
    if ("error" in result) return { error: result.error };
    invalidate(access.businessContext.business.id, invoiceId);
    return { success: "Payment voided." };
  } catch (error) {
    return { error: getUserSafeErrorMessage(error, "Unable to void payment. Please try again.") };
  }
}

export async function voidInvoiceAction(invoiceId: string, _prev: InvoiceActionState, formData: FormData): Promise<InvoiceActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };
  const parsed = voidInvoiceSchema.safeParse({ reason: text(formData, "reason"), reasonDetail: text(formData, "reasonDetail") });
  if (!parsed.success) return getValidationActionState(parsed.error, "Choose a reason for voiding this invoice.");
  const reason = parsed.data.reasonDetail ? `${parsed.data.reason}|${parsed.data.reasonDetail}` : parsed.data.reason;
  try {
    const result = await voidInvoiceForBusiness({ businessId: access.businessContext.business.id, invoiceId, actorUserId: access.user.id, reason });
    if (!result) return { error: "Invoice not found." };
    if ("error" in result) return { error: result.error };
    invalidate(access.businessContext.business.id, invoiceId);
    return { success: "Invoice voided." };
  } catch (error) {
    return { error: getUserSafeErrorMessage(error, "Unable to void invoice. Please try again.") };
  }
}

// --- Bulk Action Server Actions ---

const invoiceBulkActionSchema = z.object({
  invoiceIds: z
    .array(z.string().min(1))
    .min(1, "Select at least one invoice.")
    .max(50, "Cannot bulk-update more than 50 invoices at once."),
});

export async function bulkVoidInvoicesAction(
  _prevState: InvoiceBulkActionState,
  formData: FormData,
): Promise<InvoiceBulkActionState> {
  const access = await getOperationalBusinessActionContext();
  if (!access.ok) return { error: access.error };

  const rawIds = formData.get("invoiceIds") as string;
  const parsed = invoiceBulkActionSchema.safeParse({
    invoiceIds: rawIds ? rawIds.split(",").filter(Boolean) : [],
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const parsedReason = voidInvoiceSchema.safeParse({
    reason: text(formData, "reason"),
    reasonDetail: text(formData, "reasonDetail"),
  });

  if (!parsedReason.success) {
    return { error: "Choose a reason for voiding these invoices." };
  }

  const reason = parsedReason.data.reasonDetail
    ? `${parsedReason.data.reason}|${parsedReason.data.reasonDetail}`
    : parsedReason.data.reason;

  try {
    const result = await bulkVoidInvoicesForBusiness({
      businessId: access.businessContext.business.id,
      invoiceIds: parsed.data.invoiceIds,
      actorUserId: access.user.id,
      reason,
    });

    invalidate(access.businessContext.business.id);

    if (result.affected === 0) {
      return {
        error: "No invoices were voided. Void invoices, or invoices with recorded payments, are skipped.",
        affected: 0,
        skipped: result.skipped,
      };
    }

    return {
      success: `${result.affected} invoice${result.affected !== 1 ? "s" : ""} voided.`,
      affected: result.affected,
      skipped: result.skipped,
    };
  } catch (error) {
    console.error("Failed to bulk void invoices.", error);
    return { error: "We couldn't void those invoices right now." };
  }
}
