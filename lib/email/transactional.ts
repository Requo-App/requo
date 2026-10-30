import { createHash } from "node:crypto";

import type {
  InvoiceEmailTemplateStored,
  QuoteEmailTemplateStored,
  QuoteFollowUpTemplateStored,
} from "@/features/settings/email-templates";
import { renderBusinessMemberInviteEmail } from "@/emails/templates/business-member-invite";
import { renderEmailVerificationEmail } from "@/emails/templates/email-verification";
import { renderInquiryAcknowledgmentEmail } from "@/emails/templates/inquiry-acknowledgment";
import { renderMagicLinkEmail } from "@/emails/templates/magic-link";
import { renderPasswordResetEmail } from "@/emails/templates/password-reset";
import { renderInvoiceEmail } from "@/emails/templates/invoice-email";
import { renderQuoteEmail } from "@/emails/templates/quote-email";
import { renderQuoteDiscussionReplyEmail } from "@/emails/templates/quote-discussion-reply";
import { EmailSendError } from "@/lib/email/errors";
import {
  getDefaultReplyToEmail,
  getEmailSender,
  getEmailSenderConfigurationError,
  normalizeEmailAddress,
} from "@/lib/email/senders";
import { sendEmailWithFallback } from "@/lib/email/send-email";
import type { EmailType, SendEmailInput } from "@/lib/email/types";
import { isEmailConfigured } from "@/lib/env";
import type { BusinessMemberAssignableRole } from "@/lib/business-members";

type SendPasswordResetEmailInput = {
  userId: string;
  email: string;
  name: string;
  url: string;
  token: string;
};

type SendVerificationEmailInput = {
  userId: string;
  email: string;
  name: string;
  token: string;
  url: string;
};

type SendMagicLinkEmailInput = {
  email: string;
  url: string;
  token: string;
};

type SendBusinessMemberInviteEmailInput = {
  inviteId: string;
  token: string;
  email: string;
  businessName: string;
  inviterName: string;
  role: BusinessMemberAssignableRole;
  inviteUrl: string;
  businessId?: string | null;
  userId?: string | null;
};

type SendQuoteEmailInput = {
  quoteId: string;
  updatedAt: Date;
  businessName: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod?: string;
  customerContactHandle?: string;
  quoteNumber: string;
  title: string;
  publicQuoteUrl: string;
  currency: string;
  validUntil: string;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents?: number;
  taxLabel?: string | null;
  totalInCents: number;
  notes?: string | null;
  emailSignature?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceInCents: number;
    lineTotalInCents: number;
  }>;
  templateOverrides?: QuoteEmailTemplateStored;
  replyToEmail?: string;
  businessId?: string | null;
  userId?: string | null;
};

