export const quoteDiscussionViews = [
  "needs_reply",
  "waiting_for_customer",
  "archived",
] as const;

export type QuoteDiscussionView = (typeof quoteDiscussionViews)[number];

/**
 * Discussion state is derived from the latest message sender and the quote's
 * lifecycle. It is deliberately not a mutable column that can drift.
 */
export type QuoteDiscussionState =
  | "needs_reply"
  | "waiting_for_customer"
  | "archived";

export type QuoteDiscussionSenderType = "customer" | "business";

export type QuoteDiscussionMessageView = {
  id: string;
  senderType: QuoteDiscussionSenderType;
  senderName: string;
  body: string;
  createdAt: string;
};

export type QuoteDiscussionSummary = {
  id: string;
  quoteId: string;
  quoteNumber: string;
  quoteStatus: string;
  quoteTotalInCents: number;
  currency: string;
  customerName: string;
  state: QuoteDiscussionState;
  unreadCount: number;
  lastMessageAt: string;
  lastMessage: {
    senderType: QuoteDiscussionSenderType;
    senderName: string;
    body: string;
    createdAt: string;
  } | null;
};

export type QuoteDiscussionDetail = QuoteDiscussionSummary & {
  businessName: string;
  businessSlug: string;
  customerEmail: string | null;
  validUntil: string;
  archivedAt: string | null;
  messages: QuoteDiscussionMessageView[];
};

export type QuoteDiscussionInboxFilters = {
  view: QuoteDiscussionView;
  page: number;
};

export type QuoteDiscussionInboxResult = {
  items: QuoteDiscussionSummary[];
  totalCount: number;
  page: number;
  pageSize: number;
};

export type PublicQuoteDiscussionView = {
  messages: QuoteDiscussionMessageView[];
  closed: boolean;
  archived: boolean;
  suggestedName: string;
  businessName: string;
  quoteNumber: string;
};

export type QuoteDiscussionFieldErrors = Partial<
  Record<"senderName" | "body", string[] | undefined>
>;

export type QuoteDiscussionActionState = {
  error?: string;
  success?: string;
  fieldErrors?: QuoteDiscussionFieldErrors;
};
