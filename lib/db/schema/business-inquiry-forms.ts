import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { BusinessType } from "@/features/inquiries/business-types";
import type { InquiryFormConfig } from "@/features/inquiries/form-config";
import type { InquiryPageConfig } from "@/features/inquiries/page-config";
import { businesses } from "@/lib/db/schema/businesses";

export const businessInquiryForms = pgTable(
  "business_inquiry_forms",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    businessType: text("business_type")
      .$type<BusinessType>()
      .notNull()
      .default("general_project_services"),
    isDefault: boolean("is_default").notNull().default(false),
    publicInquiryEnabled: boolean("public_inquiry_enabled")
      .notNull()
      .default(true),
    inquiryFormConfig: jsonb("inquiry_form_config")
      .$type<InquiryFormConfig>()
      .notNull(),
    inquiryPageConfig: jsonb("inquiry_page_config")
      .$type<InquiryPageConfig>()
      .notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_inquiry_forms_business_slug_unique").on(
      table.businessId,
      table.slug,
    ),
    // At most one default service per business. The application unsets every
    // default before setting one; this index makes the invariant a database
    // fact instead of a convention.
    uniqueIndex("business_inquiry_forms_one_default_per_business")
      .on(table.businessId)
      .where(sql`${table.isDefault} = true`),
    index("business_inquiry_forms_business_id_idx").on(table.businessId),
    index("business_inquiry_forms_business_default_idx").on(
      table.businessId,
      table.isDefault,
    ),
    index("business_inquiry_forms_business_archived_idx").on(
      table.businessId,
      table.archivedAt,
    ),
    check(
      "business_inquiry_forms_slug_format",
      sql`${table.slug} ~ '^[a-z0-9-]+$'`,
    ),
  ],
);