function hashIdempotencyPart(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

/** Normalized recipient for an idempotency key. */
export function getRecipientKey(email: string) {
  return normalizeEmailAddress(email) ?? email.trim().toLowerCase();
}

function getFallbackReplyTo(preferred?: string) {
  return preferred ?? getDefaultReplyToEmail();
}

function getConfigurationError(emailType: EmailType) {
  return getEmailSenderConfigurationError(emailType);
}

function logDeliverySkipped(reason: string, emailType: EmailType) {
  console.warn(reason, { emailType });
}

async function sendBrandedEmail(input: SendEmailInput) {
  await sendEmailWithFallback({
    ...input,
    from: input.from ?? getEmailSender(input.emailType ?? "notification"),
  });
}

export function getResendFromEmailConfigurationError(
  fromEmail = getEmailSender("quote"),
) {
  return getEmailSenderConfigurationError("quote", fromEmail);
}

export function getResendSendFailureMessage(error: unknown) {
  if (!(error instanceof Error)) {
    return null;
  }

  if (error.message.includes("domain is not verified")) {
    return "Email sender must use an address on a verified sending domain. Personal mailbox addresses belong in the reply-to setting instead.";
  }

  if (!(error instanceof EmailSendError)) {
    return null;
  }

  switch (error.code) {
    case "email_not_configured":
      return "Quote email delivery is unavailable right now. Configure email and try again.";
    case "email_delivery_unknown":
      return "We couldn't confirm whether the email was accepted. Check provider logs before retrying.";
    case "email_send_in_progress":
      return "That email is already being sent. Wait a moment before trying again.";
    case "email_delivery_rejected":
      return error.message;
    default:
      return null;
  }
}

export async function sendMagicLinkEmail({
  email,
  url,
  token,
}: SendMagicLinkEmailInput) {
  if (!isEmailConfigured) {
    logDeliverySkipped(
      "Email is not configured yet. Magic link email delivery was skipped.",
      "auth",
    );
    return;
  }

  const senderConfigurationError = getConfigurationError("auth");

  if (senderConfigurationError) {
    logDeliverySkipped(
      `Email sender is misconfigured. Magic link email delivery was skipped. ${senderConfigurationError}`,
      "auth",
    );
    return;
  }

  const template = renderMagicLinkEmail({ signInUrl: url });

  await sendBrandedEmail({
    emailType: "auth",
    to: email,
    replyTo: getFallbackReplyTo(),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `auth:magic-link:${getRecipientKey(email)}:${hashIdempotencyPart(token)}`,
    metadata: {
      authEvent: "magic_link",
    },
    tags: {
      type: "auth",
      event: "magic_link",
    },
  });
}

export async function sendPasswordResetEmail({
  userId,
  email,
  name,
  url,
  token,
}: SendPasswordResetEmailInput) {
  if (!isEmailConfigured) {
    logDeliverySkipped(
      "Email is not configured yet. Password reset email delivery was skipped.",
      "auth",
    );
    return;
  }

  const senderConfigurationError = getConfigurationError("auth");

  if (senderConfigurationError) {
    logDeliverySkipped(
      `Email sender is misconfigured. Password reset email delivery was skipped. ${senderConfigurationError}`,
      "auth",
    );
    return;
  }

  const template = renderPasswordResetEmail({
    name,
    resetUrl: url,
  });

  await sendBrandedEmail({
    emailType: "auth",
    to: email,
    replyTo: getFallbackReplyTo(),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `auth:password-reset:${userId}:${hashIdempotencyPart(token)}`,
    userId,
    metadata: {
      userId,
      authEvent: "password_reset",
    },
    tags: {
      type: "auth",
      event: "password_reset",
    },
  });
}

export async function sendVerificationEmail({
  userId,
  email,
  name,
  token,
  url,
}: SendVerificationEmailInput) {
  if (!isEmailConfigured) {
    throw new Error("Email verification delivery is not configured yet.");
  }

  const senderConfigurationError = getConfigurationError("auth");

  if (senderConfigurationError) {
    throw new Error(senderConfigurationError);
  }

  const template = renderEmailVerificationEmail({
    name,
    verificationUrl: url,
  });

  await sendBrandedEmail({
    emailType: "auth",
    to: email,
    replyTo: getFallbackReplyTo(),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `auth:email-verification:${userId}:${hashIdempotencyPart(token)}`,
    userId,
    metadata: {
      userId,
      authEvent: "email_verification",
    },
    tags: {
      type: "auth",
      event: "email_verification",
    },
  });
}

export async function sendBusinessMemberInviteEmail({
  inviteId,
  token,
  email,
  businessName,
  inviterName,
  role,
  inviteUrl,
  businessId,
  userId,
}: SendBusinessMemberInviteEmailInput) {
  if (!isEmailConfigured) {
    logDeliverySkipped(
      "Email is not configured yet. Business member invite delivery was skipped.",
      "system",
    );
    return false;
  }

  const senderConfigurationError = getConfigurationError("system");

  if (senderConfigurationError) {
    logDeliverySkipped(
      `Email sender is misconfigured. Business member invite delivery was skipped. ${senderConfigurationError}`,
      "system",
    );
    return false;
  }

  const template = renderBusinessMemberInviteEmail({
    businessName,
    inviterName,
    role,
    inviteUrl,
  });

  await sendBrandedEmail({
    emailType: "system",
    to: email,
    replyTo: getFallbackReplyTo(),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `business-member-invite:${inviteId}:${hashIdempotencyPart(token)}:${getRecipientKey(email)}`,
    businessId,
    userId,
    metadata: {
      inviteId,
      businessId,
      role,
    },
    tags: {
      type: "system",
      event: "business_member_invite",
    },
  });

  return true;
}

export async function sendQuoteEmail({
  quoteId,
  updatedAt,
  businessName,
  customerName,
  customerEmail,
  quoteNumber,
  title,
  publicQuoteUrl,
  currency,
  validUntil,
  subtotalInCents,
  discountInCents,
  taxInCents,
  taxLabel,
  totalInCents,
  notes,
  emailSignature,
  items,
  templateOverrides,
  replyToEmail,
  businessId,
  userId,
}: SendQuoteEmailInput) {
  if (!customerEmail) {
    return;
  }

  if (!isEmailConfigured) {
    throw new Error("Quote delivery email is not configured yet.");
  }

  const senderConfigurationError = getConfigurationError("quote");

  if (senderConfigurationError) {
    throw new Error(senderConfigurationError);
  }

  const template = renderQuoteEmail({
    businessName,
    customerName,
    quoteNumber,
    title,
    publicQuoteUrl,
    currency,
    validUntil,
    subtotalInCents,
    discountInCents,
    taxInCents,
    taxLabel,
    totalInCents,
    notes,
    emailSignature,
    items,
    templateOverrides,
  });

  await sendBrandedEmail({
    emailType: "quote",
    to: customerEmail,
    replyTo: getFallbackReplyTo(replyToEmail),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `quote:${quoteId}:sent:${getRecipientKey(customerEmail)}`,
    businessId,
    userId,
    metadata: {
      quoteId,
      quoteNumber,
      businessId,
      updatedAt: updatedAt.toISOString(),
    },
    tags: {
      type: "quote",
      event: "quote_sent",
    },
  });
}

export async function sendQuoteDiscussionReplyEmail({
  discussionId,
  messageId,
  businessId,
  businessName,
  customerName,
  customerEmail,
  quoteNumber,
  replyPreview,
  publicQuoteUrl,
}: {
  discussionId: string;
  messageId: string;
  businessId: string;
  businessName: string;
  customerName: string;
  customerEmail: string | null;
  quoteNumber: string;
  replyPreview: string;
  publicQuoteUrl: string;
}): Promise<boolean> {
  if (!customerEmail) {
    return false;
  }

  if (!isEmailConfigured) {
    logDeliverySkipped(
      "Email is not configured yet. Quote discussion reply delivery was skipped.",
      "quote",
    );
    return false;
  }

  const senderConfigurationError = getConfigurationError("quote");

  if (senderConfigurationError) {
    throw new Error(senderConfigurationError);
  }

  const template = renderQuoteDiscussionReplyEmail({
    businessName,
    customerName,
    quoteNumber,
    replyPreview,
    publicQuoteUrl,
  });

  await sendBrandedEmail({
    emailType: "quote",
    to: customerEmail,
    replyTo: getFallbackReplyTo(),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `quote-discussion:${discussionId}:${messageId}:${getRecipientKey(customerEmail)}`,
    businessId,
    metadata: {
      discussionId,
      quoteNumber,
      businessId,
    },
    tags: {
      type: "quote",
      event: "quote_discussion_reply",
    },
  });

  return true;
}

export async function sendInvoiceEmail({
  invoiceId,
  updatedAt,
  businessName,
  customerName,
  customerEmail,
  invoiceNumber,
  title,
  currency,
  issueDate,
  dueDate,
  subtotalInCents,
  discountInCents,
  taxInCents,
  taxLabel,
  totalInCents,
  balanceInCents,
  notes,
  paymentTerms,
  emailSignature,
  items,
  templateOverrides,
  replyToEmail,
  businessId,
  userId,
}: {
  invoiceId: string;
  updatedAt: Date;
  businessName: string;
  customerName: string;
  customerEmail: string | null;
  invoiceNumber: string;
  title: string;
  currency: string;
  issueDate: string;
  dueDate: string;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents?: number;
  taxLabel?: string | null;
  totalInCents: number;
  balanceInCents: number;
  notes?: string | null;
  paymentTerms?: string | null;
  emailSignature?: string | null;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceInCents: number;
    lineTotalInCents: number;
  }>;
  templateOverrides?: InvoiceEmailTemplateStored;
  replyToEmail?: string;
  businessId?: string | null;
  userId?: string | null;
}) {
  if (!customerEmail) {
    return;
  }

  if (!isEmailConfigured) {
    throw new Error("Invoice delivery email is not configured yet.");
  }

  const senderConfigurationError = getConfigurationError("quote");

  if (senderConfigurationError) {
    throw new Error(senderConfigurationError);
  }

  const template = renderInvoiceEmail({
    businessName,
    customerName,
    invoiceNumber,
    title,
    currency,
    issueDate,
    dueDate,
    subtotalInCents,
    discountInCents,
    taxInCents,
    taxLabel,
    totalInCents,
    balanceInCents,
    notes,
    paymentTerms,
    emailSignature,
    items,
    templateOverrides,
  });

  await sendBrandedEmail({
    emailType: "quote",
    to: customerEmail,
    replyTo: getFallbackReplyTo(replyToEmail),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `invoice:${invoiceId}:sent:${getRecipientKey(customerEmail)}`,
    businessId,
    userId,
    metadata: {
      invoiceId,
      invoiceNumber,
      businessId,
      updatedAt: updatedAt.toISOString(),
    },
    tags: {
      type: "invoice",
      event: "invoice_sent",
    },
  });
}

