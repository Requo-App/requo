import "server-only";

import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";

import { getNormalizedInquirySubmittedFieldSnapshot } from "@/features/inquiries/form-config";
import { getNormalizedInquiryPageConfig } from "@/features/inquiries/page-config";
import { normalizeBusinessType } from "@/features/inquiries/business-types";
import type { InquiryAssistantContext } from "@/features/quote-drafting/types";
import { getEffectiveQuoteStatus } from "@/features/quotes/queries";
import { db } from "@/lib/db/client";
import {
  activityLogs,
  inquiries,
  inquiryAttachments,
  inquiryMessages,
  inquiryNotes,
  followUps,
  quoteItems,
  quotes,
  user,
  services,
  businesses,
} from "@/lib/db/schema";

type GetInquiryAssistantContextForBusinessInput = {
  businessId: string;
  inquiryId: string;
};

export async function getInquiryAssistantContextForBusiness({
  businessId,
  inquiryId,
}: GetInquiryAssistantContextForBusinessInput): Promise<InquiryAssistantContext | null> {
  const [businessRow, inquiryRow, notes, attachments, activities, quoteRows, messages] =
    await Promise.all([
    db
      .select({
        id: businesses.id,
        name: businesses.name,
        slug: businesses.slug,
        businessType: businesses.businessType,
        shortDescription: businesses.shortDescription,
        contactEmail: businesses.contactEmail,
        defaultCurrency: businesses.defaultCurrency,
        defaultEmailSignature: businesses.defaultEmailSignature,
        defaultQuoteNotes: businesses.defaultQuoteNotes,
        defaultQuoteTerms: businesses.defaultQuoteTerms,
        industryCategory: businesses.industryCategory,
        inquiryHeadline: businesses.inquiryHeadline,
        createdAt: businesses.createdAt,
      })
      .from(businesses)
      .where(eq(businesses.id, businessId))
      .limit(1),
    db
      .select({
        id: inquiries.id,
        serviceId: inquiries.serviceId,
        serviceName: services.name,
        serviceSlug: services.slug,
        serviceBusinessType: services.businessType,
        publicInquiryEnabled: services.publicInquiryEnabled,
        inquiryPageConfig: services.inquiryPageConfig,
        customerName: inquiries.customerName,
        customerEmail: inquiries.customerEmail,
        customerContactMethod: inquiries.customerContactMethod,
        customerContactHandle: inquiries.customerContactHandle,
        requestedDeadline: inquiries.requestedDeadline,
        budgetText: inquiries.budgetText,
        subject: inquiries.subject,
        details: inquiries.details,
        source: inquiries.source,
        status: inquiries.status,
        submittedAt: inquiries.submittedAt,
        createdAt: inquiries.createdAt,
        submittedFieldSnapshot: inquiries.submittedFieldSnapshot,
      })
      .from(inquiries)
      .leftJoin(
        services,
        eq(inquiries.serviceId, services.id),
      )
      .where(and(eq(inquiries.id, inquiryId), eq(inquiries.businessId, businessId)))
      .limit(1),
    db
      .select({
        id: inquiryNotes.id,
        body: inquiryNotes.body,
        createdAt: inquiryNotes.createdAt,
        authorName: user.name,
      })
      .from(inquiryNotes)
      .leftJoin(user, eq(inquiryNotes.authorUserId, user.id))
      .where(
        and(
          eq(inquiryNotes.businessId, businessId),
          eq(inquiryNotes.inquiryId, inquiryId),
        ),
      )
      .orderBy(desc(inquiryNotes.createdAt))
      .limit(20),
    db
      .select({
        id: inquiryAttachments.id,
        fileName: inquiryAttachments.fileName,
        contentType: inquiryAttachments.contentType,
        fileSize: inquiryAttachments.fileSize,
        createdAt: inquiryAttachments.createdAt,
      })
      .from(inquiryAttachments)
      .where(
        and(
          eq(inquiryAttachments.businessId, businessId),
          eq(inquiryAttachments.inquiryId, inquiryId),
        ),
      )
      .orderBy(desc(inquiryAttachments.createdAt)),
    db
      .select({
        id: activityLogs.id,
        type: activityLogs.type,
        summary: activityLogs.summary,
        createdAt: activityLogs.createdAt,
        actorName: user.name,
      })
      .from(activityLogs)
      .leftJoin(user, eq(activityLogs.actorUserId, user.id))
      .where(
        and(
          eq(activityLogs.businessId, businessId),
          eq(activityLogs.inquiryId, inquiryId),
        ),
      )
      .orderBy(desc(activityLogs.createdAt))
      .limit(30),
    db
      .select({
        id: quotes.id,
        quoteNumber: quotes.quoteNumber,
        title: quotes.title,
        customerName: quotes.customerName,
        customerEmail: quotes.customerEmail,
        customerContactMethod: quotes.customerContactMethod,
        customerContactHandle: quotes.customerContactHandle,
        currency: quotes.currency,
        notes: quotes.notes,
        subtotalInCents: quotes.subtotalInCents,
        discountInCents: quotes.discountInCents,
        totalInCents: quotes.totalInCents,
        validUntil: quotes.validUntil,
        status: getEffectiveQuoteStatus,
        sentAt: quotes.sentAt,
        acceptedAt: quotes.acceptedAt,
        publicViewedAt: quotes.publicViewedAt,
        customerRespondedAt: quotes.customerRespondedAt,
        customerResponseMessage: quotes.customerResponseMessage,
        createdAt: quotes.createdAt,
        updatedAt: quotes.updatedAt,
      })
      .from(quotes)
      .where(
        and(
          eq(quotes.businessId, businessId),
          eq(quotes.inquiryId, inquiryId),
          isNull(quotes.deletedAt),
        ),
      )
      .orderBy(desc(quotes.createdAt)),
    db
      .select({
        id: inquiryMessages.id,
        role: inquiryMessages.role,
        content: inquiryMessages.content,
        createdAt: inquiryMessages.createdAt,
      })
      .from(inquiryMessages)
      .where(eq(inquiryMessages.inquiryId, inquiryId))
      .orderBy(asc(inquiryMessages.createdAt))
      .limit(20),
  ]);

  const business = businessRow[0];
  const inquiry = inquiryRow[0];

  if (!business || !inquiry) {
    return null;
  }

  const serviceBusinessType = normalizeBusinessType(
    inquiry.serviceBusinessType ?? "general_project_services",
  );

  const inquiryPageConfig = getNormalizedInquiryPageConfig(
    inquiry.inquiryPageConfig ?? {},
    {
      businessName: business.name,
      businessShortDescription: business.shortDescription,
      businessType: serviceBusinessType,
    },
  );
  const quoteIds = quoteRows.map((quote) => quote.id);
  const [itemRows, quoteActivityRows, followUpRows] = await Promise.all([
    quoteIds.length
      ? db
          .select({
            id: quoteItems.id,
            quoteId: quoteItems.quoteId,
            description: quoteItems.description,
            quantity: quoteItems.quantity,
            unitPriceInCents: quoteItems.unitPriceInCents,
            lineTotalInCents: quoteItems.lineTotalInCents,
            position: quoteItems.position,
          })
          .from(quoteItems)
          .where(
            and(
              eq(quoteItems.businessId, businessId),
              inArray(quoteItems.quoteId, quoteIds),
            ),
          )
          .orderBy(asc(quoteItems.position), asc(quoteItems.createdAt))
      : Promise.resolve([]),
    quoteIds.length
      ? db
          .select({
            id: activityLogs.id,
            quoteId: activityLogs.quoteId,
            type: activityLogs.type,
            summary: activityLogs.summary,
            createdAt: activityLogs.createdAt,
            actorName: user.name,
          })
          .from(activityLogs)
          .leftJoin(user, eq(activityLogs.actorUserId, user.id))
          .where(
            and(
              eq(activityLogs.businessId, businessId),
              inArray(activityLogs.quoteId, quoteIds),
            ),
          )
          .orderBy(desc(activityLogs.createdAt))
      : Promise.resolve([]),
    db
      .select({
        id: followUps.id,
        inquiryId: followUps.inquiryId,
        quoteId: followUps.quoteId,
        quoteNumber: quotes.quoteNumber,
        quoteTitle: quotes.title,
        title: followUps.title,
        reason: followUps.reason,
        channel: followUps.channel,
        dueAt: followUps.dueAt,
        completedAt: followUps.completedAt,
        skippedAt: followUps.skippedAt,
        status: followUps.status,
        createdAt: followUps.createdAt,
        updatedAt: followUps.updatedAt,
      })
      .from(followUps)
      .leftJoin(quotes, eq(followUps.quoteId, quotes.id))
      .where(
        and(
          eq(followUps.businessId, businessId),
          quoteIds.length
            ? or(
                eq(followUps.inquiryId, inquiryId),
                inArray(followUps.quoteId, quoteIds),
              )
            : eq(followUps.inquiryId, inquiryId),
        ),
      )
      .orderBy(
        sql`case when ${followUps.status} = 'pending' then 0 else 1 end`,
        asc(followUps.dueAt),
        desc(followUps.createdAt),
      ),
  ]);
  const quoteItemsByQuoteId = new Map<string, typeof itemRows>();
  const quoteActivitiesByQuoteId = new Map<string, typeof quoteActivityRows>();

  for (const item of itemRows) {
    const items = quoteItemsByQuoteId.get(item.quoteId) ?? [];

    items.push(item);
    quoteItemsByQuoteId.set(item.quoteId, items);
  }

  for (const activity of quoteActivityRows) {
    if (!activity.quoteId) {
      continue;
    }

    const quoteActivities = quoteActivitiesByQuoteId.get(activity.quoteId) ?? [];

    quoteActivities.push(activity);
    quoteActivitiesByQuoteId.set(activity.quoteId, quoteActivities);
  }

  return {
    business: {
      id: business.id,
      name: business.name,
      slug: business.slug,
      businessType: business.businessType,
      shortDescription: business.shortDescription,
      contactEmail: business.contactEmail,
      defaultCurrency: business.defaultCurrency,
      defaultEmailSignature: business.defaultEmailSignature,
      defaultQuoteNotes: business.defaultQuoteNotes,
      defaultQuoteTerms: business.defaultQuoteTerms,
      industryCategory: business.industryCategory,
      inquiryHeadline: business.inquiryHeadline,
      createdAt: business.createdAt,
      inquiryPageHeadline: inquiryPageConfig.headline,
      inquiryPageTemplate: inquiryPageConfig.template,
      publicInquiryEnabled: inquiry.publicInquiryEnabled ?? false,
    },
    inquiry: {
      ...inquiry,
      serviceBusinessType,
      submittedFieldSnapshot: getNormalizedInquirySubmittedFieldSnapshot(
        inquiry.submittedFieldSnapshot,
      ),
    },
    notes,
    attachments,
    activities,
    followUps: followUpRows,
    relatedQuotes: quoteRows.map((quote) => ({
      ...quote,
      items: (quoteItemsByQuoteId.get(quote.id) ?? []).map((item) => ({
        id: item.id,
        description: item.description,
        quantity: item.quantity,
        unitPriceInCents: item.unitPriceInCents,
        lineTotalInCents: item.lineTotalInCents,
        position: item.position,
      })),
      activities: (quoteActivitiesByQuoteId.get(quote.id) ?? []).map(
        (activity) => ({
          id: activity.id,
          type: activity.type,
          summary: activity.summary,
          createdAt: activity.createdAt,
          actorName: activity.actorName,
        }),
      ),
    })),
    messages,
  };
}
