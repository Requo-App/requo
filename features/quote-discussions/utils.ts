import type {
  QuoteDiscussionMessageView,
  QuoteDiscussionState,
} from "@/features/quote-discussions/types";
import type { QuoteStatus } from "@/features/quotes/types";

export const quoteDiscussionMessageMaxLength = 4000;
export const quoteDiscussionSenderNameMaxLength = 120;
export const quoteDiscussionSenderNameMinLength = 2;

/** Quote statuses that end the customer-response window. */
const terminalQuoteStatuses: readonly QuoteStatus[] = [
  "accepted",
  "rejected",
  "expired",
  "voided",
];

export function isTerminalQuoteStatus(status: string): boolean {
  return terminalQuoteStatuses.includes(status as QuoteStatus);
}

/**
 * A discussion is open while its quote is still waiting on the customer.
 * `revision_requested` stays open: the business can still answer questions
 * while preparing the next version.
 */
export function isQuoteDiscussionOpen({
  status,
  validUntil,
  quoteArchived = false,
  today = new Date(),
}: {
  status: string;
  validUntil: string;
  quoteArchived?: boolean;
  today?: Date;
}) {
  if (quoteArchived || isTerminalQuoteStatus(status)) {
    return false;
  }

  if (status === "sent" && validUntil < getUtcDateString(today)) {
    return false;
  }

  return status === "sent" || status === "revision_requested";
}

export function deriveQuoteDiscussionState({
  archivedAt,
  quoteStatus,
  latestSenderType,
}: {
  archivedAt?: string | null;
  quoteStatus: string;
  latestSenderType?: "customer" | "business" | null;
}): QuoteDiscussionState {
  if (archivedAt || isTerminalQuoteStatus(quoteStatus)) {
    return "archived";
  }

  return latestSenderType === "customer"
    ? "needs_reply"
    : "waiting_for_customer";
}

export function getUtcDateString(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export type MessageValidationResult =
  | { ok: true; body: string }
  | { ok: false; error: string };

export function validateQuoteDiscussionMessageBody(
  value: unknown,
): MessageValidationResult {
  const body = typeof value === "string" ? value.trim() : "";

  if (!body) {
    return { ok: false, error: "Enter a message before sending." };
  }

  if (body.length > quoteDiscussionMessageMaxLength) {
    return {
      ok: false,
      error: `Messages must be ${quoteDiscussionMessageMaxLength.toLocaleString("en-US")} characters or fewer.`,
    };
  }

  return { ok: true, body };
}

export function normalizeQuoteDiscussionSenderName(value: unknown) {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  return name;
}

export function validateQuoteDiscussionSenderName(
  value: unknown,
): MessageValidationResult {
  const name = normalizeQuoteDiscussionSenderName(value);

  if (name.length < quoteDiscussionSenderNameMinLength) {
    return {
      ok: false,
      error: `Enter the name you want the business to see (at least ${quoteDiscussionSenderNameMinLength} characters).`,
    };
  }

  if (name.length > quoteDiscussionSenderNameMaxLength) {
    return {
      ok: false,
      error: `Names must be ${quoteDiscussionSenderNameMaxLength} characters or fewer.`,
    };
  }

  return { ok: true, body: name };
}

export function getQuoteDiscussionPreview(body: string, maxLength = 160) {
  const normalized = body.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function formatQuoteDiscussionTimestamp(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function getLatestCustomerMessageName(
  messages: readonly QuoteDiscussionMessageView[],
) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];

    if (message.senderType === "customer") {
      return message.senderName;
    }
  }

  return "";
}
