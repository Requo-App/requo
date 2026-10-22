import type { BusinessType } from "@/features/inquiries/business-types";
import type { QuoteStatus } from "@/features/quotes/types";
import type {
  InquiryFormConfig,
  InquirySubmittedFieldSnapshot,
} from "@/features/inquiries/form-config";
import type { InquiryPageConfig } from "@/features/inquiries/page-config";
import type { PlanTier as plan } from "@/lib/plans/plans";

export const inquiryStatuses = [
  "new",
  "quoted",
  "waiting",
  "won",
  "lost",
  "archived",
  "overdue",
] as const;

export const inquiryWorkflowStatuses = [
  "new",
  "quoted",
  "waiting",
  "won",
  "lost",
] as const;
export const inquiryFilterableStatuses = [
  ...inquiryWorkflowStatuses,
  "overdue",
] as const;
export const inquiryRecordViews = ["active", "archived"] as const;
export const inquirySources = {
  serviceForm: "service_form",
  // Stored value remains `ai_assistant` for historical rows; the customer-facing
  // surface that produces these inquiries is the Agent.
  agent: "ai_assistant",
  manual: "manual",
  api: "api",
  unknown: "unknown",
} as const;

export type InquirySourceValue =
  (typeof inquirySources)[keyof typeof inquirySources];

export const inquirySourceLabels: Record<InquirySourceValue, string> = {
  service_form: "Service Form",
  ai_assistant: "Agent",
  manual: "Manual",
  api: "API",
  unknown: "Unknown",
};

export const inquirySourceFilterValues = [
  "all",
  "service_form",
  "ai_assistant",
  "manual",
  "api",
] as const;

export type InquirySourceFilterValue =
  (typeof inquirySourceFilterValues)[number];

/** Legacy source strings written before the Service/Source refactor. */
export const legacyInquirySourceMap: Record<string, InquirySourceValue> = {
  "public-inquiry-page": "service_form",
  "manual-dashboard": "manual",
  ai_agent: "ai_assistant",
  ai_agent_handoff: "ai_assistant",
  ai: "ai_assistant",
};

/** Normalize any stored source string to a canonical value. */
export function normalizeInquirySource(
  value: string | null | undefined,
): InquirySourceValue {
  if (!value) return "unknown";
  if (
    value === "service_form" ||
    value === "ai_assistant" ||
    value === "manual" ||
    value === "api" ||
    value === "unknown"
  ) {
    return value;
  }
  return legacyInquirySourceMap[value] ?? "unknown";
}

export type InquiryStatus = (typeof inquiryStatuses)[number];
export type InquiryWorkflowStatus = (typeof inquiryWorkflowStatuses)[number];
export type InquiryRecordView = (typeof inquiryRecordViews)[number];
export type InquiryRecordState = InquiryRecordView;
export type InquirySource =
  (typeof inquirySources)[keyof typeof inquirySources];
export const inquiryStatusFilterValues = [
  "all",
  ...inquiryFilterableStatuses,
] as const;
export type InquiryStatusFilterValue = (typeof inquiryStatusFilterValues)[number];

export type DashboardInquiryListItem = {
  id: string;
  serviceId: string | null;
  serviceName: string | null;
  serviceSlug: string | null;
  source: string | null;
  customerName: string;
  customerEmail: string | null;
  serviceCategory: string | null;
  budgetText: string | null;
  status: InquiryStatus;
  recordState: InquiryRecordState;
  subject: string | null;
  archivedAt: Date | null;
  escalated: boolean;
  pendingFollowUpCount: number;
  nextFollowUpDueAt: Date | null;
  hasDuplicateFlag: boolean;
  isUnread: boolean;
  submittedAt: Date;
  createdAt: Date;
};

export type DashboardInquiryAttachment = {
  id: string;
  fileName: string;
  contentType: string;
  fileSize: number;
  createdAt: Date;
};

export type DashboardInquiryNote = {
  id: string;
  body: string;
  createdAt: Date;
  authorName: string | null;
  authorEmail: string | null;
};

export type DashboardInquiryActivity = {
  id: string;
  type: string;
  summary: string;
  createdAt: Date;
  actorName: string | null;
};

