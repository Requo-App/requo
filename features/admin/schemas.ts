/**
 * Admin console input schemas.
 *
 * Every server action and server-side list query under `features/admin/**`
 * validates its input through one of these schemas. The schemas are also
 * used to derive TypeScript input types.
 */

import { z } from "zod";

import {
  ADMIN_ACTIONS,
  ADMIN_AI_PROVIDERS,
  ADMIN_AUDIT_PAGE_SIZE,
  ADMIN_DEFAULT_PAGE_SIZE,
  ADMIN_MAX_PAGE_SIZE,
  ADMIN_TARGET_TYPES,
} from "@/features/admin/constants";
import {
  billingProviders,
  subscriptionStatuses,
} from "@/lib/db/schema/subscriptions";
import {
  emailProviders,
  emailTypes,
  emailOutboxStatuses,
} from "@/lib/db/schema/email";
import { businessPlans, type BusinessPlan } from "@/lib/plans/plans";
import { inquiryStatuses } from "@/features/inquiries/types";
import { quoteStatuses } from "@/features/quotes/types";
import { invoiceStatuses } from "@/features/invoices/types";
import {
  ADMIN_USAGE_BUSINESS_RESOURCES,
} from "@/features/admin/types";
import {
  coercePositiveInteger,
  emptyToUndefined,
  firstString,
} from "@/lib/zod-helpers";

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/**
 * IDs used across the admin surface are opaque strings (Better Auth uses
 * non-UUID text ids, as do our Drizzle tables). Keep the schema strict
 * enough to reject empty / pathological inputs without overspecifying.
 */
const adminIdSchema = z
  .string()
  .trim()
  .min(1, "An id is required.")
  .max(256, "That id is too long.");

/** Short-lived password re-confirmation token issued via `confirm.ts`. */
const adminConfirmTokenSchema = z
  .string()
  .trim()
  .min(16, "Confirmation token is invalid.")
  .max(512, "Confirmation token is invalid.");

/** Zod enums derived from DB / domain constants. */
const businessPlanSchema = z.enum(businessPlans);
const paidPlanSchema = businessPlanSchema.refine(
  (plan): plan is Exclude<BusinessPlan, "free"> => plan !== "free",
  "Choose a paid plan (pro or business).",
);
const subscriptionStatusSchema = z.enum(subscriptionStatuses);
const billingProviderSchema = z.enum(billingProviders);

const adminActionSchema = z.enum(ADMIN_ACTIONS);
const adminTargetTypeSchema = z.enum(ADMIN_TARGET_TYPES);

/* ── User management mutations ───────────────────────────────────────────── */

