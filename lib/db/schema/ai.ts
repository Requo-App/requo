import { boolean, index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    businessId: text("business_id").notNull(),
    taskType: text("task_type").notNull(),
    weight: integer("weight").notNull(),
    /**
     * The business plan in effect when the invocation was metered.
     *
     * Monthly usage is summed per (business, plan), so a mid-month plan change
     * starts a fresh allowance for the new plan instead of carrying the old
     * plan's accumulated total against it.
     *
     * Nullable on purpose: rows written before plan attribution existed have no
     * plan. Those legacy rows are treated as belonging to whichever plan is
     * current (`plan = current OR plan IS NULL`) so no business loses its
     * already-accumulated allowance at deploy time.
     */
    plan: text("plan"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_usage_events_user_month_idx").on(table.userId, table.createdAt),
    index("ai_usage_events_business_month_idx").on(
      table.businessId,
      table.createdAt,
    ),
    index("ai_usage_events_business_plan_month_idx").on(
      table.businessId,
      table.plan,
      table.createdAt,
    ),
  ],
);

/**
 * Correctness-critical provider-capacity counters.
 *
 * Request and token buckets are reserved here in one transaction under
 * per-key advisory locks, so concurrent application instances cannot both
 * claim the last slot in a provider's free allowance. Redis mirrors the same
 * counters for selection/ranking, but the mirror is best-effort: losing it
 * degrades routing, it does not relax a hard limit.
 *
 * Keys are the same identifiers the capacity selector uses
 * (`cap:rpm:<model>`, `cap:tpd:<provider>`, …). A row is a fixed window; when
 * `expires_at` passes, the next reservation starts the window again.
 */
export const aiCapacityCounters = pgTable("ai_capacity_counters", {
  key: text("key").primaryKey(),
  value: integer("value").notNull().default(0),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const aiTokenLogs = pgTable(
  "ai_token_logs",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    businessId: text("business_id").notNull(),
    taskType: text("task_type").notNull(),
    model: text("model").notNull(),
    provider: text("provider").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    totalTokens: integer("total_tokens").notNull().default(0),
    estimatedCostCents: integer("estimated_cost_cents"),
    cacheHit: boolean("cache_hit").notNull().default(false),
    latencyMs: integer("latency_ms").notNull(),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    unpriced: boolean("unpriced").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_token_logs_user_idx").on(table.userId),
    index("ai_token_logs_business_idx").on(table.businessId),
    index("ai_token_logs_task_type_idx").on(table.taskType),
    index("ai_token_logs_created_at_idx").on(table.createdAt),
    index("ai_token_logs_provider_idx").on(table.provider),
  ],
);

export const aiRoutingEventTypes = [
  "attempt_failed",
  "fallback_selected",
] as const;
export type AiRoutingEventType = (typeof aiRoutingEventTypes)[number];

/**
 * Transient AI routing diagnostics: failed fallback attempts and the model
 * that served after one or more failures.
 *
 * Privacy contract: rows never contain prompts, responses, message text, or
 * raw provider error bodies. `reason` is the classifier's stable failure kind
 * (for example `rate_limit` or `timeout`), so support can diagnose a turn
 * without reading customer content. `correlationId` joins every event emitted
 * for the same request within the observability boundary.
 *
 * Retention matches `ai_token_logs`: the daily token-log cleanup deletes rows
 * older than 90 days. These rows are operational telemetry, not an audit trail.
 */
export const aiRoutingEvents = pgTable(
  "ai_routing_events",
  {
    id: text("id").primaryKey(),
    correlationId: text("correlation_id").notNull(),
    eventType: text("event_type", { enum: aiRoutingEventTypes }).notNull(),
    taskType: text("task_type").notNull(),
    userId: text("user_id"),
    businessId: text("business_id"),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    reason: text("reason"),
    statusCode: integer("status_code"),
    latencyMs: integer("latency_ms"),
    attempt: integer("attempt").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("ai_routing_events_correlation_idx").on(
      table.correlationId,
      table.createdAt,
    ),
    index("ai_routing_events_created_at_idx").on(table.createdAt),
    index("ai_routing_events_business_idx").on(
      table.businessId,
      table.createdAt,
    ),
  ],
);