export async function sendQuoteAutoFollowUpEmail({
  quoteId,
  businessName,
  customerName,
  customerEmail,
  quoteNumber,
  title,
  publicQuoteUrl,
  attemptNumber,
  emailSignature,
  templateOverrides,
  replyToEmail,
  businessId,
  idempotencyKey,
}: {
  quoteId: string;
  businessName: string;
  customerName: string;
  customerEmail: string;
  quoteNumber: string;
  title: string;
  publicQuoteUrl: string;
  attemptNumber: number;
  emailSignature?: string | null;
  templateOverrides?: QuoteFollowUpTemplateStored;
  replyToEmail?: string;
  businessId?: string | null;
  /**
   * Overrides the default idempotency key. The default is quote-scoped, so
   * two different follow-ups on the same quote would otherwise share a key
   * and the second email would be swallowed by the outbox.
   */
  idempotencyKey?: string;
}): Promise<boolean> {
  if (!isEmailConfigured) {
    logDeliverySkipped(
      "Email is not configured yet. Quote follow-up email delivery was skipped.",
      "quote",
    );
    return false;
  }

  const senderConfigurationError = getConfigurationError("quote");

  if (senderConfigurationError) {
    throw new Error(senderConfigurationError);
  }

  const { renderQuoteFollowUpEmail } = await import(
    "@/emails/templates/quote-follow-up-email"
  );

  const template = renderQuoteFollowUpEmail({
    businessName,
    customerName,
    quoteNumber,
    title,
    publicQuoteUrl,
    attemptNumber,
    emailSignature,
    templateOverrides,
  });

  await sendBrandedEmail({
    emailType: "quote",
    to: customerEmail,
    replyTo: getFallbackReplyTo(replyToEmail),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey:
      idempotencyKey ??
      `auto-followup:${quoteId}:attempt:${attemptNumber}:${getRecipientKey(customerEmail)}`,
    businessId,
    metadata: {
      quoteId,
      quoteNumber,
      businessId,
      autoFollowUpAttempt: String(attemptNumber),
    },
    tags: {
      type: "quote",
      event: "auto_follow_up",
    },
  });

  return true;
}