export const adminForceVerifyEmailSchema = z
  .object({
    targetUserId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminRevokeAllSessionsSchema = z
  .object({
    targetUserId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminSuspendUserSchema = z
  .object({
    targetUserId: adminIdSchema,
    reason: z
      .string()
      .trim()
      .max(500, "Suspension reasons must be 500 characters or fewer.")
      .optional(),
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminUnsuspendUserSchema = z
  .object({
    targetUserId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminDeleteUserSchema = z
  .object({
    targetUserId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

/* ── Subscription override mutations ─────────────────────────────────────── */

export const adminManualPlanOverrideSchema = z
  .object({
    userId: adminIdSchema,
    plan: paidPlanSchema,
    reason: z
      .string()
      .trim()
      .max(500, "Override reasons must be 500 characters or fewer.")
      .optional(),
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminForceCancelSubscriptionSchema = z
  .object({
    subscriptionId: adminIdSchema,
    reason: z
      .string()
      .trim()
      .max(500, "Cancellation reasons must be 500 characters or fewer.")
      .optional(),
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

/* ── Business lifecycle mutations ────────────────────────────────────────── */

export const adminArchiveBusinessSchema = z
  .object({
    businessId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminRestoreBusinessSchema = z
  .object({
    businessId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminDeleteBusinessSchema = z
  .object({
    businessId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

/* ── Business subscription mutations (business-scoped) ───────────────────── */

export const adminOverrideBusinessPlanSchema = z
  .object({
    businessId: adminIdSchema,
    plan: paidPlanSchema,
    reason: z
      .string()
      .trim()
      .max(500, "Override reasons must be 500 characters or fewer.")
      .optional(),
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminCancelBusinessSubscriptionSchema = z
  .object({
    businessId: adminIdSchema,
    reason: z
      .string()
      .trim()
      .max(500, "Cancellation reasons must be 500 characters or fewer.")
      .optional(),
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

/* ── Impersonation ───────────────────────────────────────────────────────── */

export const adminStartImpersonationSchema = z
  .object({
    targetUserId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

/* ── Role management ────────────────────────────────────────────────────── */

export const adminPromoteUserSchema = z
  .object({
    targetUserId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

export const adminDemoteUserSchema = z
  .object({
    targetUserId: adminIdSchema,
    confirmToken: adminConfirmTokenSchema,
  })
  .strict();

/* ── Password re-confirmation ────────────────────────────────────────────── */

export const adminPasswordConfirmSchema = z
  .object({
    password: z
      .string()
      .min(1, "Enter your password.")
      .max(512, "That password is too long."),
  })
  .strict();

/* ── Shared list / pagination helpers ────────────────────────────────────── */

const paginationShape = {
  page: coercePositiveInteger("Page").catch(1),
  pageSize: z
    .preprocess(
      (value) => {
        const normalized = firstString(value);

        if (normalized == null || normalized === "") {
          return ADMIN_DEFAULT_PAGE_SIZE;
        }

        if (typeof normalized === "number") {
          return normalized;
        }

        if (typeof normalized !== "string") {
          return ADMIN_DEFAULT_PAGE_SIZE;
        }

        const trimmed = normalized.trim();
        return trimmed ? Number(trimmed) : ADMIN_DEFAULT_PAGE_SIZE;
      },
      z
        .number()
        .int("Page size must be a whole number.")
        .min(1, "Page size must be at least 1.")
        .max(
          ADMIN_MAX_PAGE_SIZE,
          `Page size must be ${ADMIN_MAX_PAGE_SIZE} or fewer.`,
        ),
    )
    .catch(ADMIN_DEFAULT_PAGE_SIZE),
} as const;

/**
 * Free-text search param.
 *
 * The admin filter UIs write `q` — matching the rest of the app's list
 * toolbars — while `search` is kept as an alias so previously bookmarked
 * admin URLs keep working. {@link normalizeSearchAlias} collapses the pair
 * before validation so every list-filter schema exposes a single `search`
 * field.
 */
const searchValueSchema = z
  .preprocess(
    (value) => emptyToUndefined(firstString(value)),
    z
      .string()
      .trim()
      .max(120, "Search must be 120 characters or fewer.")
      .optional(),
  )
  .catch(undefined);

const searchQueryShape = {
  search: searchValueSchema,
} as const;

/**
 * Map `q` onto `search` on the raw search-params object.
 *
 * Runs as a `z.preprocess` step so `q` never appears on a parsed filter
 * object: callers only ever read `search`.
 *
 * `q` wins over the legacy `search` alias. The filter UI writes only `q`
 * and preserves every other param, so a bookmarked URL carrying
 * `?search=acme` would otherwise shadow the query the user just typed and
 * the list would never change.
 */
function normalizeSearchAlias(input: unknown): unknown {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return input;
  }

  const record = input as Record<string, unknown>;

  if (record.q != null) {
    return { ...record, search: record.q };
  }

  return input;
}

/* ── List / filter inputs ────────────────────────────────────────────────── */

const adminUserStatusFilterSchema = z.enum([
  "all",
  "verified",
  "unverified",
  "suspended",
]);

export const adminUsersListFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    status: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        adminUserStatusFilterSchema.optional(),
      )
      .catch("all" as const),
    ...searchQueryShape,
    ...paginationShape,
  }),
);

export const adminBusinessesListFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    plan: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        businessPlanSchema.optional(),
      )
      .catch(undefined),
    ...searchQueryShape,
    ...paginationShape,
  }),
);

export const adminSubscriptionsListFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    status: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        subscriptionStatusSchema.optional(),
      )
      .catch(undefined),
    provider: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        billingProviderSchema.optional(),
      )
      .catch(undefined),
    ...searchQueryShape,
    ...paginationShape,
  }),
);

export const adminInquiriesListFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    status: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        z.enum(inquiryStatuses).optional(),
      )
      .catch(undefined),
    ...searchQueryShape,
    ...paginationShape,
  }),
);

export const adminQuotesListFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    status: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        z.enum(quoteStatuses).optional(),
      )
      .catch(undefined),
    ...searchQueryShape,
    ...paginationShape,
  }),
);

export const adminInvoicesListFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    status: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        z.enum(invoiceStatuses).optional(),
      )
      .catch(undefined),
    ...searchQueryShape,
    ...paginationShape,
  }),
);

/** Parse an optional `YYYY-MM-DD` date param, tolerating garbage. */
function toOptionalDate(value: unknown): Date | undefined {
  const first = firstString(value);

  if (typeof first !== "string" || !first.trim()) {
    return undefined;
  }

  const date = new Date(first);

  return Number.isNaN(date.getTime()) ? undefined : date;
}

const dateRangeShape = {
  from: z.preprocess(toOptionalDate, z.date().optional()).catch(undefined),
  to: z.preprocess(toOptionalDate, z.date().optional()).catch(undefined),
} as const;

/** Free-text match (model / task type) used by the AI request filters. */
const aiTextFilterSchema = z
  .preprocess(
    (value) => emptyToUndefined(firstString(value)),
    z.string().trim().max(120, "Filter must be 120 characters or fewer.").optional(),
  )
  .catch(undefined);

const aiProviderFilterSchema = z
  .preprocess(
    (value) => emptyToUndefined(firstString(value)),
    z.enum(ADMIN_AI_PROVIDERS).optional(),
  )
  .catch(undefined);

const aiCallStatusFilterSchema = z
  .preprocess(
    (value) => emptyToUndefined(firstString(value)),
    z.enum(["success", "error"]).optional(),
  )
  .catch(undefined);

export const adminAiRequestsFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    provider: aiProviderFilterSchema,
    model: aiTextFilterSchema,
    taskType: aiTextFilterSchema,
    status: aiCallStatusFilterSchema,
    businessId: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        adminIdSchema.optional(),
      )
      .catch(undefined),
    ...searchQueryShape,
    ...dateRangeShape,
    ...paginationShape,
  }),
);

