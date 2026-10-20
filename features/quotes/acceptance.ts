import "server-only";

import { createHash } from "node:crypto";

import type { QuoteAcceptanceSnapshot } from "@/lib/db/schema/quote-acceptances";
import {
  QUOTE_ACCEPTANCE_METHOD_TYPED_NAME,
  QUOTE_ACCEPTANCE_TEXT,
  QUOTE_ACCEPTANCE_TEXT_VERSION,
} from "@/features/quotes/acceptance-text";

export {
  QUOTE_ACCEPTANCE_METHOD_TYPED_NAME,
  QUOTE_ACCEPTANCE_TEXT,
  QUOTE_ACCEPTANCE_TEXT_VERSION,
};

export type AcceptanceSnapshotInput = Omit<
  QuoteAcceptanceSnapshot,
  "acceptanceText" | "acceptanceTextVersion"
>;

export function validateSignerName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 2 || trimmed.length > 120) return null;
  return trimmed;
}

/** Deterministic JSON: sorted keys, no whitespace variance. */
export function canonicalizeSnapshot(snapshot: QuoteAcceptanceSnapshot): string {
  return JSON.stringify(sortValue(snapshot));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((key) => [
          key,
          sortValue((value as Record<string, unknown>)[key]),
        ]),
    );
  }
  return value;
}

export function hashAcceptanceSnapshot(snapshot: QuoteAcceptanceSnapshot): string {
  return createHash("sha256").update(canonicalizeSnapshot(snapshot)).digest("hex");
}

export function buildAcceptanceSnapshot(
  input: AcceptanceSnapshotInput,
  acceptanceText: string = QUOTE_ACCEPTANCE_TEXT,
  acceptanceTextVersion: number = QUOTE_ACCEPTANCE_TEXT_VERSION,
): QuoteAcceptanceSnapshot {
  return {
    quoteNumber: input.quoteNumber,
    quoteVersion: input.quoteVersion,
    title: input.title,
    businessName: input.businessName,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    currency: input.currency,
    notes: input.notes,
    terms: input.terms,
    validUntil: input.validUntil,
    subtotalInCents: input.subtotalInCents,
    discountInCents: input.discountInCents,
    taxInCents: input.taxInCents,
    taxLabel: input.taxLabel,
    totalInCents: input.totalInCents,
    items: [...input.items]
      .sort((a, b) => a.position - b.position)
      .map((item) => ({
        description: item.description,
        quantity: item.quantity,
        unitPriceInCents: item.unitPriceInCents,
        lineTotalInCents: item.lineTotalInCents,
        position: item.position,
      })),
    acceptanceText,
    acceptanceTextVersion,
  };
}
