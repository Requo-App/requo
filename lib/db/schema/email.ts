import { sql } from "drizzle-orm";
import {
  index,
  integer,
  boolean,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/lib/db/schema/auth";
import { businesses } from "@/lib/db/schema/businesses";

export const emailProviders = [
  "resend",
  "mailtrap",
  "brevo",
  "smtp",
] as const;
export type EmailProviderName = (typeof emailProviders)[number];

export const emailProviderEnum = pgEnum("email_provider", [
  ...emailProviders,
]);

export const emailTypes = [
  "notification",
  "system",
  "quote",
  "support",
  "auth",
  "inquiry",
] as const;
export type EmailType = (typeof emailTypes)[number];

export const emailTypeEnum = pgEnum("email_type", [...emailTypes]);

export const emailOutboxStatuses = [
  "pending",
  "sending",
  "sent",
  "failed",
  "unknown",
] as const;
export type EmailOutboxStatus = (typeof emailOutboxStatuses)[number];

export const emailOutboxStatusEnum = pgEnum("email_outbox_status", [
  ...emailOutboxStatuses,
]);

export const emailAttemptStatuses = ["success", "failed"] as const;
export type EmailAttemptStatus = (typeof emailAttemptStatuses)[number];

export const emailAttemptStatusEnum = pgEnum("email_attempt_status", [
  ...emailAttemptStatuses,
]);

export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id").references(() => businesses.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    type: emailTypeEnum("type").notNull().default("notification"),
    to: jsonb("to").$type<string[]>().notNull(),
    cc: jsonb("cc").$type<string[]>(),
    bcc: jsonb("bcc").$type<string[]>(),
    from: text("from").notNull(),
    subject: text("subject").notNull(),
    html: text("html").notNull(),
    textBody: text("text"),
    status: emailOutboxStatusEnum("status").notNull().default("pending"),
    idempotencyKey: text("idempotency_key").notNull(),
    provider: emailProviderEnum("provider"),
    providerMessageId: text("provider_message_id"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("email_outbox_idempotency_key_unique").on(
      table.idempotencyKey,
    ),
    index("email_outbox_business_created_at_idx").on(
      table.businessId,
      table.createdAt,
    ),
    index("email_outbox_status_created_at_idx").on(
      table.status,
      table.createdAt,
    ),
    index("email_outbox_provider_message_id_idx").on(
      table.provider,
      table.providerMessageId,
    ),
  ],
);

export const emailAttempts = pgTable(
  "email_attempts",
  {
    id: text("id").primaryKey(),
    emailOutboxId: text("email_outbox_id")
      .notNull()
      .references(() => emailOutbox.id, { onDelete: "cascade" }),
    provider: emailProviderEnum("provider").notNull(),
    status: emailAttemptStatusEnum("status").notNull(),
    providerMessageId: text("provider_message_id"),
    errorCode: text("error_code"),
    errorMessage: text("error_message"),
    retryable: boolean("retryable").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("email_attempts_outbox_created_at_idx").on(
      table.emailOutboxId,
      table.createdAt,
    ),
    index("email_attempts_provider_created_at_idx").on(
      table.provider,
      table.createdAt,
    ),
  ],
);
