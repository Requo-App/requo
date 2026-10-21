import { eq } from "drizzle-orm";

import { generateQuoteDraftForBusiness } from "@/features/ai/quote-generator";
import { createAutoDraftQuote } from "@/features/ai/auto-draft";
import { enableAutoFollowUpForQuote } from "@/features/quotes/mutations";
import { getBusinessInquiryPath, getBusinessInvoicePath, getBusinessQuotePath } from "@/features/businesses/routes";
import { getBusinessMessagingSettings } from "@/lib/db/business-access";
import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { releaseUsageReservation, reserveUsage } from "@/lib/ai";
import { inngest } from "@/lib/inngest/client";
import {
  inngestEvents,
  type EnableQuoteAutoFollowUpEventData,
  type InquiryQualifiedEventData,
  type PushInquiryReceivedEventData,
  type PushInvoiceOverdueEventData,
  type PushInvoicePaidEventData,
  type PushInvoiceSentEventData,
  type PushQuoteResponseEventData,
  type PushQuoteSentEventData,
} from "@/lib/inngest/events";
import {
  sendPushToBusinessSubscribers,
  sendPushToUserSubscriptionsForBusiness,
} from "@/lib/push/send";

type BatchedRecipient<T> = { userId: string; payload: T };

export const pushInquiryReceived = inngest.createFunction(
  {
    id: "push-inquiry-received",
    name: "Push notification for new inquiry",
    triggers: [{ event: inngestEvents.pushInquiryReceived }],
    retries: 2,
  },
  async ({ event, step }) => {
    const eventData = event.data as
      | PushInquiryReceivedEventData
      | { recipients: BatchedRecipient<PushInquiryReceivedEventData>[] };

    await step.run("send-push-notification", async () => {
      // Support batched recipients format from sendBatchedNotification
      if ("recipients" in eventData && Array.isArray(eventData.recipients)) {
        for (const recipient of eventData.recipients) {
          const data = recipient.payload;

          const businessSettings = await getBusinessMessagingSettings(data.businessId);
          if (!businessSettings?.notifyPushOnNewInquiry) {
            return { skipped: true };
          }

          await sendPushToUserSubscriptionsForBusiness(
            data.businessId,
            recipient.userId,
            {
              title: "New inquiry received",
              body: `${data.customerName} submitted an inquiry.`,
              url: getBusinessInquiryPath(data.businessSlug, data.inquiryId),
            },
          );
        }
        return { sent: true };
      }

      // Legacy: single event with full data
      const data = eventData as PushInquiryReceivedEventData;
      const businessSettings = await getBusinessMessagingSettings(data.businessId);

      if (!businessSettings?.notifyPushOnNewInquiry) {
        return { skipped: true };
      }

      await sendPushToBusinessSubscribers(data.businessId, {
        title: "New inquiry received",
        body: `${data.customerName} submitted an inquiry.`,
        url: getBusinessInquiryPath(data.businessSlug, data.inquiryId),
      });

      return { sent: true };
    });

    return { ok: true };
  },
);

export const pushQuoteSent = inngest.createFunction(
  {
    id: "push-quote-sent",
    name: "Push notification for quote sent",
    triggers: [{ event: inngestEvents.pushQuoteSent }],
    retries: 2,
  },
  async ({ event, step }) => {
    const eventData = event.data as
      | PushQuoteSentEventData
      | { recipients: BatchedRecipient<PushQuoteSentEventData>[] };

    await step.run("send-push-notification", async () => {
      // Support batched recipients format from sendBatchedNotification
      if ("recipients" in eventData && Array.isArray(eventData.recipients)) {
        for (const recipient of eventData.recipients) {
          const data = recipient.payload;
          await sendPushToUserSubscriptionsForBusiness(
            data.businessId,
            recipient.userId,
            {
              title: "Quote sent",
              body: `Quote ${data.quoteNumber} sent to ${data.customerName}.`,
              url: getBusinessQuotePath(data.businessSlug, data.quoteId),
            },
          );
        }
        return { sent: true };
      }

      // Legacy: single event with full data
      const data = eventData as PushQuoteSentEventData;
      await sendPushToBusinessSubscribers(data.businessId, {
        title: "Quote sent",
        body: `Quote ${data.quoteNumber} sent to ${data.customerName}.`,
        url: getBusinessQuotePath(data.businessSlug, data.quoteId),
      });

      return { sent: true };
    });

    return { ok: true };
  },
);

