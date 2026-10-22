import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

import { businesses } from "@/lib/db/schema/businesses";

/**
 * Manual knowledge entries maintained by the business owner.
 *
 * Content is context-only for AI quote generation: it may shape wording,
 * scope, exclusions, and clarification questions, but it is never monetary
 * authority. `pricing_knowledge` is a legacy category kept readable; it must
 * not authorize a generated price.
 */
export const knowledgeCategories = [
  "business_rules",
  "customer_context",
  "workflow_preferences",
  "pricing_knowledge",
] as const;

export type KnowledgeCategory = (typeof knowledgeCategories)[number];

export const knowledgeEntries = pgTable(
  "business_memories",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    position: integer("position").notNull().default(0),
    category: text("category")
      .$type<KnowledgeCategory>()
      .notNull()
      .default("business_rules"),
    /** Gemini embedding of `title + "\n" + content`. Nullable; lexical fallback when absent. */
    embedding: jsonb("embedding").$type<number[] | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("business_memories_business_id_idx").on(table.businessId),
    index("business_memories_business_position_idx").on(
      table.businessId,
      table.position,
    ),
    index("business_memories_business_category_idx").on(
      table.businessId,
      table.category,
    ),
    check("business_memories_position_nonnegative", sql`${table.position} >= 0`),
    check(
      "business_memories_title_length",
      sql`char_length(${table.title}) <= 200`,
    ),
    check(
      "business_memories_content_length",
      sql`char_length(${table.content}) <= 4000`,
    ),
    check(
      "business_memories_category_check",
      sql`${table.category} in ('business_rules', 'pricing_knowledge', 'customer_context', 'workflow_preferences')`,
    ),
  ],
);
