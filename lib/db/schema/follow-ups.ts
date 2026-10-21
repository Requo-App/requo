import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { user } from "@/lib/db/schema/auth";
import { businesses } from "@/lib/db/schema/businesses";
import { inquiries } from "@/lib/db/schema/inquiries";
import { quotes } from "@/lib/db/schema/quotes";

export const followUpStatusEnum = pgEnum("follow_up_status", [
  "pending",
  "completed",
  "skipped",
]);

export const followUpChannelEnum = pgEnum("follow_up_channel", [
  "email",
  "phone",
  "sms",
  "whatsapp",
  "messenger",
  "instagram",
  "other",
]);

export const followUpRecurrenceEnum = pgEnum("follow_up_recurrence", [
  "none",
  "daily",
  "every_3_days",
  "weekly",
  "biweekly",
  "monthly",
]);

export const followUpTerminationConditionEnum = pgEnum(
  "follow_up_termination_condition",
  ["count", "terminal_status"],
);

export const followUpSendModeEnum = pgEnum("follow_up_send_mode", [
  "manual",
  "automatic",
]);

export const followUps = pgTable(
  "follow_ups",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    inquiryId: text("inquiry_id").references(() => inquiries.id, {
      onDelete: "cascade",
    }),
    quoteId: text("quote_id").references(() => quotes.id, {
      onDelete: "cascade",
    }),
    assignedToUserId: text("assigned_to_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    reason: text("reason").notNull(),
    category: text("category").notNull().default("sales"),
    channel: followUpChannelEnum("channel").notNull().default("email"),
    /** Manual = owner sends it; automatic = emailed to customer at dueAt. */
    sendMode: followUpSendModeEnum("send_mode").notNull().default("manual"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    skippedAt: timestamp("skipped_at", { withTimezone: true }),
    status: followUpStatusEnum("status").notNull().default("pending"),
    /** Recurrence pattern — when completed, auto-creates next follow-up. */
    recurrence: followUpRecurrenceEnum("recurrence").notNull().default("none"),
    /** Max number of recurrences (null = unlimited until manually stopped). */
    recurrenceLimit: integer("recurrence_limit"),
    /** How many times this follow-up has recurred so far. */
    recurrenceCount: integer("recurrence_count").notNull().default(0),
    /** Termination condition for recurring follow-ups. */
    terminationCondition: followUpTerminationConditionEnum(
      "termination_condition",
    ),
    /** Parent follow-up ID for recurrence chain tracking. */
    parentFollowUpId: text("parent_follow_up_id"),
    /** Soft-delete timestamp. */
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByUserId: text("deleted_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Optional note recorded when the follow-up is completed (e.g. "left voicemail"). */
    completionNote: text("completion_note"),
    /** Snooze: suppress reminders until this time without changing dueAt. */
    snoozedUntil: timestamp("snoozed_until", { withTimezone: true }),
    /** Whether a reminder notification has been sent for the current due date. */
    reminderSentAt: timestamp("reminder_sent_at", { withTimezone: true }),
    /**
     * When the "still overdue" notification was last raised. Keeps the job
     * from raising the same overdue notice every single day.
     */
    overdueNotifiedAt: timestamp("overdue_notified_at", { withTimezone: true }),
    createdByUserId: text("created_by_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("follow_ups_business_status_due_at_idx").on(
      table.businessId,
      table.status,
      table.dueAt,
    ),
    index("follow_ups_business_pending_due_at_idx")
      .on(table.businessId, table.dueAt)
      .where(sql`${table.status} = 'pending'`),
    index("follow_ups_inquiry_id_idx").on(table.inquiryId),
    index("follow_ups_quote_id_idx").on(table.quoteId),
    index("follow_ups_assigned_to_user_id_idx").on(table.assignedToUserId),
    index("follow_ups_not_deleted_idx")
      .on(table.businessId, table.status)
      .where(sql`${table.deletedAt} is null`),
    check(
      "follow_ups_related_record_required",
      sql`${table.inquiryId} is not null or ${table.quoteId} is not null`,
    ),
  ],
);