export const pushQuoteResponse = inngest.createFunction(
  {
    id: "push-quote-response",
    name: "Push notification for quote response",
    triggers: [{ event: inngestEvents.pushQuoteResponse }],
    retries: 2,
  },
  async ({ event, step }) => {
    const eventData = event.data as
      | PushQuoteResponseEventData
      | { recipients: BatchedRecipient<PushQuoteResponseEventData>[] };

    await step.run("send-push-notification", async () => {
      // Support batched recipients format from sendBatchedNotification
      if ("recipients" in eventData && Array.isArray(eventData.recipients)) {
        for (const recipient of eventData.recipients) {
          const data = recipient.payload;
          await sendPushToUserSubscriptionsForBusiness(
            data.businessId,
            recipient.userId,
            {
              title: `Quote ${data.responseLabel}`,
              body: `${data.customerName} ${data.responseLabel} quote ${data.quoteNumber}.`,
              url: getBusinessQuotePath(data.businessSlug, data.quoteId),
            },
          );
        }
        return { sent: true };
      }

      // Legacy: single event with full data
      const data = eventData as PushQuoteResponseEventData;
      await sendPushToBusinessSubscribers(data.businessId, {
        title: `Quote ${data.responseLabel}`,
        body: `${data.customerName} ${data.responseLabel} quote ${data.quoteNumber}.`,
        url: getBusinessQuotePath(data.businessSlug, data.quoteId),
      });

      return { sent: true };
    });

    return { ok: true };
  },
);

export const pushInvoiceSent = inngest.createFunction(
  {
    id: "push-invoice-sent",
    name: "Push notification for invoice sent",
    triggers: [{ event: inngestEvents.pushInvoiceSent }],
    retries: 2,
  },
  async ({ event, step }) => {
    const eventData = event.data as
      | PushInvoiceSentEventData
      | { recipients: BatchedRecipient<PushInvoiceSentEventData>[] };

    await step.run("send-push-notification", async () => {
      if ("recipients" in eventData && Array.isArray(eventData.recipients)) {
        for (const recipient of eventData.recipients) {
          const data = recipient.payload;
          await sendPushToUserSubscriptionsForBusiness(
            data.businessId,
            recipient.userId,
            {
              title: "Invoice sent",
              body: `Invoice ${data.invoiceNumber} sent to ${data.customerName}.`,
              url: getBusinessInvoicePath(data.businessSlug, data.invoiceId),
            },
          );
        }
        return { sent: true };
      }

      const data = eventData as PushInvoiceSentEventData;
      await sendPushToBusinessSubscribers(data.businessId, {
        title: "Invoice sent",
        body: `Invoice ${data.invoiceNumber} sent to ${data.customerName}.`,
        url: getBusinessInvoicePath(data.businessSlug, data.invoiceId),
      });

      return { sent: true };
    });

    return { ok: true };
  },
);

export const pushInvoicePaid = inngest.createFunction(
  {
    id: "push-invoice-paid",
    name: "Push notification for invoice paid",
    triggers: [{ event: inngestEvents.pushInvoicePaid }],
    retries: 2,
  },
  async ({ event, step }) => {
    const eventData = event.data as
      | PushInvoicePaidEventData
      | { recipients: BatchedRecipient<PushInvoicePaidEventData>[] };

    await step.run("send-push-notification", async () => {
      if ("recipients" in eventData && Array.isArray(eventData.recipients)) {
        for (const recipient of eventData.recipients) {
          const data = recipient.payload;
          await sendPushToUserSubscriptionsForBusiness(
            data.businessId,
            recipient.userId,
            {
              title: "Invoice paid",
              body: `Invoice ${data.invoiceNumber} from ${data.customerName} is paid in full.`,
              url: getBusinessInvoicePath(data.businessSlug, data.invoiceId),
            },
          );
        }
        return { sent: true };
      }

      const data = eventData as PushInvoicePaidEventData;
      await sendPushToBusinessSubscribers(data.businessId, {
        title: "Invoice paid",
        body: `Invoice ${data.invoiceNumber} from ${data.customerName} is paid in full.`,
        url: getBusinessInvoicePath(data.businessSlug, data.invoiceId),
      });

      return { sent: true };
    });

    return { ok: true };
  },
);