/**
 * Branded follow-up email for an unattended customer touchpoint.
 *
 * Used by the follow-up auto-send job when the follow-up is not backed by a
 * quote with a public link (an inquiry follow-up, or a quote follow-up whose
 * quote cannot be linked). Quote follow-ups with a public URL use
 * {@link sendQuoteAutoFollowUpEmail} so the business follow-up template and
 * signature apply.
 */
export async function sendFollowUpAutoSendEmail({
  followUpId,
  businessId,
  businessName,
  customerEmail,
  customerName,
  message,
  ctaLabel,
  ctaUrl,
  emailSignature,
  subject,
  replyToEmail,
  emailType = "inquiry",
}: {
  followUpId: string;
  businessId?: string | null;
  businessName: string;
  customerEmail: string;
  customerName: string;
  message: string;
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  emailSignature?: string | null;
  subject?: string | null;
  replyToEmail?: string;
  emailType?: EmailType;
}): Promise<boolean> {
  if (!isEmailConfigured) {
    logDeliverySkipped(
      "Email is not configured yet. Follow-up email delivery was skipped.",
      emailType,
    );
    return false;
  }

  const senderConfigurationError = getConfigurationError(emailType);

  if (senderConfigurationError) {
    // The caller must be able to tell that nothing was delivered, so the
    // row is not closed and the allowance is not charged.
    throw new Error(senderConfigurationError);
  }

  const { renderFollowUpEmail } = await import(
    "@/emails/templates/follow-up-email"
  );

  const template = renderFollowUpEmail({
    businessName,
    customerName,
    message,
    ctaLabel,
    ctaUrl,
    emailSignature,
    subject,
  });

  await sendBrandedEmail({
    emailType,
    to: customerEmail,
    replyTo: getFallbackReplyTo(replyToEmail),
    subject: template.subject,
    html: template.html,
    text: template.text,
    idempotencyKey: `follow-up-auto-send:${followUpId}:${getRecipientKey(customerEmail)}`,
    businessId,
    metadata: {
      followUpId,
      businessId,
    },
    tags: {
      type: emailType,
      event: "auto_follow_up",
    },
  });

  return true;
}

