export const businessNotificationTypes = [
  "public_inquiry_submitted",
  "quote_customer_accepted",
  "quote_customer_rejected",
  "quote_revision_requested",
  "quote_discussion_message",
  "quote_viewed",
  "quote_expiring",
  "follow_up_due",
  "business_member_invite_accepted",
  "business_member_invite_declined",
  "automation",
  "invoice_paid",
  "invoice_overdue",
  "approval_requested",
  "approval_approved",
  "approval_changes_requested",
  "approval_expired",
  "change_order_created",
  "change_order_decided",
] as const;

export type BusinessNotificationType =
  (typeof businessNotificationTypes)[number];

export type BusinessNotificationRecord = {
  id: string;
  businessId: string;
  inquiryId: string | null;
  quoteId: string | null;
  invoiceId: string | null;
  type: BusinessNotificationType;
  title: string;
  summary: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
};

export type BusinessNotificationItem = {
  id: string;
  type: BusinessNotificationType;
  title: string;
  summary: string;
  href: string;
  createdAt: string;
  unread: boolean;
};

export type BusinessNotificationBellView = {
  items: BusinessNotificationItem[];
  unreadCount: number;
  lastReadAt: string | null;
  /** True when more rows exist beyond `items` (load older via cursor). */
  hasMore: boolean;
};

export type BusinessNotificationLoadMoreResult =
  | {
      ok: true;
      items: BusinessNotificationItem[];
      hasMore: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export type BusinessNotificationActionResult =
  | {
      ok: true;
      lastReadAt: string;
    }
  | {
      ok: false;
      error: string;
    };

export type BusinessNotificationSingleReadResult =
  | {
      ok: true;
      notificationId: string;
    }
  | {
      ok: false;
      error: string;
    };