export type DashboardInquiryRelatedQuote = {
  id: string;
  status: QuoteStatus;
  /** The customer-facing quote number. Never the internal entity id. */
  quoteNumber: string;
  totalInCents: number;
  createdAt: Date;
};

export type DashboardInquiryRelatedQuotes = {
  latest: DashboardInquiryRelatedQuote;
  all: DashboardInquiryRelatedQuote[];
  count: number;
};

export type DashboardInquiryDetail = {
  id: string;
  businessId: string;
  serviceId: string | null;
  serviceName: string | null;
  serviceSlug: string | null;
  serviceBusinessType: BusinessType | null;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string;
  customerContactHandle: string;
  serviceCategory: string | null;
  requestedDeadline: string | null;
  budgetText: string | null;
  subject: string | null;
  details: string;
  source: string | null;
  status: InquiryStatus;
  recordState: InquiryRecordState;
  archivedAt: Date | null;
  escalated: boolean;
  firstViewedAt: Date | null;
  submittedAt: Date;
  createdAt: Date;
  attachments: DashboardInquiryAttachment[];
  notes: DashboardInquiryNote[];
  activities: DashboardInquiryActivity[];
  relatedQuotes: DashboardInquiryRelatedQuotes | null;
  submittedFieldSnapshot: InquirySubmittedFieldSnapshot | null;
};

/**
 * Cheap core of the inquiry detail: the inquiry row with its intake form.
 * Paints the header, overview, and sidebars while the attachments, notes,
 * activity, and related-quote feeds stream separately.
 */
export type DashboardInquiryDetailCore = Omit<
  DashboardInquiryDetail,
  "attachments" | "notes" | "activities" | "relatedQuotes"
>;

export type InquiryListFilters = {
  q?: string;
  view: InquiryRecordView;
  status: InquiryStatusFilterValue;
  form: string;
  source: InquirySourceFilterValue;
  sort: "newest" | "oldest";
  escalated: boolean;
  unread: boolean;
  page: number;
};

export type InquiryListQueryFilters = Omit<InquiryListFilters, "page">;

export type ServiceSummary = {
  id: string;
  name: string;
  slug: string;
  businessType: BusinessType;
  isDefault: boolean;
  publicInquiryEnabled: boolean;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type InquiryEditorService = {
  id: string;
  name: string;
  slug: string;
  businessType: BusinessType;
  isDefault: boolean;
  publicInquiryEnabled: boolean;
  inquiryFormConfig: InquiryFormConfig;
};

export type InquiryNoteFieldErrors = Partial<Record<"body", string[] | undefined>>;
export type InquiryStatusFieldErrors = Partial<
  Record<"status", string[] | undefined>
>;

export type InquiryNoteActionState = {
  error?: string;
  success?: string;
  fieldErrors?: InquiryNoteFieldErrors;
};

export type InquiryStatusActionState = {
  error?: string;
  success?: string;
  fieldErrors?: InquiryStatusFieldErrors;
};

export type InquiryRecordActionState = {
  error?: string;
  success?: string;
};

export type PublicInquiryBusiness = {
  id: string;
  name: string;
  slug: string;
  plan: plan;
  businessType: BusinessType;
  shortDescription: string | null;
  logoUrl: string | null;
  form: {
    id: string;
    name: string;
    slug: string;
    businessType: BusinessType;
    isDefault: boolean;
    publicInquiryEnabled: boolean;
  };
  inquiryFormConfig: InquiryFormConfig;
  inquiryPageConfig: InquiryPageConfig;
};

export type PublicInquiryFieldErrors = Partial<
  Record<string, string[] | undefined>
>;

export type PublicInquiryFormState = {
  error?: string;
  success?: string;
  fieldErrors?: PublicInquiryFieldErrors;
  inquiryId?: string;
};

export type ManualInquiryActionState = {
  error?: string;
  fieldErrors?: PublicInquiryFieldErrors;
};

export type InquiryBulkActionState = {
  success?: string;
  error?: string;
  affected?: number;
  skipped?: number;
};
