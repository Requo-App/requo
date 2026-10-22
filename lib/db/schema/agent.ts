import { index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { businesses } from "@/lib/db/schema/businesses";
import { inquiries } from "@/lib/db/schema/inquiries";

/**
 * Agent sessions, messages, and runs.
 *
 * The Agent is the customer-facing public chat surface. The physical tables
 * and enums keep their `ai_agent_*` names for historical and migration-safety
 * reasons; the application layer calls the feature the Agent.
 */

export const agentSessionStatusEnum = pgEnum("ai_agent_session_status", [
  "active",
  "completed",
  "human_handoff",
  "abandoned",
]);

export const agentMessageRoleEnum = pgEnum("ai_agent_message_role", [
  "user",
  "assistant",
  "tool",
  "system",
]);

export const agentRunStatusEnum = pgEnum("ai_agent_run_status", [
  "running",
  "completed",
  "failed",
]);

export const agentSessions = pgTable(
  "ai_agent_sessions",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    publicToken: text("public_token").notNull().unique(),
    inquiryId: text("inquiry_id").references(() => inquiries.id, {
      onDelete: "set null",
    }),
    status: agentSessionStatusEnum("status").notNull().default("active"),
    state: jsonb("state").notNull().default("{}"),
    metadata: jsonb("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("ai_agent_sessions_business_id_idx").on(table.businessId),
    index("ai_agent_sessions_public_token_idx").on(table.publicToken),
    index("ai_agent_sessions_business_status_idx").on(
      table.businessId,
      table.status,
    ),
    index("ai_agent_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const agentMessages = pgTable(
  "ai_agent_messages",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    role: agentMessageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolName: text("tool_name"),
    toolCallId: text("tool_call_id"),
    provider: text("provider"),
    model: text("model"),
    metadata: jsonb("metadata").notNull().default("{}"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_agent_messages_session_id_idx").on(table.sessionId),
    index("ai_agent_messages_session_created_idx").on(
      table.sessionId,
      table.createdAt,
    ),
    index("ai_agent_messages_session_role_idx").on(
      table.sessionId,
      table.role,
    ),
  ],
);

export const agentRuns = pgTable(
  "ai_agent_runs",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => agentSessions.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    estimatedCostCents: numeric("estimated_cost_cents", {
      precision: 10,
      scale: 4,
    }),
    status: agentRunStatusEnum("status").notNull().default("running"),
    error: text("error"),
    metadata: jsonb("metadata").notNull().default("{}"),
  },
  (table) => [
    index("ai_agent_runs_business_id_idx").on(table.businessId),
    index("ai_agent_runs_session_id_idx").on(table.sessionId),
    index("ai_agent_runs_business_started_idx").on(
      table.businessId,
      table.startedAt,
    ),
    index("ai_agent_runs_status_idx").on(table.status),
  ],
);
