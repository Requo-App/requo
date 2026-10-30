import { sql } from "drizzle-orm";
import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/lib/db/schema/auth";
import { businesses } from "@/lib/db/schema/businesses";
import { inquiries } from "@/lib/db/schema/inquiries";
import { invoices } from "@/lib/db/schema/invoices";
import { quotes } from "@/lib/db/schema/quotes";

export const businessNotificationTypeEnum = pgEnum("business_notification_type", [
  "public_inquiry_submitted",
  "quote_customer_accepted",
  "quote_customer_rejected",
  "quote_revision_requested",
  "quote_discussion_message",
  "quote_viewed",
  "quote_expiring",
  "follow_up_due",
  "business_member_invite_accepted",
  "business_member_invite_declined",
  "automation",
  "invoice_paid",
  "invoice_overdue",
  "approval_requested",
  "approval_approved",
  "approval_changes_requested",
  "approval_expired",
  "change_order_created",
  "change_order_decided",
]);

export const businessNotifications = pgTable(
  "business_notifications",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    inquiryId: text("inquiry_id").references(() => inquiries.id, {
      onDelete: "set null",
    }),
    quoteId: text("quote_id").references(() => quotes.id, {
      onDelete: "set null",
    }),
    invoiceId: text("invoice_id").references(() => invoices.id, {
      onDelete: "set null",
    }),
    type: businessNotificationTypeEnum("type").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default(
      sql`'{}'::jsonb`,
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("business_notifications_business_created_at_idx").on(
      table.businessId,
      table.createdAt,
    ),
    index("business_notifications_business_type_created_at_idx").on(
      table.businessId,
      table.type,
      table.createdAt,
    ),
    index("business_notifications_inquiry_id_idx").on(table.inquiryId),
    index("business_notifications_quote_id_idx").on(table.quoteId),
    index("business_notifications_invoice_id_idx").on(table.invoiceId),
  ],
);

export const businessNotificationStates = pgTable(
  "business_notification_states",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_notification_states_business_user_unique").on(
      table.businessId,
      table.userId,
    ),
    index("business_notification_states_user_business_idx").on(
      table.userId,
      table.businessId,
    ),
  ],
);

/**
 * Per-notification, per-user read state.
 *
 * A notification is considered read by a user when EITHER
 *   - `business_notification_states.last_read_at` watermark covers it, OR
 *   - an explicit row exists here.
 *
 * Single-click reads insert here so they do not advance the watermark
 * and accidentally mark older notifications as read.
 */
export const businessNotificationReads = pgTable(
  "business_notification_reads",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    notificationId: text("notification_id")
      .notNull()
      .references(() => businessNotifications.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_notification_reads_notification_user_unique").on(
      table.notificationId,
      table.userId,
    ),
    index("business_notification_reads_user_business_idx").on(
      table.userId,
      table.businessId,
    ),
  ],
);