export const adminAiErrorsFiltersSchema = z.object({
  provider: aiProviderFilterSchema,
  model: aiTextFilterSchema,
  taskType: aiTextFilterSchema,
  ...paginationShape,
});

export const adminEmailsListFiltersSchema = z.preprocess(
  normalizeSearchAlias,
  z.object({
    status: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        z.enum(emailOutboxStatuses).optional(),
      )
      .catch(undefined),
    emailType: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        z.enum(emailTypes).optional(),
      )
      .catch(undefined),
    provider: z
      .preprocess(
        (value) => emptyToUndefined(firstString(value)),
        z.enum(emailProviders).optional(),
      )
      .catch(undefined),
    ...searchQueryShape,
    ...paginationShape,
  }),
);

export const adminUsageFiltersSchema = z.object({
  days: z
    .preprocess((value) => {
      const first = firstString(value);

      if (first === "7" || first === "14" || first === "30") {
        return Number(first);
      }

      return undefined;
    }, z.number().optional())
    .catch(undefined),
  resource: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      z.enum(ADMIN_USAGE_BUSINESS_RESOURCES).optional(),
    )
    .catch(undefined),
});

export const adminAuditLogListFiltersSchema = z.object({  adminUserId: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      adminIdSchema.optional(),
    )
    .catch(undefined),
  action: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      adminActionSchema.optional(),
    )
    .catch(undefined),
  targetType: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      adminTargetTypeSchema.optional(),
    )
    .catch(undefined),
  targetId: z
    .preprocess(
      (value) => emptyToUndefined(firstString(value)),
      adminIdSchema.optional(),
    )
    .catch(undefined),
  page: paginationShape.page,
  pageSize: z
    .preprocess(
      (value) => {
        const normalized = firstString(value);

        if (normalized == null || normalized === "") {
          return ADMIN_AUDIT_PAGE_SIZE;
        }

        if (typeof normalized === "number") {
          return normalized;
        }

        if (typeof normalized !== "string") {
          return ADMIN_AUDIT_PAGE_SIZE;
        }

        const trimmed = normalized.trim();
        return trimmed ? Number(trimmed) : ADMIN_AUDIT_PAGE_SIZE;
      },
      z
        .number()
        .int("Page size must be a whole number.")
        .min(1, "Page size must be at least 1.")
        .max(
          ADMIN_MAX_PAGE_SIZE,
          `Page size must be ${ADMIN_MAX_PAGE_SIZE} or fewer.`,
        ),
    )
    .catch(ADMIN_AUDIT_PAGE_SIZE),
});

