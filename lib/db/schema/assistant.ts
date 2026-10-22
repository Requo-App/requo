import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

import { businesses } from "@/lib/db/schema/businesses";
import { user } from "@/lib/db/schema/auth";
import { agentMessageRoleEnum } from "@/lib/db/schema/agent";

/**
 * Assistant sessions
 *
 * Persisted conversations between business members and the operations
 * assistant. Unlike customer-facing Agent sessions (which use tokens), these
 * are authenticated and scoped to a user within a business.
 *
 * The physical tables remain `owner_assistant_sessions` and
 * `owner_assistant_messages` for historical and migration-safety reasons.
 */
export const assistantSessions = pgTable(
  "owner_assistant_sessions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title"),
    state: jsonb("state").notNull().default("{}"), // Contains lastMentioned entities
    metadata: jsonb("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("owner_assistant_sessions_business_id_idx").on(table.businessId),
    index("owner_assistant_sessions_user_id_idx").on(table.userId),
    index("owner_assistant_sessions_business_user_idx").on(
      table.businessId,
      table.userId,
    ),
    index("owner_assistant_sessions_last_message_idx").on(table.lastMessageAt),
  ],
);

/**
 * Assistant Messages
 *
 * Individual messages within assistant sessions.
 * Stored separately for efficient pagination and retrieval.
 */
export const assistantMessages = pgTable(
  "owner_assistant_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => assistantSessions.id, { onDelete: "cascade" }),
    role: agentMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name"),
    toolCallId: text("tool_call_id"),
    provider: text("provider"), // AI provider used for this message
    model: text("model"), // Model used for this message
    metadata: jsonb("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("owner_assistant_messages_session_id_idx").on(table.sessionId),
    index("owner_assistant_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
  ],
);



/**
 * Relations for query builder
 */
export const assistantSessionsRelations = relations(
  assistantSessions,
  ({ one, many }) => ({
    business: one(businesses, {
      fields: [assistantSessions.businessId],
      references: [businesses.id],
    }),
    user: one(user, {
      fields: [assistantSessions.userId],
      references: [user.id],
    }),
    messages: many(assistantMessages),
  }),
);

export const assistantMessagesRelations = relations(
  assistantMessages,
  ({ one }) => ({
    session: one(assistantSessions, {
      fields: [assistantMessages.sessionId],
      references: [assistantSessions.id],
    }),
  }),
);