export async function sendInquiryAcknowledgmentEmail({
  inquiryId,
  businessId,
  businessName,
  customerEmail,
  customerName,
  serviceCategory: serviceName,
  details,
  replyToEmail,
}: {
  inquiryId: string;
  businessId: string;
  businessName: string;
  customerEmail: string;
  customerName: string;
  serviceCategory: string;
  details?: string;
  replyToEmail?: string;
}) {
  if (!isEmailConfigured) {
    logDeliverySkipped(
      "Email is not configured yet. Inquiry acknowledgment email delivery was skipped.",
      "inquiry",
    );
    return;
  }

  const senderConfigurationError = getConfigurationError("inquiry");

  if (senderConfigurationError) {
    logDeliverySkipped(
      `Email sender is misconfigured. Inquiry acknowledgment email delivery was skipped. ${senderConfigurationError}`,
      "inquiry",
    );
    return;
  }

  const template = renderInquiryAcknowledgmentEmail({
    businessName,
    customerName,
    serviceCategory: serviceName,
    details,
  });

  await sendBrandedEmail({
    emailType: "inquiry",
    to: customerEmail,
    replyTo: getFallbackReplyTo(replyToEmail),
    subject: template.subject,
    html: template.html,
    idempotencyKey: `inquiry:${inquiryId}:ack:${getRecipientKey(customerEmail)}`,
    businessId,
    metadata: {
      inquiryId,
      businessId,
      serviceCategory: serviceName,
    },
    tags: {
      type: "inquiry",
      event: "inquiry_acknowledgment",
    },
  });
}

