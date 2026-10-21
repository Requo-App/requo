import "server-only";

import { and, desc, eq, gte, inArray, isNull } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { newEntityId } from "@/lib/ids";
import {
  type AnalyticsEventMetadata,
  analyticsEvents,
  businesses,
  businessInquiryForms,
  quotes,
} from "@/lib/db/schema";
import { getPublicActionClientIpAddress } from "@/lib/public-action-rate-limit";
import { getOperationalBusinessCondition } from "@/features/businesses/lifecycle";
import { hashOpaqueToken } from "@/lib/security/tokens";

export type PublicAnalyticsHeaderStore = Pick<Headers, "get">;

export type VerticalAnalyticsEventType =
  | "approval_requested"
  | "approval_viewed"
  | "approval_approved"
  | "approval_changes_requested"
  | "approval_expired"
  | "change_order_created"
  | "change_order_approved"
  | "change_order_rejected"
  | "schedule_created"
  | "schedule_accepted"
  | "schedule_prefill_used"
  | "scope_block_added"
  | "scope_required_missing"
  | "readiness_blocked"
  | "readiness_completed"
  | "ai_pack_guidance_used"
  | "ai_missing_info_detected";

type AnalyticsEventType =
  | "inquiry_form_viewed"
  | "quote_public_viewed"
  | VerticalAnalyticsEventType;

const analyticsDuplicateWindowMs = 10_000;

type RecordAnalyticsEventInput = {
  businessId: string;
  businessInquiryFormId?: string | null;
  quoteId?: string | null;
  eventType: AnalyticsEventType;
  visitorHash: string;
  occurredAt?: Date;
  metadata?: AnalyticsEventMetadata | null;
};

export function createBusinessScopedVisitorHash(
  businessId: string,
  headerStore: PublicAnalyticsHeaderStore,
) {
  const ipAddress = getPublicActionClientIpAddress(headerStore);
  const userAgent = headerStore.get("user-agent")?.trim() || "unknown";

  return hashOpaqueToken(`${businessId}:${ipAddress}:${userAgent}`);
}

async function findRecentMatchingAnalyticsEvent({
  businessId,
  businessInquiryFormId = null,
  quoteId = null,
  eventType,
  visitorHash,
  occurredAt = new Date(),
}: RecordAnalyticsEventInput) {
  const windowStart = new Date(occurredAt.getTime() - analyticsDuplicateWindowMs);

  const [existingEvent] = await db
    .select({
      id: analyticsEvents.id,
    })
    .from(analyticsEvents)
    .where(
      and(
        eq(analyticsEvents.businessId, businessId),
        eq(analyticsEvents.eventType, eventType),
        eq(analyticsEvents.visitorHash, visitorHash),
        businessInquiryFormId === null
          ? isNull(analyticsEvents.businessInquiryFormId)
          : eq(analyticsEvents.businessInquiryFormId, businessInquiryFormId),
        quoteId === null
          ? isNull(analyticsEvents.quoteId)
          : eq(analyticsEvents.quoteId, quoteId),
        gte(analyticsEvents.occurredAt, windowStart),
      ),
    )
    .orderBy(desc(analyticsEvents.occurredAt))
    .limit(1);

  return existingEvent ?? null;
}

export async function recordAnalyticsEvent({
  businessId,
  businessInquiryFormId = null,
  quoteId = null,
  eventType,
  visitorHash,
  occurredAt = new Date(),
  metadata = null,
}: RecordAnalyticsEventInput) {
  const existingEvent = await findRecentMatchingAnalyticsEvent({
    businessId,
    businessInquiryFormId,
    quoteId,
    eventType,
    visitorHash,
    occurredAt,
  });

  if (existingEvent) {
    return {
      recorded: false,
      duplicate: true,
    } as const;
  }

  await db.insert(analyticsEvents).values({
    id: newEntityId(),
    businessId,
    businessInquiryFormId,
    quoteId,
    eventType,
    visitorHash,
    occurredAt,
    metadata,
  });

  return {
    recorded: true,
    duplicate: false,
  } as const;
}

export async function recordPublicInquiryFormView(input: {
  businessId: string;
  businessInquiryFormId: string;
  visitorHash: string;
  occurredAt?: Date;
  metadata?: AnalyticsEventMetadata | null;
}) {
  return recordAnalyticsEvent({
    ...input,
    eventType: "inquiry_form_viewed",
  });
}

export async function recordPublicQuoteView(input: {
  businessId: string;
  quoteId: string;
  visitorHash: string;
  occurredAt?: Date;
  metadata?: AnalyticsEventMetadata | null;
}) {
  return recordAnalyticsEvent({
    ...input,
    eventType: "quote_public_viewed",
  });
}

export async function isTrackablePublicInquiryForm(input: {
  businessId: string;
  businessInquiryFormId: string;
}) {
  const [form] = await db
    .select({
      id: businessInquiryForms.id,
    })
    .from(businessInquiryForms)
    .innerJoin(businesses, eq(businessInquiryForms.businessId, businesses.id))
    .where(
      and(
        eq(businessInquiryForms.businessId, input.businessId),
        eq(businessInquiryForms.id, input.businessInquiryFormId),
        eq(businessInquiryForms.publicInquiryEnabled, true),
        isNull(businessInquiryForms.archivedAt),
        eq(businesses.publicInquiryEnabled, true),
        getOperationalBusinessCondition(),
      ),
    )
    .limit(1);

  return Boolean(form);
}

export async function isTrackablePublicQuote(input: {
  businessId: string;
  quoteId: string;
}) {
  const [quote] = await db
    .select({
      id: quotes.id,
    })
    .from(quotes)
    .innerJoin(businesses, eq(quotes.businessId, businesses.id))
    .where(
      and(
        eq(quotes.businessId, input.businessId),
        eq(quotes.id, input.quoteId),
        isNull(quotes.deletedAt),
        inArray(quotes.status, [
          "sent",
          "accepted",
          "rejected",
          "expired",
          "voided",
        ]),
        isNull(businesses.archivedAt),
        isNull(businesses.deletedAt),
      ),
    )
    .limit(1);

  return Boolean(quote);
}
