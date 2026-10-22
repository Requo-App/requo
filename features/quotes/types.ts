export const quoteStatuses = [
  "draft",
  "sent",
  "revision_requested",
  "accepted",
  "rejected",
  "expired",
  "voided",
] as const;
export const quoteRecordViews = ["active", "archived"] as const;

export type QuoteStatus = (typeof quoteStatuses)[number];
export const quoteStatusFilterValues = ["all", ...quoteStatuses] as const;
export type QuoteStatusFilterValue = (typeof quoteStatusFilterValues)[number];
export type QuoteRecordView = (typeof quoteRecordViews)[number];
export const quoteDeliveryMethods = ["requo", "manual"] as const;
export const quoteSendChannels = [
  "email",
  "sms",
  "whatsapp",
  "messenger",
  "instagram",
  "phone",
  "other",
] as const;
export type QuoteSendChannel = (typeof quoteSendChannels)[number];
export const quoteSendEventTypes = [
  "copied_link",
  "copied_message",
  "opened_email_app",
  "copied_followup",
] as const;
export type QuoteSendEventType = (typeof quoteSendEventTypes)[number];
export type QuoteDeliveryMethod = (typeof quoteDeliveryMethods)[number];
export const quoteReminderKinds = ["follow_up_due", "expiring_soon"] as const;
export type QuoteReminderKind = (typeof quoteReminderKinds)[number];
export const quoteLibraryEntryKinds = ["block", "package", "template"] as const;
export type QuoteLibraryEntryKind = (typeof quoteLibraryEntryKinds)[number];

import type {
  InquiryRecordState,
  InquiryStatus,
} from "@/features/inquiries/types";
import type { PlanTier } from "@/lib/plans/plans";
import type {
  AiQuoteDraftItem,
  AiQuoteMissingInfoItem,
  AiQuoteProductStatus,
  AiQuoteReadiness,
} from "@/features/quote-drafting/types";

export type QuoteListFilters = {
  q?: string;
  view: QuoteRecordView;
  status: QuoteStatusFilterValue;
  sort: "newest" | "oldest";
  page: number;
};

export type QuoteListQueryFilters = Omit<QuoteListFilters, "page">;

export type DashboardQuoteListItem = {
  id: string;
  quoteNumber: string;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  totalInCents: number;
  currency: string;
  validUntil: string;
  status: QuoteStatus;
  archivedAt: Date | null;
  sentAt: Date | null;
  publicViewedAt: Date | null;
  customerRespondedAt: Date | null;
  pendingFollowUpCount: number;
  nextFollowUpDueAt: Date | null;
  reminders: QuoteReminderKind[];
};

export type DashboardQuoteItem = {
  id: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
  lineTotalInCents: number;
  position: number;
};

export type DashboardQuoteLibraryItem = {
  id: string;
  description: string;
  quantity: number;
  unitPriceInCents: number;
  position: number;
};

export type DashboardQuoteLibraryEntry = {
  id: string;
  currency: string;
  kind: QuoteLibraryEntryKind;
  name: string;
  description: string | null;
  /** Template-specific: display title for the quote when template is applied. */
  title: string | null;
  /** Template-specific: default quote notes. */
  notes: string | null;
  /** Template-specific: default quote terms. */
  terms: string | null;
  /** Template-specific: default validity period in days (1–365). */
  validityDays: number | null;
  itemCount: number;
  totalInCents: number;
  createdAt: Date;
  updatedAt: Date;
  items: DashboardQuoteLibraryItem[];
};

export type DashboardQuoteLibrarySummary = {
  entryCount: number;
  blockCount: number;
  packageCount: number;
};

export type DashboardQuoteActivity = {
  id: string;
  type: string;
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

export type QuoteLinkedInquirySummary = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  subject: string | null;
  requestedDeadline: string | null;
  status: InquiryStatus;
  recordState: InquiryRecordState;
  details: string;
  budgetText: string | null;
};

export type QuoteInquiryPrefill = {
  id: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  subject: string | null;
  status: InquiryStatus;
  recordState: InquiryRecordState;
  details: string;
  requestedDeadline: string | null;
  budgetText: string | null;
};