/* ── Inferred input types ────────────────────────────────────────────────── */

export type AdminForceVerifyEmailInput = z.infer<
  typeof adminForceVerifyEmailSchema
>;
export type AdminRevokeAllSessionsInput = z.infer<
  typeof adminRevokeAllSessionsSchema
>;
export type AdminSuspendUserInput = z.infer<typeof adminSuspendUserSchema>;
export type AdminUnsuspendUserInput = z.infer<typeof adminUnsuspendUserSchema>;
export type AdminDeleteUserInput = z.infer<typeof adminDeleteUserSchema>;
export type AdminManualPlanOverrideInput = z.infer<
  typeof adminManualPlanOverrideSchema
>;
export type AdminForceCancelSubscriptionInput = z.infer<
  typeof adminForceCancelSubscriptionSchema
>;
export type AdminArchiveBusinessInput = z.infer<
  typeof adminArchiveBusinessSchema
>;
export type AdminRestoreBusinessInput = z.infer<
  typeof adminRestoreBusinessSchema
>;
export type AdminDeleteBusinessInput = z.infer<
  typeof adminDeleteBusinessSchema
>;
export type AdminOverrideBusinessPlanInput = z.infer<
  typeof adminOverrideBusinessPlanSchema
>;
export type AdminCancelBusinessSubscriptionInput = z.infer<
  typeof adminCancelBusinessSubscriptionSchema
>;
export type AdminStartImpersonationInput = z.infer<
  typeof adminStartImpersonationSchema
>;
export type AdminPromoteUserInput = z.infer<typeof adminPromoteUserSchema>;
export type AdminDemoteUserInput = z.infer<typeof adminDemoteUserSchema>;
export type AdminPasswordConfirmInput = z.infer<
  typeof adminPasswordConfirmSchema
>;

export type AdminUsersListFilters = z.infer<typeof adminUsersListFiltersSchema>;
export type AdminBusinessesListFilters = z.infer<
  typeof adminBusinessesListFiltersSchema
>;
export type AdminSubscriptionsListFilters = z.infer<
  typeof adminSubscriptionsListFiltersSchema
>;
export type AdminInquiriesListFilters = z.infer<
  typeof adminInquiriesListFiltersSchema
>;
export type AdminQuotesListFilters = z.infer<typeof adminQuotesListFiltersSchema>;
export type AdminInvoicesListFilters = z.infer<
  typeof adminInvoicesListFiltersSchema
>;
export type AdminAiRequestsListFilters = z.infer<
  typeof adminAiRequestsFiltersSchema
>;
export type AdminAiErrorsListFilters = z.infer<
  typeof adminAiErrorsFiltersSchema
>;
export type AdminEmailsListFilters = z.infer<
  typeof adminEmailsListFiltersSchema
>;
export type AdminUsageFilters = z.infer<typeof adminUsageFiltersSchema>;
export type AdminAuditLogListFilters = z.infer<
  typeof adminAuditLogListFiltersSchema
>;
