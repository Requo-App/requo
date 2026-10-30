import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { pushSubscriptions } from "@/lib/db/schema/push-subscriptions";
import { inngest } from "@/lib/inngest/client";
import { sendBatchedNotification } from "@/lib/inngest/batch";
import {
  inngestEvents,
  type EnableQuoteAutoFollowUpEventData,
  type InquiryQualifiedEventData,
  type PushInquiryReceivedEventData,
  type PushInvoiceOverdueEventData,
  type PushInvoicePaidEventData,
  type PushInvoiceSentEventData,
  type PushQuoteDiscussionMessageEventData,
  type PushQuoteResponseEventData,
  type PushQuoteSentEventData,
} from "@/lib/inngest/events";

/**
 * Resolves push subscribers for a business and returns recipient entries
 * suitable for `sendBatchedNotification`.
 */
async function resolveBusinessPushRecipients(
  businessId: string,
  payload: unknown,
): Promise<Array<{ userId: string; payload: unknown }>> {
  const subscribers = await db
    .select({ userId: pushSubscriptions.userId })
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.businessId, businessId));

  if (subscribers.length === 0) return [];

  // Deduplicate by userId (a user may have multiple device subscriptions)
  const uniqueUserIds = [...new Set(subscribers.map((s) => s.userId))];

  return uniqueUserIds.map((userId) => ({ userId, payload }));
}

export async function sendPushInquiryReceivedEvent(
  data: PushInquiryReceivedEventData,
): Promise<void> {
  const recipients = await resolveBusinessPushRecipients(
    data.businessId,
    data,
  );

  if (recipients.length === 0) return;

  await sendBatchedNotification(
    inngestEvents.pushInquiryReceived,
    recipients,
  );
}

export async function sendPushQuoteSentEvent(
  data: PushQuoteSentEventData,
): Promise<void> {
  const recipients = await resolveBusinessPushRecipients(
    data.businessId,
    data,
  );

  if (recipients.length === 0) return;

  await sendBatchedNotification(
    inngestEvents.pushQuoteSent,
    recipients,
  );
}

export async function sendPushQuoteResponseEvent(
  data: PushQuoteResponseEventData,
): Promise<void> {
  const recipients = await resolveBusinessPushRecipients(
    data.businessId,
    data,
  );

  if (recipients.length === 0) return;

  await sendBatchedNotification(
    inngestEvents.pushQuoteResponse,
    recipients,
  );
}

export async function sendPushQuoteDiscussionMessageEvent(
  data: PushQuoteDiscussionMessageEventData,
): Promise<void> {
  const recipients = await resolveBusinessPushRecipients(
    data.businessId,
    data,
  );

  if (recipients.length === 0) return;

  await sendBatchedNotification(
    inngestEvents.pushQuoteDiscussionMessage,
    recipients,
  );
}

export async function sendPushInvoiceSentEvent(data: PushInvoiceSentEventData): Promise<void> {
  const recipients = await resolveBusinessPushRecipients(data.businessId, data);

  if (recipients.length === 0) return;

  await sendBatchedNotification(inngestEvents.pushInvoiceSent, recipients);
}

export async function sendPushInvoicePaidEvent(data: PushInvoicePaidEventData): Promise<void> {
  const recipients = await resolveBusinessPushRecipients(data.businessId, data);

  if (recipients.length === 0) return;

  await sendBatchedNotification(inngestEvents.pushInvoicePaid, recipients);
}

export async function sendPushInvoiceOverdueEvent(data: PushInvoiceOverdueEventData): Promise<void> {
  const recipients = await resolveBusinessPushRecipients(data.businessId, data);

  if (recipients.length === 0) return;

  await sendBatchedNotification(inngestEvents.pushInvoiceOverdue, recipients);
}

export async function sendEnableQuoteAutoFollowUpEvent(
  data: EnableQuoteAutoFollowUpEventData,
): Promise<void> {
  await inngest.send({
    name: inngestEvents.enableQuoteAutoFollowUp,
    data,
  });
}

export async function sendInquiryQualifiedEvent(
  data: InquiryQualifiedEventData,
): Promise<void> {
  await inngest.send({
    name: inngestEvents.inquiryQualified,
    data,
  });
}