export type DashboardQuoteDetail = {
  id: string;
  businessId: string;
  inquiryId: string | null;
  quoteNumber: string;
  publicToken: string | null;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
  totalInCents: number;
  validUntil: string;
  version: number;
  status: QuoteStatus;
  archivedAt: Date | null;
  voidedAt: Date | null;
  sentAt: Date | null;
  acceptedAt: Date | null;
  publicViewedAt: Date | null;
  customerRespondedAt: Date | null;
  customerResponseMessage: string | null;
  autoFollowUpEnabled: boolean;
  autoFollowUpDelayDays: number;
  autoFollowUpMaxAttempts: number;
  autoFollowUpAttempts: number;
  autoFollowUpLastSentAt: Date | null;
  autoFollowUpStoppedAt: Date | null;
  completedAt: Date | null;
  canceledAt: Date | null;
  cancellationReason: string | null;
  cancellationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: DashboardQuoteItem[];
  activities: DashboardQuoteActivity[];
  linkedInquiry: QuoteLinkedInquirySummary | null;
  reminders: QuoteReminderKind[];
  /** Server-computed AI readiness. `needs_confirmation` gates sending. */
  aiReadiness: AiQuoteReadiness | null;
  /** Set when the owner explicitly acknowledged suggested/unconfirmed pricing. */
  aiAcknowledgedAt: Date | null;
};

/**
 * Cheap core of the quote detail: the quote row, its linked inquiry, and the
 * derived reminders. Paints the header, workflow steps, and sidebars while
 * line items and the activity log stream separately.
 */
export type DashboardQuoteDetailCore = Omit<
  DashboardQuoteDetail,
  "items" | "activities"
>;

export type QuoteSendPayload = {
  id: string;
  inquiryId: string | null;
  quoteNumber: string;
  publicToken: string | null;
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
  totalInCents: number;
  validUntil: string;
  status: QuoteStatus;
  updatedAt: Date;
  items: DashboardQuoteItem[];
  /** Server-computed AI readiness. `needs_confirmation` gates sending. */
  aiReadiness: AiQuoteReadiness | null;
  /** Set when the owner explicitly acknowledged suggested/unconfirmed pricing. */
  aiAcknowledgedAt: Date | null;
  /** Missing-info questions surfaced by the last AI draft. Informational. */
  aiMissingInfo: AiQuoteMissingInfoItem[] | null;
};

export type PublicQuoteView = {
  id: string;
  businessId: string;
  token: string;
  quoteNumber: string;
  title: string;
  businessName: string;
  businessSlug: string;
  businessPlan: PlanTier;
  businessShortDescription: string | null;
  businessContactEmail: string | null;
  businessLogoStoragePath: string | null;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  validUntil: string;
  version: number;
  status: QuoteStatus;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
  totalInCents: number;
  sentAt: Date | null;
  acceptedAt: Date | null;
  publicViewedAt: Date | null;
  customerRespondedAt: Date | null;
  customerResponseMessage: string | null;
  items: DashboardQuoteItem[];
  acceptance?: QuoteAcceptanceView | null;
};

/**
 * The slice of the public quote the interactive column needs.
 *
 * The full `PublicQuoteView` carries internal entity ids, the business plan
 * tier and the acceptance record's audit fields. Passing it to a client
 * component serialises all of it into the page payload, so the client
 * receives only what it renders.
 */
export type PublicQuoteInteractiveQuote = {
  quoteNumber: string;
  businessName: string;
  businessContactEmail: string | null;
  status: QuoteStatus;
  version: number;
  validUntil: string;
  customerRespondedAt: Date | null;
  customerResponseMessage: string | null;
  acceptance: {
    signerName: string | null;
    quoteVersion: number;
    acceptedAt: Date | null;
  } | null;
};

export type QuoteEditorLineItemValue = {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
  /**
   * Optional AI review metadata. Populated when the editor was hydrated from
   * an AI-generated draft. Cleared once the owner edits the price.
   */
  aiReview?: AiQuoteLineItemReview;
  /**
   * Grounded pricing state carried through saves. `owner_set` when the owner
   * edited a generated line item — the server never accepts any other value
   * from the model or the client as authoritative for a changed line.
   */
  aiProductStatus?: AiQuoteProductStatus;
  /** Quote library entry/item behind a generated price (null once owner-edited). */
  aiProductLibraryEntryId?: string | null;
  aiProductLibraryItemId?: string | null;
  /** Grounded pricing evidence set by server-side hydration/verification. */
  aiEvidence?: AiQuoteDraftItem["aiEvidence"] | null;
};

/**
 * AI review metadata attached to an editor line item. Mirrors the AI draft
 * line item shape but lives on the editor row so the UI can surface a per-row
 * badge and the send guard can block delivery while items still need pricing.
 */
