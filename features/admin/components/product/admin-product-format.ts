import { isBillingCurrency } from "@/lib/billing/currencies";
import { formatPrice } from "@/lib/billing/plans";
import type { EmailOutboxStatus } from "@/lib/db/schema/email";

const productDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

const productDateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatProductDate(value: Date | null): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return productDateFormatter.format(date);
}

export function formatProductDateTime(value: Date | null): string {
  if (!value) {
    return "—";
  }

  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return productDateTimeFormatter.format(date);
}

/**
 * Money for quote totals.
 *
 * Quote currency is free text (default USD), not the billing enum, so only
 * currencies Requo also bills in route through the billing formatter —
 * anything else renders as `<amount> <CODE>` rather than guessing a symbol.
 */
export function formatAdminMoney(
  amountInCents: number,
  currency: string | null,
): string {
  const code = (currency || "USD").toUpperCase();

  if (isBillingCurrency(code)) {
    return formatPrice(amountInCents, code);
  }

  return `${(amountInCents / 100).toFixed(2)} ${code}`;
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ["KB", "MB", "GB"] as const;
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function formatContactHandle(method: string, handle: string): string {
  if (!handle) {
    return method || "—";
  }

  return method ? `${method}: ${handle}` : handle;
}

/**
 * One-line answer to "did this quote actually get sent?".
 *
 * `sentAt` is set for both delivery paths — Requo email *and* manual link
 * sharing (which sends no email). The matching outbox rows distinguish the
 * two: a `sent` row confirms email delivery, recorded-but-unsent rows flag
 * a delivery problem, and no rows at all means the link went out manually.
 */
export function getQuoteDeliverySummary(
  sentAt: Date | null,
  emails: Array<{ status: EmailOutboxStatus }>,
): string {
  if (!sentAt) {
    return "Not sent yet — no delivery on record.";
  }

  if (emails.some((email) => email.status === "sent")) {
    return "Sent by Requo email — delivery confirmed.";
  }

  if (emails.length > 0) {
    return "Sent — delivery emails recorded but none confirmed sent.";
  }

  return "Sent — no delivery email on record (likely shared manually).";
}
