import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { businesses } from "@/lib/db/schema/businesses";
import { quotes } from "@/lib/db/schema/quotes";
import { user } from "@/lib/db/schema/auth";

export const quoteDiscussionSenderTypeEnum = pgEnum(
  "quote_discussion_sender_type",
  ["customer", "business"],
);

/**
 * One conversation per quote. The row is created lazily on the first message,
 * never on quote creation or quote view. The unique quote index is the
 * authoritative guard against duplicate threads under concurrent sends.
 */
export const quoteDiscussions = pgTable(
  "quote_discussions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    /** Set when the quote reaches a terminal state; history stays readable. */
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
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
    uniqueIndex("quote_discussions_quote_unique").on(table.quoteId),
    index("quote_discussions_business_activity_idx").on(
      table.businessId,
      table.lastMessageAt,
    ),
    index("quote_discussions_business_archived_activity_idx").on(
      table.businessId,
      table.archivedAt,
      table.lastMessageAt,
    ),
  ],
);

export const quoteDiscussionMessages = pgTable(
  "quote_discussion_messages",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    discussionId: text("discussion_id")
      .notNull()
      .references(() => quoteDiscussions.id, { onDelete: "cascade" }),
    senderType: quoteDiscussionSenderTypeEnum("sender_type").notNull(),
    /** Nullable: customer messages have no authenticated business user. */
    senderUserId: text("sender_user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    /** Unverified display name. Never treated as a verified identity. */
    senderName: text("sender_name").notNull(),
    body: text("body").notNull(),
    /**
     * Hash of the quote-scoped guest session token, never the token itself.
     * It groups messages from the same browser session without proving who
     * the customer is.
     */
    guestSessionHash: text("guest_session_hash"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("quote_discussion_messages_discussion_created_idx").on(
      table.discussionId,
      table.createdAt,
      table.id,
    ),
    index("quote_discussion_messages_business_created_idx").on(
      table.businessId,
      table.createdAt,
    ),
    check(
      "quote_discussion_messages_body_length",
      sql`char_length(${table.body}) between 1 and 4000 and char_length(${table.senderName}) between 1 and 120`,
    ),
  ],
);

/**
 * Per-member read watermark. A single shared marker would mark a thread read
 * for every teammate, so unread state is tracked per (discussion, user).
 */
export const quoteDiscussionReads = pgTable(
  "quote_discussion_reads",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    discussionId: text("discussion_id")
      .notNull()
      .references(() => quoteDiscussions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    lastReadAt: timestamp("last_read_at", { withTimezone: true })
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
    uniqueIndex("quote_discussion_reads_discussion_user_unique").on(
      table.discussionId,
      table.userId,
    ),
    index("quote_discussion_reads_user_business_idx").on(
      table.userId,
      table.businessId,
    ),
  ],
);
