import {
  boolean,
  date,
  doublePrecision,
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
import { quotes } from "@/lib/db/schema/quotes";

export const analyticsEventTypeEnum = pgEnum("analytics_event_type", [
  "inquiry_form_viewed",
  "quote_public_viewed",
  "approval_requested",
  "approval_viewed",
  "approval_approved",
  "approval_changes_requested",
  "approval_expired",
  "change_order_created",
  "change_order_approved",
  "change_order_rejected",
  "schedule_created",
  "schedule_accepted",
  "schedule_prefill_used",
  "scope_block_added",
  "scope_required_missing",
  "readiness_blocked",
  "readiness_completed",
  "ai_pack_guidance_used",
  "ai_missing_info_detected",
]);

export type AnalyticsEventMetadata = {
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  /** Verticalization properties: pack/recipe versions, subject kind, record refs. No new PII. */
  pack?: string | null;
  packVersion?: number | null;
  recipeKind?: string | null;
  recipeVersion?: number | null;
  subjectKind?: string | null;
  approvalChainId?: string | null;
  changeOrderId?: string | null;
  scheduleId?: string | null;
  actor?: string | null;
};

export const analyticsEvents = pgTable(
  "analytics_events",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    serviceId: text("business_inquiry_form_id").references(
      () => services.id,
      { onDelete: "set null" },
    ),
    quoteId: text("quote_id").references(() => quotes.id, {
      onDelete: "set null",
    }),
    eventType: analyticsEventTypeEnum("event_type").notNull(),
    visitorHash: text("visitor_hash").notNull(),
    metadata: jsonb("metadata").$type<AnalyticsEventMetadata>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("analytics_events_business_type_occurred_at_idx").on(
      table.businessId,
      table.eventType,
      table.occurredAt,
    ),
    index("analytics_events_form_type_occurred_at_idx").on(
      table.serviceId,
      table.eventType,
      table.occurredAt,
    ),
    index("analytics_events_quote_type_occurred_at_idx").on(
      table.quoteId,
      table.eventType,
      table.occurredAt,
    ),
    index("analytics_events_business_type_visitor_hash_idx").on(
      table.businessId,
      table.eventType,
      table.visitorHash,
    ),
  ],
);

export const analyticsBenchmarks = pgTable(
  "analytics_benchmarks",
  {
    id: text("id").primaryKey(),
    industryCategory: text("industry_category").notNull(),
    sizeTier: text("size_tier").notNull(),
    metricKey: text("metric_key").notNull(),
    medianValue: doublePrecision("median_value").notNull(),
    businessCount: integer("business_count").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("analytics_benchmarks_category_size_metric_idx").on(
      table.industryCategory,
      table.sizeTier,
      table.metricKey,
    ),
  ],
);

export const analyticsDailyRollups = pgTable(
  "analytics_daily_rollups",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    formViews: integer("form_views").notNull().default(0),
    uniqueVisitors: integer("unique_visitors").notNull().default(0),
    inquirySubmissions: integer("inquiry_submissions").notNull().default(0),
    quotesSent: integer("quotes_sent").notNull().default(0),
    quotesAccepted: integer("quotes_accepted").notNull().default(0),
    quotesRejected: integer("quotes_rejected").notNull().default(0),
    revenueCents: integer("revenue_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("analytics_daily_rollups_business_date_idx").on(
      table.businessId,
      table.date,
    ),
    index("analytics_daily_rollups_date_idx").on(table.date),
  ],
);

export const analyticsAnnotations = pgTable(
  "analytics_annotations",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    label: text("label").notNull(),
    color: text("color"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("analytics_annotations_business_date_idx").on(
      table.businessId,
      table.date,
    ),
  ],
);

export const analyticsScheduledReports = pgTable(
  "analytics_scheduled_reports",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    recipientEmails: text("recipient_emails").array().notNull(),
    schedule: text("schedule").notNull(),
    timezone: text("timezone").notNull().default("UTC"),
    enabled: boolean("enabled").notNull().default(true),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("analytics_scheduled_reports_business_idx").on(table.businessId),
  ],
);

export const analyticsGoalThresholds = pgTable(
  "analytics_goal_thresholds",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    metricKey: text("metric_key").notNull(),
    targetValue: doublePrecision("target_value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("analytics_goal_thresholds_business_metric_idx").on(
      table.businessId,
      table.metricKey,
    ),
  ],
);