export const pushInvoiceOverdue = inngest.createFunction(
  {
    id: "push-invoice-overdue",
    name: "Push notification for overdue invoice",
    triggers: [{ event: inngestEvents.pushInvoiceOverdue }],
    retries: 2,
  },
  async ({ event, step }) => {
    const eventData = event.data as
      | PushInvoiceOverdueEventData
      | { recipients: BatchedRecipient<PushInvoiceOverdueEventData>[] };

    await step.run("send-push-notification", async () => {
      if ("recipients" in eventData && Array.isArray(eventData.recipients)) {
        for (const recipient of eventData.recipients) {
          const data = recipient.payload;
          await sendPushToUserSubscriptionsForBusiness(
            data.businessId,
            recipient.userId,
            {
              title: "Invoice overdue",
              body: `Invoice ${data.invoiceNumber} from ${data.customerName} was due ${data.dueDate}.`,
              url: getBusinessInvoicePath(data.businessSlug, data.invoiceId),
            },
          );
        }
        return { sent: true };
      }

      const data = eventData as PushInvoiceOverdueEventData;
      await sendPushToBusinessSubscribers(data.businessId, {
        title: "Invoice overdue",
        body: `Invoice ${data.invoiceNumber} from ${data.customerName} was due ${data.dueDate}.`,
        url: getBusinessInvoicePath(data.businessSlug, data.invoiceId),
      });

      return { sent: true };
    });

    return { ok: true };
  },
);

export const enableQuoteAutoFollowUp = inngest.createFunction(
  {
    id: "enable-quote-auto-follow-up",
    name: "Enable quote auto follow-up",
    triggers: [{ event: inngestEvents.enableQuoteAutoFollowUp }],
    retries: 2,
  },
  async ({ event, step }) => {
    const data = event.data as EnableQuoteAutoFollowUpEventData;

    await step.run("enable-auto-follow-up", async () => {
      await enableAutoFollowUpForQuote({
        quoteId: data.quoteId,
        delayDays: data.delayDays,
        maxAttempts: data.maxAttempts,
      });
    });

    return { ok: true };
  },
);

export const inquiryQualifiedAiDraft = inngest.createFunction(
  {
    id: "inquiry-qualified-ai-draft",
    name: "Generate AI draft quote for qualified inquiry",
    triggers: [{ event: inngestEvents.inquiryQualified }],
    retries: 2,
    concurrency: {
      limit: 5,
      key: "event.data.businessId",
    },
  },
  async ({ event, step }) => {
    const data = event.data as InquiryQualifiedEventData;

    return step.run("generate-ai-draft-quote", async () => {
      const [business] = await db
        .select({
          autoDraftQuoteOnQualify: businesses.autoDraftQuoteOnQualify,
          ownerUserId: businesses.ownerUserId,
          plan: businesses.plan,
          currency: businesses.defaultCurrency,
        })
        .from(businesses)
        .where(eq(businesses.id, data.businessId))
        .limit(1);

      if (!business?.autoDraftQuoteOnQualify) {
        return { skipped: true };
      }

      const usage = await reserveUsage({
        userId: business.ownerUserId,
        businessId: data.businessId,
        taskType: "quote_draft",
        plan: business.plan,
      });

      if (!usage.allowed) {
        // Degrade silently when the business AI usage limit is hit.
        return { skipped: true, reason: usage.reason };
      }

      const result = await generateQuoteDraftForBusiness({
        businessId: data.businessId,
        userId: business.ownerUserId,
        plan: business.plan,
        inquiryId: data.inquiryId,
        usageReservation: usage.reservation,
      });

      if (!result.ok) {
        await releaseUsageReservation(usage.reservation).catch(() => {});

        return { skipped: true, reason: result.error };
      }

      // Persist the draft. Generating it and throwing it away burned the
      // business's AI credits on every qualified inquiry and produced
      // nothing the owner could open.
      const created = await createAutoDraftQuote({
        businessId: data.businessId,
        inquiryId: data.inquiryId,
        actorUserId: business.ownerUserId,
        currency: business.currency,
        draft: result.draft,
      });

      if (!created) {
        return { drafted: false, reason: "The draft could not be saved." };
      }

      return { drafted: true, quoteId: created.quoteId };
    });
  },
);

export const eventFunctions = [
  inquiryQualifiedAiDraft,
  pushInquiryReceived,
  pushQuoteSent,
  pushQuoteResponse,
  pushInvoiceSent,
  pushInvoicePaid,
  pushInvoiceOverdue,
  enableQuoteAutoFollowUp,
];
