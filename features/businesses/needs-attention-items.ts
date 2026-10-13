import {
  getBusinessInquiryPath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";
import type { getBusinessOverviewData } from "@/features/businesses/queries";
import type { getFollowUpOverviewForBusiness } from "@/features/follow-ups/queries";
import type {
  NeedsAttentionIconName,
  NeedsAttentionItemData,
} from "@/features/businesses/components/needs-attention-tabs";
import { formatQuoteDate } from "@/features/quotes/utils";

/**
 * Map dashboard overview + follow-up snapshots to priority-queue items.
 * Single home for the mapping previously inline in the home page region.
 */
export function buildNeedsAttentionItems({
  businessSlug,
  overview,
  followUpOverview,
}: {
  businessSlug: string;
  overview: Awaited<ReturnType<typeof getBusinessOverviewData>>;
  followUpOverview: Awaited<ReturnType<typeof getFollowUpOverviewForBusiness>>;
}): NeedsAttentionItemData[] {
  return [
    ...followUpOverview.overdue.map((followUp) => ({
      href: followUp.related.kind === "quote"
        ? getBusinessQuotePath(businessSlug, followUp.related.id)
        : getBusinessInquiryPath(businessSlug, followUp.related.id),
      key: `overdue-followup:${followUp.id}`,
      label: "Overdue follow-up",
      title: followUp.title,
      description: `${followUp.customerName} · ${followUp.reason}`,
      meta: `Due ${formatQuoteDate(followUp.dueAt)}`,
      actionLabel: "Follow up now",
      tone: "urgent" as const,
      iconName: "bell-ring" as NeedsAttentionIconName,
      category: "Follow-up" as const,
    })),
    ...followUpOverview.dueToday.map((followUp) => ({
      href: followUp.related.kind === "quote"
        ? getBusinessQuotePath(businessSlug, followUp.related.id)
        : getBusinessInquiryPath(businessSlug, followUp.related.id),
      key: `today-followup:${followUp.id}`,
      label: "Due today",
      title: followUp.title,
      description: `${followUp.customerName} · ${followUp.reason}`,
      meta: `Due ${formatQuoteDate(followUp.dueAt)}`,
      actionLabel: "Follow up",
      tone: "normal" as const,
      iconName: "bell-ring" as NeedsAttentionIconName,
      category: "Follow-up" as const,
    })),
    ...overview.expiringSoonQuotes.map((quote) => ({
      href: getBusinessQuotePath(businessSlug, quote.id),
      key: `expiring-quote:${quote.id}`,
      label: "Quote expiring",
      title: quote.title,
      description: quote.customerName,
      meta: `Expires ${formatQuoteDate(quote.validUntil)}`,
      actionLabel: "Follow up before expiry",
      tone: "urgent" as const,
      iconName: "file-text" as NeedsAttentionIconName,
      category: "Quote" as const,
    })),
    ...overview.awaitingResponseQuotes.map((quote) => ({
      href: getBusinessQuotePath(businessSlug, quote.id),
      key: `awaiting-response-quote:${quote.id}`,
      label: "Awaiting response",
      title: quote.title,
      description: quote.customerName,
      meta: `Sent ${formatQuoteDate(quote.sentAt ?? quote.updatedAt)}`,
      actionLabel: "Follow up",
      tone: "normal" as const,
      iconName: "file-text" as NeedsAttentionIconName,
      category: "Quote" as const,
    })),
    ...overview.recentAcceptedQuotes.map((quote) => ({
      href: getBusinessQuotePath(businessSlug, quote.id),
      key: `accepted-quote:${quote.id}`,
      label: "Won",
      title: quote.title,
      description: quote.customerName,
      meta: `Accepted ${formatQuoteDate(quote.acceptedAt ?? quote.updatedAt)}`,
      actionLabel: "View quote",
      tone: "positive" as const,
      iconName: "check-circle" as NeedsAttentionIconName,
      category: "Quote" as const,
    })),
    ...overview.overdueInquiries.map((inquiry) => ({
      href: getBusinessInquiryPath(businessSlug, inquiry.id),
      key: `overdue-inquiry:${inquiry.id}`,
      label: "Overdue inquiry",
      title: inquiry.customerName,
      description: inquiry.subject ?? inquiry.customerName,
      meta: `Submitted ${formatQuoteDate(inquiry.submittedAt)}`,
      actionLabel: "Create quote",
      tone: "urgent" as const,
      iconName: "inbox" as NeedsAttentionIconName,
      category: "Inquiry" as const,
    })),
    ...overview.newInquiries.map((inquiry) => ({
      href: getBusinessInquiryPath(businessSlug, inquiry.id),
      key: `new-inquiry:${inquiry.id}`,
      label: "New inquiry",
      title: inquiry.customerName,
      description: inquiry.subject ?? inquiry.customerName,
      meta: `Submitted ${formatQuoteDate(inquiry.submittedAt)}`,
      actionLabel: "Create quote",
      tone: "normal" as const,
      iconName: "inbox" as NeedsAttentionIconName,
      category: "Inquiry" as const,
    })),
    ...overview.draftQuotes.map((quote) => ({
      href: getBusinessQuotePath(businessSlug, quote.id),
      key: `draft-quote:${quote.id}`,
      label: "Draft quote",
      title: quote.title,
      description: quote.title || quote.customerName,
      meta: `Updated ${formatQuoteDate(quote.updatedAt)}`,
      actionLabel: "Finish & send",
      tone: "normal" as const,
      iconName: "file-text" as NeedsAttentionIconName,
      category: "Quote" as const,
    })),
];
}
