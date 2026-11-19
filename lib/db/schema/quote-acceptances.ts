import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

import { businesses } from "@/lib/db/schema/businesses";
import { quotes } from "@/lib/db/schema/quotes";

export type QuoteAcceptanceSnapshotItem = {
  description: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
  position: number;
};

/**
 * Scope is part of what the customer accepts: the acceptance text covers
 * "the scope, pricing, and terms shown above". Storing the blocks (in display
 * order) makes the hash cover them, so a later scope edit cannot alter the
 * record of what was agreed.
 */
export type QuoteAcceptanceSnapshotScopeBlock = {
  kind: string;
  content: Record<string, unknown>;
};

export type QuoteAcceptanceSnapshotPaymentScheduleItem = {
  label: string;
  category: string;
  amountCents: number;
  dueDate: string | null;
  dueCondition: string | null;
};

/**
 * The schedule acceptance freezes. `null` when the quote had none — existing
 * rows predate this field and remain valid because hashes are stored, not
 * recomputed.
 */
export type QuoteAcceptanceSnapshotPaymentSchedule = {
  version: number;
  items: QuoteAcceptanceSnapshotPaymentScheduleItem[];
} | null;

export type QuoteAcceptanceSnapshot = {
  quoteNumber: string;
  quoteVersion: number;
  title: string;
  businessName: string;
  customerName: string;
  customerEmail: string | null;
  currency: string;
  notes: string | null;
  terms: string | null;
  validUntil: string;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
  totalInCents: number;
  items: QuoteAcceptanceSnapshotItem[];
  scopeBlocks: QuoteAcceptanceSnapshotScopeBlock[];
  paymentSchedule: QuoteAcceptanceSnapshotPaymentSchedule;
  acceptanceText: string;
  acceptanceTextVersion: number;
};

export const quoteAcceptances = pgTable(
  "quote_acceptances",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    quoteVersion: integer("quote_version").notNull(),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    acceptanceMethod: text("acceptance_method").notNull().default("typed_name"),
    acceptanceText: text("acceptance_text").notNull(),
    acceptanceTextVersion: integer("acceptance_text_version").notNull().default(1),
    snapshot: jsonb("snapshot").$type<QuoteAcceptanceSnapshot>().notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("quote_acceptances_business_id_idx").on(table.businessId),
    index("quote_acceptances_quote_id_idx").on(table.quoteId),
    uniqueIndex("quote_acceptances_quote_version_unique").on(
      table.quoteId,
      table.quoteVersion,
    ),
  ],
);
