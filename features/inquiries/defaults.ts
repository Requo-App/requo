import "server-only";

import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { businesses } from "@/lib/db/schema";
import { isInquiryAckEmailEnabled } from "@/lib/env";
import { sendInquiryAcknowledgmentEmail } from "@/lib/email/transactional";
import { sendInquiryQualifiedEvent } from "@/lib/inngest/send";

/**
 * Sends the customer an acknowledgment email after an inquiry is received.
 *
 * Gated by the deployment-level low-email switch (`LOW_EMAIL_MODE`) and the
 * per-business `businesses.sendInquiryAckEmail` setting. Only fires when the
 * customer provided an email address. Silently skips when email delivery is
 * not configured or when low-email mode disables acknowledgment email.
 * Non-blocking: callers fire-and-forget with their own error handling.
 */
export async function maybeSendInquiryAckEmail({
  businessId,
  inquiryId,
  customerEmail,
  customerName,
  serviceName,
  details,
}: {
  businessId: string;
  inquiryId: string;
  customerEmail: string | null | undefined;
  customerName: string;
  serviceName: string;
  details?: string;
}): Promise<void> {
  if (!customerEmail) {
    return;
  }

  if (!isInquiryAckEmailEnabled) {
    return;
  }

  const [business] = await db
    .select({
      sendInquiryAckEmail: businesses.sendInquiryAckEmail,
      name: businesses.name,
      contactEmail: businesses.contactEmail,
    })
    .from(businesses)
    .where(eq(businesses.id, businessId))
    .limit(1);

  if (!business?.sendInquiryAckEmail) {
    return;
  }

  await sendInquiryAcknowledgmentEmail({
    inquiryId,
    businessId,
    businessName: business.name,
    customerEmail,
    customerName,
    serviceCategory: serviceName,
    details,
    replyToEmail: business.contactEmail ?? undefined,
  });
}

/**
 * Queues the AI draft-quote background job for a freshly qualified inquiry.
 * The Inngest function re-checks `autoDraftQuoteOnQualify` and AI usage limits
 * before generating, so this enqueue is safe to fire-and-forget.
 */
export async function enqueueAiDraftQuoteOnQualify({
  businessId,
  inquiryId,
  qualifiedAt,
}: {
  businessId: string;
  inquiryId: string;
  qualifiedAt: string;
}): Promise<void> {
  await sendInquiryQualifiedEvent({
    businessId,
    inquiryId,
    qualifiedAt,
  });
}