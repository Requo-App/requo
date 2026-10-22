import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { user } from "@/lib/db/schema/auth";
import { businesses } from "@/lib/db/schema/businesses";
import { quotes } from "@/lib/db/schema/quotes";

export const paymentScheduleStateEnum = pgEnum("commercial_schedule_state", [
  "draft",
  "scheduled",
  "accepted",
  "superseded",
]);

export type PaymentScheduleState =
  (typeof paymentScheduleStateEnum.enumValues)[number];

export const paymentScheduleItemCategoryEnum = pgEnum(
  "commercial_schedule_item_category",
  ["deposit", "milestone", "balance", "retainer"],
);

export type PaymentScheduleItemCategory =
  (typeof paymentScheduleItemCategoryEnum.enumValues)[number];

export const paymentScheduleItemCategories: readonly PaymentScheduleItemCategory[] = [
  "deposit",
  "milestone",
  "balance",
  "retainer",
];

/**
 * Payment schedules (verticalization P5). Quote-side representation of
 * deposit/milestone/balance/retainer items — customer-visible, snapshot on
 * acceptance, manual-invoice-prefill source. No money movement, no
 * reconciliation, no payment application: enforced by absence plus tests.
 *
 * The physical tables and enums keep their `commercial_schedule*` names for
 * historical and migration-safety reasons; the application layer calls them
 * payment schedules.
 *
 * Percentages are always percentages of the quote total (single semantic
 * model). Integer basis points throughout, never floats. Accepted schedules
 * are immutable; material post-acceptance change produces schedule v2 via an
 * approved change order while v1 remains historical truth.
 */
export const paymentSchedules = pgTable(
  "commercial_schedules",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    state: paymentScheduleStateEnum("state").notNull().default("draft"),
    quoteTotalCents: integer("quote_total_cents").notNull().default(0),
    displayTotalCents: integer("display_total_cents").notNull().default(0),
    recipeVersion: integer("recipe_version").notNull().default(1),
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
    uniqueIndex("commercial_schedules_quote_version_unique").on(
      table.quoteId,
      table.version,
    ),
    // One editable/pending schedule at a time. Accepted versions accumulate
    // (v1 stays `accepted` forever — no UPDATE path on accepted rows); the
    // latest approved version is max(version) with state `accepted`.
    uniqueIndex("commercial_schedules_quote_editable_unique")
      .on(table.quoteId)
      .where(sql`${table.state} = 'draft' OR ${table.state} = 'scheduled'`),
    index("commercial_schedules_business_quote_idx").on(
      table.businessId,
      table.quoteId,
    ),
    check("commercial_schedules_version_positive", sql`${table.version} >= 1`),
  ],
);

export type PaymentSchedule = typeof paymentSchedules.$inferSelect;

export const paymentScheduleItems = pgTable(
  "commercial_schedule_items",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => paymentSchedules.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    category: paymentScheduleItemCategoryEnum("category").notNull(),
    label: text("label").notNull(),
    amountCents: integer("amount_cents"),
    percentBps: integer("percent_bps"),
    computedAmountCents: integer("computed_amount_cents").notNull(),
    dueDate: text("due_date"),
    dueCondition: text("due_condition"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("commercial_schedule_items_schedule_position_unique").on(
      table.scheduleId,
      table.position,
    ),
    index("commercial_schedule_items_schedule_idx").on(table.scheduleId),
    check(
      "commercial_schedule_items_amount_xor_percent",
      sql`(${table.amountCents} IS NULL) != (${table.percentBps} IS NULL)`,
    ),
    check(
      "commercial_schedule_items_percent_range",
      sql`${table.percentBps} IS NULL OR (${table.percentBps} >= 0 AND ${table.percentBps} <= 10000)`,
    ),
    check(
      "commercial_schedule_items_computed_non_negative",
      sql`${table.computedAmountCents} >= 0`,
    ),
  ],
);

export type PaymentScheduleItem =
  typeof paymentScheduleItems.$inferSelect;