/**
 * Verticalization P1/P2 customer emails. Same record+version+transition
 * content on retry (idempotent): the idempotency key pins the exact version,
 * so re-sends are safe.
 */
export async function sendApprovalEmail({
  businessId,
  businessName,
  customerEmail,
  customerName,
  title,
  decision,
  approvalUrl,
  approvalId,
  version,
  replyToEmail,
}: {
  businessId: string;
  businessName: string;
  customerEmail: string;
  customerName: string;
  title: string;
  decision: "requested" | "approved" | "changes_requested" | "expired" | "reminder";
  approvalUrl?: string | null;
  approvalId: string;
  version: number;
  replyToEmail?: string;
}) {
  if (!isEmailConfigured) {
    return;
  }

  const senderConfigurationError = getConfigurationError("quote");

  if (senderConfigurationError) {
    throw new Error(senderConfigurationError);
  }

  const subject =
    decision === "requested"
      ? `${businessName}: your approval is needed — ${title}`
      : decision === "reminder"
        ? `${businessName}: reminder — ${title} is waiting for approval`
        : `${businessName}: update on ${title}`;

  const lines = [
    `Hi ${customerName},`,
    "",
    decision === "requested"
      ? `${businessName} asked you to review and approve: ${title}.`
      : decision === "reminder"
        ? `A friendly reminder from ${businessName}: ${title} is still waiting for your approval.`
        : `There is an update from ${businessName} on: ${title}.`,
    ...(approvalUrl ? ["", `Review it here: ${approvalUrl}`] : []),
    "",
    "This link is personal to you — please don't forward it.",
  ];

  const text = lines.join("\n");

  await sendBrandedEmail({
    emailType: "quote",
    to: customerEmail,
    replyTo: getFallbackReplyTo(replyToEmail),
    subject,
    html: `<p>${lines.map((line) => (line ? line : "<br />")).join("</p><p>")}</p>`,
    text,
    idempotencyKey: `approval:${approvalId}:v${version}:${decision}:${getRecipientKey(customerEmail)}`,
    businessId,
    metadata: { approvalId, version, businessId, decision },
    tags: { type: "quote", event: `approval_${decision}` },
  });
}

export async function sendChangeOrderEmail({
  businessId,
  businessName,
  customerEmail,
  customerName,
  displayNumber,
  decision,
  approvalUrl,
  changeOrderId,
  replyToEmail,
}: {
  businessId: string;
  businessName: string;
  customerEmail: string;
  customerName: string;
  displayNumber: string;
  decision: "submitted" | "approved" | "rejected";
  approvalUrl?: string | null;
  changeOrderId: string;
  replyToEmail?: string;
}) {
  if (!isEmailConfigured) {
    return;
  }

  const senderConfigurationError = getConfigurationError("quote");

  if (senderConfigurationError) {
    throw new Error(senderConfigurationError);
  }

  const subject =
    decision === "submitted"
      ? `${businessName}: please review change ${displayNumber}`
      : `${businessName}: change ${displayNumber} ${decision}`;

  const text = [
    `Hi ${customerName},`,
    "",
    decision === "submitted"
      ? `${businessName} proposed a change to your quote (${displayNumber}). Please review what changed and approve or decline it.`
      : `${businessName} marked change ${displayNumber} as ${decision}.`,
    ...(approvalUrl ? ["", `Review it here: ${approvalUrl}`] : []),
    "",
    "This link is personal to you — please don't forward it.",
  ].join("\n");

  await sendBrandedEmail({
    emailType: "quote",
    to: customerEmail,
    replyTo: getFallbackReplyTo(replyToEmail),
    subject,
    html: `<p>${text.split("\n").map((line) => (line ? line : "<br />")).join("</p><p>")}</p>`,
    text,
    idempotencyKey: `change-order:${changeOrderId}:${decision}:${getRecipientKey(customerEmail)}`,
    businessId,
    metadata: { changeOrderId, businessId, decision },
    tags: { type: "quote", event: `change_order_${decision}` },
  });
}