export type AiQuoteLineItemReview = {
  name: string;
  pricingSource:
    | "pricing_library_block"
    | "pricing_library_package"
    | "past_quote"
    | "business_memory"
    | "owner_brief"
    | "none";
  pricingSourceLabel: string | null;
  confidence: "high" | "medium" | "low";
  reviewStatus: "matched" | "calculated" | "needs_review" | "no_pricing_found";
  reason: string;
};

export type QuoteEditorValues = {
  title: string;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  notes: string;
  terms: string;
  validUntil: string;
  discount: string;
  discountType: "amount" | "percentage";
  tax: string;
  taxType: "amount" | "percentage";
  taxLabel: string;
  items: QuoteEditorLineItemValue[];
};

export type QuoteEditorFieldName =
  | "title"
  | "customerName"
  | "customerEmail"
  | "customerContactMethod"
  | "customerContactHandle"
  | "notes"
  | "terms"
  | "validUntil"
  | "discount"
  | "tax"
  | "items";

export type QuoteEditorFieldErrors = Partial<
  Record<QuoteEditorFieldName, string[] | undefined>
>;

export type QuoteEditorActionState = {
  error?: string;
  success?: string;
  fieldErrors?: QuoteEditorFieldErrors;
};

export type QuoteLibraryEditorValues = {
  kind: QuoteLibraryEntryKind;
  name: string;
  description: string;
  title?: string;
  notes?: string;
  terms?: string;
  validityDays?: string;
  items: QuoteEditorLineItemValue[];
};

export type QuoteLibraryFieldName = "kind" | "name" | "description" | "title" | "notes" | "terms" | "validityDays" | "items";

export type QuoteLibraryFieldErrors = Partial<
  Record<QuoteLibraryFieldName, string[] | undefined>
>;

export type QuoteLibraryActionState = {
  error?: string;
  success?: string;
  fieldErrors?: QuoteLibraryFieldErrors;
};

export type QuoteLibraryDeleteActionState = {
  error?: string;
  success?: boolean;
};

export type QuoteRecordActionState = {
  error?: string;
  success?: string;
};

export type QuoteCancellationActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<
    Record<"cancellationReason" | "cancellationNote", string[] | undefined>
  >;
};

export type QuoteCompletionActionState = {
  error?: string;
  success?: string;
};

export type QuoteSendActionState = {
  error?: string;
  success?: string;
};

export type PublicQuoteResponseFieldErrors = Partial<
  Record<"response" | "message" | "signerName" | "confirmed" | "expectedVersion", string[] | undefined>
>;

export type PublicQuoteResolvedSnapshot = {
  status: QuoteStatus;
  customerRespondedAt: string;
  customerResponseMessage: string | null;
  signerName?: string | null;
  acceptedAt?: string | null;
  version?: number;
};

export type QuoteAcceptanceView = {
  id: string;
  quoteVersion: number;
  signerName: string;
  signerEmail: string | null;
  acceptanceMethod: string;
  acceptanceText: string;
  acceptanceTextVersion: number;
  snapshotHash: string;
  acceptedAt: Date;
};

export type PublicQuoteResponseActionState = {
  error?: string;
  success?: string;
  fieldErrors?: PublicQuoteResponseFieldErrors;
  /** Set after a successful accept/decline so the customer view can update immediately. */
  resolvedQuote?: PublicQuoteResolvedSnapshot;
};

export type QuoteRevisionItemComment = {
  itemId: string;
  itemDescription: string;
  comment: string;
};

export type QuoteRevisionRequest = {
  id: string;
  quoteId: string;
  version: number;
  message: string | null;
  itemComments: QuoteRevisionItemComment[];
  status: "pending" | "resolved";
  createdAt: Date;
  resolvedAt: Date | null;
};

export type QuoteVersionSnapshot = {
  id: string;
  version: number;
  title: string;
  customerName: string;
  currency: string;
  notes: string | null;
  terms: string | null;
  subtotalInCents: number;
  discountInCents: number;
  taxInCents: number;
  taxLabel: string | null;
  totalInCents: number;
  validUntil: string;
  items: {
    id: string;
    description: string;
    quantity: number;
    unitPriceInCents: number;
    lineTotalInCents: number;
    position: number;
  }[];
  createdAt: Date;
  archivedAt: Date;
};

export type PublicQuoteRevisionRequestActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"message" | "itemComments", string[] | undefined>>;
};

export type QuoteBulkActionState = {
  success?: string;
  error?: string;
  affected?: number;
  skipped?: number;
};
