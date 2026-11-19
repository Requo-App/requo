import "server-only";

import type { EmailOutboxStatus, EmailType } from "@/lib/db/schema/email";
import type { SendEmailInput } from "@/lib/email/types";

/**
 * Outbox columns the admin retry needs. Kept as a structural type so the
 * mutation, UI eligibility checks, and tests share one contract.
 */
export type RetryableEmailOutboxRow = {
  businessId: string | null;
  userId: string | null;
  type: EmailType;
  to: string[];
  cc: string[] | null;
  bcc: string[] | null;
  from: string;
  subject: string;
  html: string;
  textBody: string | null;
  status: EmailOutboxStatus;
  idempotencyKey: string;
  metadata: Record<string, unknown>;
};

/**
 * Why an admin cannot safely retry this outbox row right now, or `null`
 * when the existing `sendEmailWithFallback` claim rules can be used.
 *
 * Retrying reuses the row's original idempotency key, so the outbox
 * guard stays authoritative: `sending` rows are in flight, `unknown`
 * rows may already have been accepted by the provider, and `sent` rows
 * have a provider message id. Auth rows store a redacted body and must
 * be reissued through their original flow instead of replayed here.
 */
export function getEmailRetryBlockReason(
  row: RetryableEmailOutboxRow,
): string | null {
  if (row.status === "sent") {
    return "This email was already sent. Retrying would replay it.";
  }

  if (row.status === "sending") {
    return "A delivery attempt is already in progress. Wait for it to finish before retrying.";
  }

  if (row.status === "unknown") {
    return "Delivery status is unknown. Check the provider logs before retrying to avoid a duplicate email.";
  }

  if (row.type === "auth") {
    return "Auth emails contain one-time links or codes and cannot be replayed. Ask the recipient to request a new one.";
  }

  if (!row.html.trim() || row.html === "[redacted auth email body]") {
    return "This email has no stored body to resend. Reissue it from the original flow.";
  }

  return null;
}

/** Rebuild the original send input from the outbox row. */
export function buildEmailRetryInput(
  row: RetryableEmailOutboxRow,
): SendEmailInput {
  return {
    to: row.to,
    cc: row.cc ?? undefined,
    bcc: row.bcc ?? undefined,
    from: row.from,
    subject: row.subject,
    html: row.html,
    text: row.textBody ?? undefined,
    emailType: row.type,
    idempotencyKey: row.idempotencyKey,
    businessId: row.businessId,
    userId: row.userId,
    metadata: row.metadata,
  };
}
