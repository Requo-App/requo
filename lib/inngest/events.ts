export const inngestEvents = {
  inquiryQualified: "requo/inquiry.qualified",
  pushInquiryReceived: "requo/push.inquiry-received",
  pushQuoteSent: "requo/push.quote-sent",
  pushQuoteResponse: "requo/push.quote-response",
  pushQuoteDiscussionMessage: "requo/push.quote-discussion-message",
  pushInvoiceSent: "requo/push.invoice-sent",
  pushInvoicePaid: "requo/push.invoice-paid",
  pushInvoiceOverdue: "requo/push.invoice-overdue",
  enableQuoteAutoFollowUp: "requo/quotes.enable-auto-follow-up",
  knowledgeFileUploaded: "requo/knowledge.file-uploaded",
} as const;

export type InngestEventName =
  (typeof inngestEvents)[keyof typeof inngestEvents];

export type InquiryQualifiedEventData = {
  businessId: string;
  inquiryId: string;
  qualifiedAt: string;
};

export type PushInquiryReceivedEventData = {
  businessId: string;
  inquiryId: string;
  businessSlug: string;
  customerName: string;
};

export type PushQuoteSentEventData = {
  businessId: string;
  businessSlug: string;
  quoteId: string;
  quoteNumber: string;
  customerName: string;
};

export type PushQuoteResponseEventData = {
  businessId: string;
  businessSlug: string;
  quoteId: string;
  quoteNumber: string;
  customerName: string;
  responseLabel: "accepted" | "declined" | "revision requested";
};

export type PushQuoteDiscussionMessageEventData = {
  businessId: string;
  businessSlug: string;
  quoteId: string;
  quoteNumber: string;
  discussionId: string;
  customerName: string;
};

export type PushInvoiceSentEventData = {
  businessId: string;
  businessSlug: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
};

export type PushInvoicePaidEventData = {
  businessId: string;
  businessSlug: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
};

export type PushInvoiceOverdueEventData = {
  businessId: string;
  businessSlug: string;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  dueDate: string;
};

export type EnableQuoteAutoFollowUpEventData = {
  businessId: string;
  quoteId: string;
  delayDays: number;
  maxAttempts: number;
};

export type KnowledgeFileUploadedEventData = {
  businessId: string;
  fileId: string;
};
