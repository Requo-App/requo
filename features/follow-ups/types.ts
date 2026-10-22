import type { PlanTier } from "@/lib/plans/plans";

export const followUpStatuses = ["pending", "completed", "skipped"] as const;
export const followUpStatusFilterValues = ["all", ...followUpStatuses] as const;
export const followUpDueFilterValues = [
  "all",
  "overdue",
  "today",
  "upcoming",
] as const;
export const followUpSortValues = ["due_asc", "due_desc", "newest"] as const;
export const followUpChannels = [
  "email",
  "phone",
  "sms",
  "whatsapp",
  "messenger",
  "instagram",
  "other",
] as const;
export const followUpCategories = ["sales", "post_win"] as const;
export const followUpSendModes = ["manual", "automatic"] as const;
export const followUpRecurrences = [
  "none",
  "daily",
  "every_3_days",
  "weekly",
  "biweekly",
  "monthly",
] as const;

export const followUpTerminationConditions = ["count", "terminal_status"] as const;
export type FollowUpTerminationCondition = (typeof followUpTerminationConditions)[number];

export type FollowUpStatus = (typeof followUpStatuses)[number];
export type FollowUpStatusFilterValue =
  (typeof followUpStatusFilterValues)[number];
export type FollowUpDueFilterValue = (typeof followUpDueFilterValues)[number];
export type FollowUpSortValue = (typeof followUpSortValues)[number];
export type FollowUpChannel = (typeof followUpChannels)[number];
export type FollowUpCategory = (typeof followUpCategories)[number];
export type FollowUpSendMode = (typeof followUpSendModes)[number];
export type FollowUpRecurrence = (typeof followUpRecurrences)[number];

export type FollowUpRelatedKind = "inquiry" | "quote";
export type FollowUpDueBucket = "overdue" | "today" | "upcoming" | "done";

/**
 * Where a follow-up activity item came from. Storage remains split for now
 * (follow_ups rows vs quotes.autoFollowUp* columns); the UI composes both
 * through a unified read model (see getActiveAutoFollowUpSequencesForBusiness).
 */
export type FollowUpSource = "manual" | "system_suggested" | "automatic_sequence";

export type QuoteFollowUpContext = {
  status: string | null;
  totalInCents: number | null;
  currency: string | null;
  sentAt: Date | null;
  viewedAt: Date | null;
  respondedAt: Date | null;
};

export type FollowUpSequenceState = {
  enabled: boolean;
  isActive: boolean;
  isPaused: boolean;
  isComplete: boolean;
  attempts: number;
  maxAttempts: number;
  delayDays: number;
  lastSentAt: Date | null;
  nextSendAt: Date | null;
  stoppedAt: Date | null;
};

export type FollowUpListFilters = {
  q?: string;
  status: FollowUpStatusFilterValue;
  due: FollowUpDueFilterValue;
  sort: FollowUpSortValue;
  page: number;
};

export type FollowUpListQueryFilters = Omit<FollowUpListFilters, "page">;

export type FollowUpView = {
  id: string;
  businessId: string;
  /** IANA timezone of the owning business — due dates are read in it. */
  businessTimezone: string;
  /** Plan of the owning business — drives the automatic-send entitlement. */
  businessPlan: PlanTier;
  inquiryId: string | null;
  quoteId: string | null;
  assignedToUserId: string | null;
  createdByUserId: string | null;
  title: string;
  reason: string;
  category: FollowUpCategory;
  channel: FollowUpChannel;
  sendMode: FollowUpSendMode;
  recurrence: FollowUpRecurrence;
  recurrenceCount: number;
  recurrenceLimit: number | null;
  terminationCondition: FollowUpTerminationCondition | null;
  dueAt: Date;
  completedAt: Date | null;
  skippedAt: Date | null;
  snoozedUntil: Date | null;
  completionNote: string | null;
  status: FollowUpStatus;
  createdAt: Date;
  updatedAt: Date;
  dueBucket: FollowUpDueBucket;
  customerName: string;
  customerEmail: string | null;
  customerContactMethod: string | null;
  customerContactHandle: string | null;
  related: {
    kind: FollowUpRelatedKind;
    id: string;
    label: string;
  };
  quoteNumber: string | null;
  quoteTitle: string | null;
  quotePublicUrl: string | null;
  quoteViewedAt: Date | null;
  suggestedMessage: string;
  /** Which pipeline the item belongs to. Defaults to quote-first ordering. */
  source: FollowUpSource;
  /** Short "why contact them now" line (system reason template or custom reason). */
  whyNow: string | null;
  /** Primary next-step label, e.g. "Review and send", "Call", "Open quote". */
  nextActionLabel: string;
  /** Quote revenue/outcome context for quote-linked follow-ups. */
  quoteContext: QuoteFollowUpContext | null;
};

export type FollowUpOverviewData = {
  overdue: FollowUpView[];
  dueToday: FollowUpView[];
  upcoming: FollowUpView[];
  counts: {
    overdue: number;
    dueToday: number;
    upcoming: number;
  };
};

/**
 * One row in the unified Follow-ups business. Manual follow-ups carry their
 * FollowUpView; automatic email sequences surface as lightweight activity
 * items composed from quotes.autoFollowUp* columns (no follow_ups row).
 */
export type FollowUpActivityItem =
  | {
      kind: "follow_up";
      followUp: FollowUpView;
    }
  | {
      kind: "auto_sequence";
      quoteId: string;
      quoteNumber: string | null;
      quoteTitle: string | null;
      customerName: string;
      customerEmail: string | null;
      /** IANA timezone of the owning business — send dates are read in it. */
      businessTimezone: string;
      sequence: FollowUpSequenceState;
      quoteContext: QuoteFollowUpContext;
    };

export type FollowUpSummaryCounts = {
  needsAttention: number;
  dueToday: number;
  waiting: number;
  activeSequences: number;
  history: number;
};

export type FollowUpCreateFieldErrors = Partial<
  Record<"title" | "reason" | "channel" | "category" | "sendMode" | "dueDate" | "recurrence" | "recurrenceLimit" | "terminationCondition" | "assignedToUserId", string[] | undefined>
>;

export type FollowUpEditFieldErrors = Partial<
  Record<"title" | "reason" | "channel" | "category" | "sendMode" | "dueDate" | "recurrence" | "recurrenceLimit" | "terminationCondition", string[] | undefined>
>;

export type FollowUpRescheduleFieldErrors = Partial<
  Record<"dueDate", string[] | undefined>
>;

export type FollowUpReassignFieldErrors = Partial<
  Record<"assignedToUserId", string[] | undefined>
>;

export type FollowUpCreateActionState = {
  error?: string;
  success?: string;
  fieldErrors?: FollowUpCreateFieldErrors;
  followUpId?: string;
};

export type FollowUpEditActionState = {
  error?: string;
  success?: string;
  fieldErrors?: FollowUpEditFieldErrors;
};

export type FollowUpRecordActionState = {
  error?: string;
  success?: string;
};

export type FollowUpRescheduleActionState = {
  error?: string;
  success?: string;
  fieldErrors?: FollowUpRescheduleFieldErrors;
};

export type FollowUpReassignActionState = {
  error?: string;
  success?: string;
  fieldErrors?: FollowUpReassignFieldErrors;
};

export type FollowUpDeleteActionState = {
  error?: string;
  success?: string;
};

export type FollowUpSnoozeActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"snoozedUntil", string[] | undefined>>;
};

export type FollowUpBulkActionState = {
  error?: string;
  success?: string;
  affected?: number;
};

export type FollowUpCompleteActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Partial<Record<"completionNote", string[] | undefined>>;
};
