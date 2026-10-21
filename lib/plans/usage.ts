import "server-only";

/**
 * Server-side usage accounting for the Requo pricing system.
 *
 * Usage is counted at the business level. Derives monthly counts from
 * existing inquiry/quote timestamps. Business creation quota is enforced
 * globally by `features/businesses/quota.ts`.
 */

import { and, count, eq, gte, inArray, isNull, lt, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  activityLogs,
  businessInquiryForms,
  businessMembers,
  quotes,
} from "@/lib/db/schema";
import type { BusinessPlan } from "@/lib/plans/plans";
import {
  getUsageLimit,
  type UsageLimitKey,
} from "@/lib/plans/usage-limits";

function getCurrentMonthBounds() {
  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
  );

  return { start, end };
}

function getCurrentDayBounds() {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  );

  return { start, end };
}

/**
 * Counts Requo-delivered document emails sent in a window for a business.
 *
 * Quotes and invoices share one sending allowance, so both activity types
 * count toward it. The `sendMethod` recorded on the activity row decides
 * whether a send used a Requo email — a manual delivery never did, so it
 * never consumes the allowance.
 */
async function getBusinessDocumentSendCountByMethod(
  businessId: string,
  {
    end,
    method,
    start,
  }: {
    start: Date;
    end: Date;
    method: "requo";
  },
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        inArray(activityLogs.type, ["quote.sent", "invoice.sent"]),
        gte(activityLogs.createdAt, start),
        lt(activityLogs.createdAt, end),
        sql`${activityLogs.metadata} ->> 'sendMethod' = ${method}`,
      ),
    );

  return Number(row?.value ?? 0);
}

export async function getDailyRequoDocumentSendCount(
  businessId: string,
): Promise<number> {
  return getBusinessDocumentSendCountByMethod(businessId, {
    ...getCurrentDayBounds(),
    method: "requo",
  });
}

export async function getMonthlyRequoDocumentSendCount(
  businessId: string,
): Promise<number> {
  return getBusinessDocumentSendCountByMethod(businessId, {
    ...getCurrentMonthBounds(),
    method: "requo",
  });
}

/**
 * Counts automatic follow-up emails sent in a window for a business.
 *
 * Auto follow-ups log `quote.auto_follow_up_sent` (distinct from the
 * explicit `quote.sent` entries counted by the Requo-email budget), so they
 * get their own allowance instead of consuming the owner's send quota.
 *
 * The unattended follow-up path (`follow_ups.send_mode = 'automatic'`) logs
 * `follow_up.auto_sent` and draws from the same allowance, so a business
 * cannot send twice its quota by splitting the work across both paths.
 */
async function getAutoFollowUpSendCount(
  businessId: string,
  { start, end }: { start: Date; end: Date },
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(activityLogs)
    .where(
      and(
        eq(activityLogs.businessId, businessId),
        inArray(activityLogs.type, [
          "quote.auto_follow_up_sent",
          "follow_up.auto_sent",
        ]),
        gte(activityLogs.createdAt, start),
        lt(activityLogs.createdAt, end),
      ),
    );

  return Number(row?.value ?? 0);
}

/**
 * Counts auto follow-up emails sent in the current UTC day for a business.
 */
export async function getDailyAutoFollowUpSendCount(
  businessId: string,
): Promise<number> {
  return getAutoFollowUpSendCount(businessId, getCurrentDayBounds());
}

/**
 * Counts auto follow-up emails sent in the current UTC month for a business.
 */
export async function getMonthlyAutoFollowUpSendCount(
  businessId: string,
): Promise<number> {
  return getAutoFollowUpSendCount(businessId, getCurrentMonthBounds());
}

/**
 * Counts quotes with an in-flight auto follow-up sequence for a business.
 *
 * The predicate mirrors the partial index `quotes_auto_follow_up_pending_idx`
 * so the count stays index-backed. A sequence is "active" while it is enabled,
 * not stopped, sent, unviewed, unanswered, and still has attempts left.
 */
export async function getActiveAutoFollowUpCount(
  businessId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(quotes)
    .where(
      and(
        eq(quotes.businessId, businessId),
        eq(quotes.autoFollowUpEnabled, true),
        isNull(quotes.autoFollowUpStoppedAt),
        eq(quotes.status, "sent"),
        isNull(quotes.publicViewedAt),
        isNull(quotes.customerRespondedAt),
        isNull(quotes.deletedAt),
        sql`${quotes.autoFollowUpAttempts} < ${quotes.autoFollowUpMaxAttempts}`,
      ),
    );

  return Number(row?.value ?? 0);
}

/**
 * Counts the number of members in a business.
 */
export async function getBusinessMemberCount(
  businessId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(businessMembers)
    .where(eq(businessMembers.businessId, businessId));

  return Number(row?.value ?? 0);
}

/**
 * Counts the number of live (non-archived, public-enabled) inquiry forms
 * for a business.
 */
export async function getBusinessLiveFormsCount(
  businessId: string,
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(businessInquiryForms)
    .where(
      and(
        eq(businessInquiryForms.businessId, businessId),
        eq(businessInquiryForms.publicInquiryEnabled, true),
        isNull(businessInquiryForms.archivedAt),
      ),
    );

  return Number(row?.value ?? 0);
}

export type UsageAllowance = {
  allowed: boolean;
  current: number;
  limit: number | null;
};

/**
 * Checks whether a business is allowed to create another item of the given
 * type. Returns current usage, limit, and whether the action is allowed.
 */
export async function checkUsageAllowance(
  businessId: string,
  plan: BusinessPlan,
  key: UsageLimitKey,
): Promise<UsageAllowance> {
  const limit = getUsageLimit(plan, key);

  if (limit === null) {
    return { allowed: true, current: 0, limit: null };
  }

  let current: number;

  switch (key) {
    case "requoDocumentEmailsPerDay":
      current = await getDailyRequoDocumentSendCount(businessId);
      break;
    case "requoDocumentEmailsPerMonth":
      current = await getMonthlyRequoDocumentSendCount(businessId);
      break;
    case "autoFollowUpEmailsPerDay":
      current = await getDailyAutoFollowUpSendCount(businessId);
      break;
    case "autoFollowUpEmailsPerMonth":
      current = await getMonthlyAutoFollowUpSendCount(businessId);
      break;
    case "activeAutoFollowUpsPerBusiness":
      current = await getActiveAutoFollowUpCount(businessId);
      break;
    case "membersPerBusiness":
      current = await getBusinessMemberCount(businessId);
      break;
    case "liveFormsPerBusiness":
      current = await getBusinessLiveFormsCount(businessId);
      break;
    default:
      // Remaining limits (AI credits, pricing entries, knowledge sources,
      // custom fields, attachment size, free businesses per owner) are
      // enforced at their own write boundaries or by
      // `features/businesses/quota.ts`.
      current = 0;
  }

  return {
    allowed: current < limit,
    current,
    limit,
  };
}
