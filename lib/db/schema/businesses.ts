import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import type { BusinessType } from "@/features/inquiries/business-types";
import type { InquiryFormConfig } from "@/features/inquiries/form-config";
import type { InquiryPageConfig } from "@/features/inquiries/page-config";
import type {
  InvoiceEmailTemplateStored,
  QuoteEmailTemplateStored,
  QuoteFollowUpTemplateStored,
} from "@/features/settings/email-templates";
import type { PlanTier } from "@/lib/plans/plans";
import { businessMemberRoles } from "@/lib/business-members";
import { user } from "@/lib/db/schema/auth";

export const businessMemberRoleEnum = pgEnum("business_member_role", [
  ...businessMemberRoles,
]);

export const profileThemePreferenceEnum = pgEnum("profile_theme_preference", [
  "light",
  "dark",
  "system",
]);

export const profileUiScaleEnum = pgEnum("profile_ui_scale", [
  "small",
  "default",
  "large",
]);

export const profiles = pgTable("profiles", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  phone: text("phone"),
  jobTitle: text("job_title"),
  companySize: text("company_size"),
  referralSource: text("referral_source"),
  avatarStoragePath: text("avatar_storage_path"),
  avatarContentType: text("avatar_content_type"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
  dashboardTourCompletedAt: timestamp("dashboard_tour_completed_at", {
    withTimezone: true,
  }),
  formEditorTourCompletedAt: timestamp("form_editor_tour_completed_at", {
    withTimezone: true,
  }),
  themePreference: profileThemePreferenceEnum("theme_preference")
    .notNull()
    .default("system"),
  uiScale: profileUiScaleEnum("ui_scale").notNull().default("default"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const businesses = pgTable(
  "businesses",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    plan: text("plan")
      .$type<PlanTier>()
      .notNull()
      .default("free"),
    businessType: text("business_type")
      .$type<BusinessType>()
      .notNull()
      .default("general_project_services"),
    countryCode: text("country_code"),
    /** IANA timezone identifier (e.g. "America/New_York"). Defaults to UTC. */
    timezone: text("timezone").notNull().default("UTC"),
    shortDescription: text("short_description"),
    /** How inbound customers typically reach this business (onboarding insight). */
    customerContactChannel: text("customer_contact_channel"),
    contactEmail: text("contact_email"),
    website: text("website"),
    logoStoragePath: text("logo_storage_path"),
    logoContentType: text("logo_content_type"),
    publicInquiryEnabled: boolean("public_inquiry_enabled")
      .notNull()
      .default(true),
    inquiryHeadline: text("inquiry_headline"),
    inquiryFormConfig: jsonb("inquiry_form_config").$type<InquiryFormConfig>(),
    inquiryPageConfig: jsonb("inquiry_page_config").$type<InquiryPageConfig>(),
    defaultEmailSignature: text("default_email_signature"),
    defaultQuoteNotes: text("default_quote_notes"),
    defaultQuoteTerms: text("default_quote_terms"),
    quoteEmailTemplate:
      jsonb("quote_email_template").$type<QuoteEmailTemplateStored>(),
    invoiceEmailTemplate:
      jsonb("invoice_email_template").$type<InvoiceEmailTemplateStored>(),
    quoteFollowUpTemplate:
      jsonb("quote_follow_up_template").$type<QuoteFollowUpTemplateStored>(),
    defaultQuoteValidityDays: integer("default_quote_validity_days")
      .notNull()
      .default(14),
    /**
     * Legacy: no active production email call sites. Owner new-inquiry
     * events use in-app + push notifications. Kept for backward
     * compatibility; do not add new email sends without a call site.
     */
    notifyOnNewInquiry: boolean("notify_on_new_inquiry")
      .notNull()
      .default(true),
    /** Legacy: no active production email call sites (see above). */
    notifyOnQuoteSent: boolean("notify_on_quote_sent").notNull().default(true),
    /** Legacy: no active production email call sites (see above). */
    notifyOnQuoteResponse: boolean("notify_on_quote_response")
      .notNull()
      .default(true),
    notifyInAppOnNewInquiry: boolean("notify_in_app_on_new_inquiry")
      .notNull()
      .default(true),
    notifyInAppOnQuoteSent: boolean("notify_in_app_on_quote_sent")
      .notNull()
      .default(true),
    notifyInAppOnQuoteResponse: boolean("notify_in_app_on_quote_response")
      .notNull()
      .default(true),
    /** Legacy: no active production email call sites (see above). */
    notifyOnMemberInviteResponse: boolean("notify_on_member_invite_response")
      .notNull()
      .default(true),
    notifyInAppOnMemberInviteResponse: boolean("notify_in_app_on_member_invite_response")
      .notNull()
      .default(true),
    notifyPushOnNewInquiry: boolean("notify_push_on_new_inquiry")
      .notNull()
      .default(false),
    notifyPushOnQuoteSent: boolean("notify_push_on_quote_sent")
      .notNull()
      .default(false),
    notifyPushOnQuoteResponse: boolean("notify_push_on_quote_response")
      .notNull()
      .default(false),
    notifyPushOnMemberInviteResponse: boolean("notify_push_on_member_invite_response")
      .notNull()
      .default(false),
    notifyOnFollowUpReminder: boolean("notify_on_follow_up_reminder")
      .notNull()
      .default(true),
    notifyInAppOnFollowUpReminder: boolean("notify_in_app_on_follow_up_reminder")
      .notNull()
      .default(true),
    /** Verticalization P1/P2: in-app + push notification preference triples. */
    notifyInAppOnApproval: boolean("notify_in_app_on_approval")
      .notNull()
      .default(true),
    notifyPushOnApproval: boolean("notify_push_on_approval")
      .notNull()
      .default(false),
    notifyInAppOnChangeOrder: boolean("notify_in_app_on_change_order")
      .notNull()
      .default(true),
    notifyPushOnChangeOrder: boolean("notify_push_on_change_order")
      .notNull()
      .default(false),
    notifyOnQuoteExpiring: boolean("notify_on_quote_expiring")
      .notNull()
      .default(true),
    notifyInAppOnQuoteExpiring: boolean("notify_in_app_on_quote_expiring")
      .notNull()
      .default(true),
    defaultCurrency: text("default_currency").notNull().default("USD"),
    analyticsDigestEnabled: boolean("analytics_digest_enabled")
      .notNull()
      .default(true),
    /** Send the customer an acknowledgment email when an inquiry is received. */
    sendInquiryAckEmail: boolean("send_inquiry_ack_email")
      .notNull()
      .default(true),
    /** Auto-generate an AI quote draft when an inquiry is qualified. */
    autoDraftQuoteOnQualify: boolean("auto_draft_quote_on_qualify")
      .notNull()
      .default(true),
    /** Auto-archive stale open inquiries after the idle window below. */
    autoArchiveStaleInquiries: boolean("auto_archive_stale_inquiries")
      .notNull()
      .default(true),
    autoArchiveStaleInquiryDays: integer("auto_archive_stale_inquiry_days")
      .notNull()
      .default(14),
    /** Create a follow-up task when a quote is viewed but unanswered. */
    autoFollowUpOnQuoteViewed: boolean("auto_follow_up_on_quote_viewed")
      .notNull()
      .default(true),
    quoteViewedFollowUpDelayDays: integer("quote_viewed_follow_up_delay_days")
      .notNull()
      .default(3),
    /** Enable Agent for conversational inquiry collection. */
    agentEnabled: boolean("ai_agent_enabled").notNull().default(false),
    /** Agent configuration (tone, handoff triggers, etc.). */
    agentConfig: jsonb("ai_agent_config").notNull().default("{}"),
    /** Unused. Predates ADR 003; the Agent is gated by `agentEnabled`. */
    aiAssistantBetaEnabled: boolean("ai_assistant_beta_enabled").notNull().default(false),
    industryCategory: text("industry_category"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    archivedBy: text("archived_by").references(() => user.id, {
      onDelete: "set null",
    }),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lockedBy: text("locked_by").references(() => user.id, {
      onDelete: "set null",
    }),
    lockedReason: text("locked_reason"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: text("deleted_by").references(() => user.id, {
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
    uniqueIndex("businesses_slug_unique").on(table.slug),
    index("businesses_created_at_idx").on(table.createdAt),
    index("businesses_owner_user_id_idx").on(table.ownerUserId),
    index("businesses_owner_deleted_at_idx").on(
      table.ownerUserId,
      table.deletedAt,
    ),
    index("businesses_owner_archived_at_idx").on(
      table.ownerUserId,
      table.archivedAt,
    ),
    index("businesses_owner_locked_at_idx").on(
      table.ownerUserId,
      table.lockedAt,
    ),
    index("businesses_ai_assistant_beta_idx").on(table.aiAssistantBetaEnabled),
    check("businesses_slug_format", sql`${table.slug} ~ '^[a-z0-9-]+$'`),
    check(
      "businesses_country_code_format",
      sql`${table.countryCode} is null or ${table.countryCode} ~ '^[A-Z]{2}$'`,
    ),
    check(
      "businesses_default_quote_validity_days_range",
      sql`${table.defaultQuoteValidityDays} between 1 and 365`,
    ),
    check(
      "businesses_auto_archive_stale_inquiry_days_range",
      sql`${table.autoArchiveStaleInquiryDays} between 1 and 365`,
    ),
    check(
      "businesses_quote_viewed_follow_up_delay_days_range",
      sql`${table.quoteViewedFollowUpDelayDays} between 1 and 90`,
    ),
    check(
      "businesses_plan_valid",
      sql`${table.plan} in ('free', 'pro', 'business')`,
    ),
  ],
);

export const businessMembers = pgTable(
  "business_members",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: businessMemberRoleEnum("role").notNull().default("staff"),
    dashboardTourCompletedAt: timestamp("dashboard_tour_completed_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_members_business_user_unique").on(
      table.businessId,
      table.userId,
    ),
    index("business_members_user_id_idx").on(table.userId),
    index("business_members_business_role_idx").on(table.businessId, table.role),
  ],
);

export const userRecentBusinesses = pgTable(
  "user_recent_businesses",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    lastOpenedAt: timestamp("last_opened_at", { withTimezone: true })
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
    uniqueIndex("user_recent_businesses_user_business_unique").on(
      table.userId,
      table.businessId,
    ),
    index("user_recent_businesses_user_recent_idx").on(
      table.userId,
      table.lastOpenedAt,
    ),
    index("user_recent_businesses_business_id_idx").on(table.businessId),
  ],
);

export const businessMemberInvites = pgTable(
  "business_member_invites",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    inviterUserId: text("inviter_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: businessMemberRoleEnum("role").notNull().default("staff"),
    token: text("token"),
    tokenHash: text("token_hash"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_member_invites_token_unique").on(table.token),
    uniqueIndex("business_member_invites_token_hash_unique").on(table.tokenHash),
    uniqueIndex("business_member_invites_business_email_unique").on(
      table.businessId,
      table.email,
    ),
    index("business_member_invites_business_id_idx").on(table.businessId),
    index("business_member_invites_email_idx").on(table.email),
    index("business_member_invites_token_hash_idx").on(table.tokenHash),
    index("business_member_invites_expires_at_idx").on(table.expiresAt),
  ],
);

export const businessInviteLinks = pgTable(
  "business_invite_links",
  {
    id: text("id").primaryKey(),
    businessId: text("business_id")
      .notNull()
      .references(() => businesses.id, { onDelete: "cascade" }),
    createdByUserId: text("created_by_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: businessMemberRoleEnum("role").notNull().default("staff"),
    token: text("token").notNull(),
    tokenHash: text("token_hash").notNull(),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("business_invite_links_business_unique").on(table.businessId),
    uniqueIndex("business_invite_links_token_unique").on(table.token),
    uniqueIndex("business_invite_links_token_hash_unique").on(table.tokenHash),
    index("business_invite_links_token_hash_idx").on(table.tokenHash),
  ],
);
