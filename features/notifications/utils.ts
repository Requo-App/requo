import type {
  BusinessNotificationItem,
  BusinessNotificationRecord,
  BusinessNotificationType,
} from "@/features/notifications/types";
import {
  getBusinessHomePath,
  getBusinessInquiryPath,
  getBusinessInvoicePath,
  getBusinessQuotePath,
} from "@/features/businesses/routes";

const notificationDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function buildBusinessNotificationHref(
  businessSlug: string,
  notification: Pick<BusinessNotificationRecord, "inquiryId" | "quoteId" | "invoiceId">,
) {
  if (notification.invoiceId) {
    return getBusinessInvoicePath(businessSlug, notification.invoiceId);
  }

  if (notification.quoteId) {
    return getBusinessQuotePath(businessSlug, notification.quoteId);
  }

  if (notification.inquiryId) {
    return getBusinessInquiryPath(businessSlug, notification.inquiryId);
  }

  return getBusinessHomePath(businessSlug);
}

export function isNotificationUnread(
  createdAt: Date | string,
  lastReadAt: Date | string | null,
) {
  if (!lastReadAt) {
    return true;
  }

  return new Date(createdAt).getTime() > new Date(lastReadAt).getTime();
}

export function toBusinessNotificationItem(
  businessSlug: string,
  notification: BusinessNotificationRecord,
  lastReadAt: Date | string | null,
  individuallyReadIds?: ReadonlySet<string>,
): BusinessNotificationItem {
  const coveredByWatermark = !isNotificationUnread(
    notification.createdAt,
    lastReadAt,
  );
  const individuallyRead = individuallyReadIds?.has(notification.id) ?? false;

  return {
    id: notification.id,
    type: notification.type,
    title: notification.title,
    summary: notification.summary,
    href: buildBusinessNotificationHref(businessSlug, notification),
    createdAt: notification.createdAt.toISOString(),
    unread: !(coveredByWatermark || individuallyRead),
  };
}

export function getBusinessNotificationTypeLabel(type: BusinessNotificationType) {
  switch (type) {
    case "public_inquiry_submitted":
      return "New inquiry";
    case "quote_customer_accepted":
      return "Quote accepted";
    case "quote_customer_rejected":
      return "Quote declined";
    case "quote_revision_requested":
      return "Revision requested";
    case "business_member_invite_accepted":
      return "Invite accepted";
    case "business_member_invite_declined":
      return "Invite declined";
    case "automation":
      return "Automation";
    case "invoice_paid":
      return "Invoice paid";
    case "invoice_overdue":
      return "Invoice overdue";
  }
}

export function formatNotificationDateTime(value: string | Date) {
  return notificationDateTimeFormatter.format(new Date(value));
}

export function formatRelativeNotificationTime(value: string | Date) {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();

  if (diffMs < 60_000) {
    return "Just now";
  }

  if (diffMs < 60 * 60_000) {
    return `${Math.floor(diffMs / 60_000)}m ago`;
  }

  if (diffMs < 24 * 60 * 60_000) {
    return `${Math.floor(diffMs / (60 * 60_000))}h ago`;
  }

  if (diffMs < 7 * 24 * 60 * 60_000) {
    return `${Math.floor(diffMs / (24 * 60 * 60_000))}d ago`;
  }

  return formatNotificationDateTime(date);
}
