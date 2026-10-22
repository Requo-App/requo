import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/lib/db/schema/auth";
import { services } from "@/lib/db/schema/services";
import { businesses } from "@/lib/db/schema/businesses";
import type { InquirySubmittedFieldSnapshot } from "@/features/inquiries/form-config";

export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "new",
  "quoted",
  "waiting",
  "won",
  "lost",
  "archived",
  "overdue",
]);

export const inquiryMessageRoleEnum = pgEnum("inquiry_message_role", [
  "user",
  "assistant",
  "system",
]);

export const inquiryMessageStatusEnum = pgEnum("inquiry_message_status", [
  "completed",
  "generating",
  "failed",
]);

export const inquiries = pgTable(
  "inquiries",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    serviceId: text("business_inquiry_form_id")
      .references(() => services.id, { onDelete: "set null" }),
    status: inquiryStatusEnum("status").notNull().default("new"),
    subject: text("subject"),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    customerContactMethod: text("customer_contact_method")
      .notNull()
      .default("email"),
    customerContactHandle: text("customer_contact_handle").notNull().default(""),
    serviceCategory: text("service_category"),
    requestedDeadline: date("requested_deadline", { mode: "string" }),
    budgetText: text("budget_text"),
    details: text("details").notNull(),
    submittedFieldSnapshot:
      jsonb("submitted_field_snapshot").$type<InquirySubmittedFieldSnapshot>(),
    source: text("source"),
    quoteRequested: boolean("quote_requested").notNull().default(true),
    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastRespondedAt: timestamp("last_responded_at", { withTimezone: true }),
    firstViewedAt: timestamp("first_viewed_at", { withTimezone: true }),
    firstViewedBy: text("first_viewed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by").references(() => user.id, {
      onDelete: "set null",
    }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    qualificationScore: integer("qualification_score"),
    qualificationTemperature: text("qualification_temperature"),
    qualificationSignals: jsonb("qualification_signals"),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    aiAssisted: boolean("ai_assisted").notNull().default(false),
    escalated: boolean("escalated").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inquiries_business_id_idx").on(table.businessId),
    index("inquiries_business_inquiry_form_id_idx").on(
      table.serviceId,
    ),
    index("inquiries_business_status_idx").on(table.businessId, table.status),
    index("inquiries_business_status_created_at_idx").on(
      table.businessId,
      table.status,
      table.createdAt,
    ),
    index("inquiries_business_archived_at_idx").on(
      table.businessId,
      table.archivedAt,
    ),
    index("inquiries_business_deleted_at_idx").on(
      table.businessId,
      table.deletedAt,
    ),
    index("inquiries_business_submitted_at_idx").on(
      table.businessId,
      table.submittedAt,
    ),
    index("inquiries_business_unviewed_idx")
      .on(table.businessId)
      .where(
        sql`${table.firstViewedAt} is null and ${table.archivedAt} is null and ${table.deletedAt} is null`,
      ),
    index("inquiries_open_deadline_idx")
      .on(table.businessId, table.requestedDeadline)
      .where(
        sql`${table.status} in ('new', 'waiting', 'quoted') and ${table.requestedDeadline} is not null and ${table.archivedAt} is null and ${table.deletedAt} is null`,
      ),
    index("inquiries_business_source_idx").on(table.businessId, table.source),
    index("inquiries_business_qualification_score_idx").on(
      table.businessId,
      table.qualificationScore,
    ),
    index("inquiries_ai_assisted_idx").on(
      table.businessId,
      table.aiAssisted,
      table.createdAt,
    ),
    index("inquiries_escalated_idx").on(
      table.businessId,
      table.escalated,
      table.createdAt,
    ),
    // The admin console lists inquiries across every business, so none of
    // the business-scoped indexes above can serve its filter or its
    // `submitted_at DESC, id DESC` ordering.
    index("inquiries_active_submitted_at_idx")
      .on(table.submittedAt, table.id)
      .where(sql`${table.deletedAt} is null`),
  ],
);

export const inquiryMessages = pgTable(
  "inquiry_messages",
  {
    id: text("id").primaryKey(),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    role: inquiryMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    provider: text("provider"),
    model: text("model"),
    status: inquiryMessageStatusEnum("status")
      .notNull()
      .default("completed"),
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
    index("inquiry_messages_inquiry_id_idx").on(table.inquiryId),
    index("inquiry_messages_created_at_idx").on(table.createdAt),
    index("inquiry_messages_inquiry_created_at_idx").on(
      table.inquiryId,
      table.createdAt,
    ),
    index("inquiry_messages_inquiry_created_at_id_idx").on(
      table.inquiryId,
      table.createdAt,
      table.id,
    ),
  ],
);

export const inquiryAttachments = pgTable(
  "inquiry_attachments",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    contentType: text("content_type").notNull(),
    fileSize: integer("file_size").notNull(),
    storagePath: text("storage_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inquiry_attachments_business_id_idx").on(table.businessId),
    index("inquiry_attachments_inquiry_id_idx").on(table.inquiryId),
    index("inquiry_attachments_business_inquiry_idx").on(
      table.businessId,
      table.inquiryId,
    ),
    check(
      "inquiry_attachments_file_size_nonnegative",
      sql`${table.fileSize} >= 0`,
    ),
  ],
);

export const inquiryNotes = pgTable(
  "inquiry_notes",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    authorUserId: text("author_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inquiry_notes_business_id_idx").on(table.businessId),
    index("inquiry_notes_inquiry_id_idx").on(table.inquiryId),
    index("inquiry_notes_business_inquiry_idx").on(
      table.businessId,
      table.inquiryId,
    ),
    index("inquiry_notes_author_user_id_idx").on(table.authorUserId),
  ],
);

export const inquiryDuplicates = pgTable(
  "inquiry_duplicates",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    inquiryId: text("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    originalInquiryId: text("original_inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    tokenOverlap: integer("token_overlap"),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    dismissedBy: text("dismissed_by").references(() => user.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("inquiry_duplicates_business_id_idx").on(table.businessId),
    uniqueIndex("inquiry_duplicates_inquiry_id_idx").on(table.inquiryId),
    index("inquiry_duplicates_original_inquiry_id_idx").on(
      table.originalInquiryId,
    ),
  ],
);
