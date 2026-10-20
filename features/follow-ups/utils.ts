import type { StatusTone } from "@/components/shared/status-badge";
import { newEntityId } from "@/lib/ids";
import type {
  FollowUpChannel,
  FollowUpDueBucket,
  FollowUpDueFilterValue,
  FollowUpListFilters,
  FollowUpRecurrence,
  FollowUpSendMode,
  FollowUpSortValue,
  FollowUpStatus,
  FollowUpStatusFilterValue,
  FollowUpTerminationCondition,
} from "@/features/follow-ups/types";
import {
  followUpDueFilterValues,
  followUpSortValues,
  followUpStatusFilterValues,
} from "@/features/follow-ups/types";

export const followUpStatusLabels: Record<FollowUpStatus, string> = {
  pending: "To do",
  completed: "Done",
  skipped: "Dismissed",
};

/** Legacy task-only labels, kept for admin/audit surfaces that need them. */
export const followUpLifecycleLabels: Record<FollowUpStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  skipped: "Skipped",
};

export const followUpChannelLabels: Record<FollowUpChannel, string> = {
  email: "Email",
  phone: "Phone",
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  other: "Other",
};

export const followUpDueBucketLabels: Record<FollowUpDueBucket, string> = {
  overdue: "Overdue",
  today: "Due today",
  upcoming: "Upcoming",
  done: "Done",
};

export const followUpSendModeLabels: Record<FollowUpSendMode, string> = {
  manual: "Manual",
  automatic: "Automated",
};

/**
 * Semantic tone per follow-up state — the colour lives in
 * `components/shared/status-badge`. Exhaustive `Record`s, so adding a member to
 * either union fails the typecheck until a tone is chosen for it.
 */
export const followUpStatusTones: Record<FollowUpStatus, StatusTone> = {
  pending: "info",
  completed: "success",
  skipped: "neutral",
};

/**
 * `upcoming` and `done` are both deliberately quiet: neither needs the owner's
 * attention, so they stay neutral and let `today` / `overdue` stand out.
 */
export const followUpDueBucketTones: Record<FollowUpDueBucket, StatusTone> = {
  overdue: "danger",
  today: "warning",
  upcoming: "neutral",
  done: "neutral",
};

export const followUpSendModeTones: Record<FollowUpSendMode, StatusTone> = {
  manual: "neutral",
  automatic: "info",
};

export function getFollowUpSendModeLabel(sendMode: FollowUpSendMode) {
  return followUpSendModeLabels[sendMode];
}

export const followUpRecurrenceLabels: Record<FollowUpRecurrence, string> = {
  none: "No repeat",
  daily: "Every day",
  every_3_days: "Every 3 days",
  weekly: "Every week",
  biweekly: "Every 2 weeks",
  monthly: "Every month",
};

export const followUpRecurrenceDays: Record<Exclude<FollowUpRecurrence, "none">, number> = {
  daily: 1,
  every_3_days: 3,
  weekly: 7,
  biweekly: 14,
  monthly: 30,
};

export const followUpTerminationConditionLabels: Record<FollowUpTerminationCondition, string> = {
  count: "Maximum occurrences",
  terminal_status: "Until linked item reaches terminal status",
};

export const followUpDismissalReasonLabels: Record<
  import("@/features/follow-ups/types").FollowUpDismissalReason,
  string
> = {
  not_relevant: "Not relevant anymore",
  already_responded: "Customer already responded",
  duplicate: "Duplicate",
  lost_opportunity: "Lost opportunity",
  revisit_later: "Will revisit later",
  other: "Other",
};

export const followUpOutcomeLabels: Record<
  import("@/features/follow-ups/types").FollowUpOutcomeType,
  string
> = {
  contacted: "Sent message",
  replied: "Customer replied",
  accepted: "Quote accepted",
  rejected: "Quote declined",
  dismissed: "Dismissed",
  no_answer: "No answer",
  other: "Other outcome",
};

/** Quick outcome choices offered after a customer-touch action. */
export const followUpOutcomeChoices = [
  "contacted",
  "replied",
  "accepted",
  "no_answer",
  "dismissed",
  "other",
] as const satisfies readonly import("@/features/follow-ups/types").FollowUpOutcomeType[];

export function createFollowUpId() {
  return newEntityId();
}

export function createActivityId() {
  return newEntityId();
}

export function getTodayUtcDateString(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

/**
 * Get today's date string in a specific timezone (IANA format).
 * Falls back to UTC if the timezone is invalid.
 */
export function getTodayDateStringInTimezone(timezone: string, now = new Date()) {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    return formatter.format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/** Add calendar days to a YYYY-MM-DD date, independent of timezone and DST. */
export function addCalendarDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function getFutureUtcDateString(daysAhead: number, now = new Date()) {
  return new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function getQuickFollowUpDueDate(
  option: "tomorrow" | "3d" | "7d",
  now = new Date(),
) {
  switch (option) {
    case "tomorrow":
      return getFutureUtcDateString(1, now);
    case "7d":
      return getFutureUtcDateString(7, now);
    case "3d":
    default:
      return getFutureUtcDateString(3, now);
  }
}

/**
 * Parse a date input string (YYYY-MM-DD) into a Date anchored at 9 AM
 * in the given business timezone. Falls back to noon UTC if no timezone provided.
 */
export function parseFollowUpDueDateInput(value: string, timezone?: string) {
  if (!timezone) {
    return new Date(`${value}T12:00:00.000Z`);
  }

  try {
    // Create a date at 9 AM in the business timezone
    // We use a trick: construct the date string and find the UTC offset
    const targetLocal = new Date(`${value}T09:00:00`);
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      timeZoneName: "shortOffset",
    });
    const parts = formatter.formatToParts(targetLocal);
    const offsetPart = parts.find((p) => p.type === "timeZoneName")?.value ?? "";

    // Parse offset like "GMT-5" or "GMT+5:30"
    const offsetMatch = offsetPart.match(/GMT([+-]?)(\d{1,2})(?::(\d{2}))?/);

    if (!offsetMatch) {
      return new Date(`${value}T12:00:00.000Z`);
    }

    const sign = offsetMatch[1] === "-" ? -1 : 1;
    const hours = Number.parseInt(offsetMatch[2], 10);
    const minutes = Number.parseInt(offsetMatch[3] || "0", 10);
    const totalOffsetMinutes = sign * (hours * 60 + minutes);

    // 9 AM local = 9:00 - offset in UTC
    const utcHour = 9 * 60 - totalOffsetMinutes;
    const utcHours = Math.floor(utcHour / 60);
    const utcMinutes = utcHour % 60;

    const h = String(((utcHours % 24) + 24) % 24).padStart(2, "0");
    const m = String(Math.abs(utcMinutes)).padStart(2, "0");

    return new Date(`${value}T${h}:${m}:00.000Z`);
  } catch {
    return new Date(`${value}T12:00:00.000Z`);
  }
}

export function getDateInputValue(value: Date | string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  return value.toISOString().slice(0, 10);
}

export function getFollowUpDueBucket(
  input: {
    status: FollowUpStatus;
    dueAt: Date;
  },
  now = new Date(),
  timezone?: string,
): FollowUpDueBucket {
  if (input.status !== "pending") {
    return "done";
  }

  const dueDate = getDateInputValue(input.dueAt);
  const today = timezone
    ? getTodayDateStringInTimezone(timezone, now)
    : getTodayUtcDateString(now);

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "today";
  }

  return "upcoming";
}

export function getFollowUpStatusLabel(status: FollowUpStatus) {
  return followUpStatusLabels[status];
}

export function getFollowUpChannelLabel(channel: FollowUpChannel) {
  return followUpChannelLabels[channel];
}

export function getFollowUpDueBucketLabel(bucket: FollowUpDueBucket) {
  return followUpDueBucketLabels[bucket];
}

export function formatFollowUpDate(value: Date | string) {
  const date =
    typeof value === "string"
      ? new Date(`${value.slice(0, 10)}T00:00:00.000Z`)
      : value;

  if (Number.isNaN(date.getTime())) {
    return "Set a date";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(date);
}

export function getDefaultFollowUpChannel(contactMethod?: string | null) {
  const normalized = contactMethod?.toLowerCase().trim();

  if (normalized === "email") {
    return "email" satisfies FollowUpChannel;
  }

  if (normalized === "phone" || normalized === "call") {
    return "phone" satisfies FollowUpChannel;
  }

  if (normalized === "sms" || normalized === "text") {
    return "sms" satisfies FollowUpChannel;
  }

  if (normalized === "whatsapp") {
    return "whatsapp" satisfies FollowUpChannel;
  }

  if (normalized === "messenger" || normalized === "facebook") {
    return "messenger" satisfies FollowUpChannel;
  }

  if (normalized === "instagram") {
    return "instagram" satisfies FollowUpChannel;
  }

  return "other" satisfies FollowUpChannel;
}

export function buildFollowUpSuggestedMessage(input: {
  kind: "inquiry" | "quote";
  businessName: string;
  customerName: string;
  quoteUrl?: string | null;
  quoteViewedAt?: Date | null;
}) {
  const customerName = input.customerName.trim() || "there";

  if (input.kind === "inquiry") {
    return `Hi ${customerName}, just following up on your inquiry with ${input.businessName}. Could you send any missing details when you have time?`;
  }

  if (input.quoteViewedAt) {
    const suffix = input.quoteUrl ? ` ${input.quoteUrl}` : "";

    return `Hi ${customerName}, I saw you had a chance to view the quote. Let us know if you have any questions or would like to proceed.${suffix}`;
  }

  if (input.quoteUrl) {
    return `Hi ${customerName}, just following up on the quote we sent: ${input.quoteUrl}. Let us know if you have any questions.`;
  }

  return `Hi ${customerName}, just following up on the quote we sent. Let us know if you have any questions.`;
}

export function getNextRecurrenceDueDate(
  currentDueAt: Date,
  recurrence: Exclude<FollowUpRecurrence, "none">,
): Date {
  const days = followUpRecurrenceDays[recurrence];
  const next = new Date(currentDueAt.getTime() + days * 24 * 60 * 60 * 1000);

  return next;
}

export function shouldRecur(input: {
  recurrence: FollowUpRecurrence;
  recurrenceCount: number;
  recurrenceLimit: number | null;
}): boolean {
  if (input.recurrence === "none") {
    return false;
  }

  if (input.recurrenceLimit !== null && input.recurrenceCount >= input.recurrenceLimit) {
    return false;
  }

  return true;
}

export function getFollowUpRecurrenceLabel(recurrence: FollowUpRecurrence) {
  return followUpRecurrenceLabels[recurrence];
}

/**
 * Compute due bucket using business timezone instead of UTC.
 */
export function getFollowUpDueBucketWithTimezone(
  input: {
    status: FollowUpStatus;
    dueAt: Date;
  },
  timezone: string,
  now = new Date(),
): FollowUpDueBucket {
  if (input.status !== "pending") {
    return "done";
  }

  const dueDate = getDateInputValue(input.dueAt);
  const today = getLocalDateString(now, timezone);

  if (dueDate < today) {
    return "overdue";
  }

  if (dueDate === today) {
    return "today";
  }

  return "upcoming";
}

/**
 * Get today's date string in the given IANA timezone.
 */
export function getLocalDateString(now: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    return formatter.format(now);
  } catch {
    // Fallback to UTC if timezone is invalid
    return getTodayUtcDateString(now);
  }
}

function daysBetween(from: Date, to: Date) {
  const ms = to.getTime() - from.getTime();

  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)));
}

/**
 * Short system reason explaining why a quote follow-up matters now.
 * Custom manual reasons are shown above this context in the UI; this line
 * answers "what happened last / why contact them now" at a glance.
 */
export function buildQuoteFollowUpWhyNow(input: {
  dueAt: Date;
  dueBucket: FollowUpDueBucket;
  quoteStatus?: string | null;
  sentAt?: Date | null;
  viewedAt?: Date | null;
  respondedAt?: Date | null;
  now?: Date;
}): string | null {
  const now = input.now ?? new Date();

  if (input.respondedAt) {
    return "Customer responded — review and close the loop.";
  }

  if (input.quoteStatus === "revision_requested") {
    return "Customer requested a revision.";
  }

  if (input.viewedAt) {
    const days = daysBetween(input.viewedAt, now);

    return days <= 0
      ? "Viewed today, no response yet."
      : `Viewed ${days} day${days === 1 ? "" : "s"} ago, no response.`;
  }

  if (input.sentAt) {
    const days = daysBetween(input.sentAt, now);

    if (days <= 0) {
      return "Quote sent today, awaiting a first view.";
    }

    return `Quote sent ${days} day${days === 1 ? "" : "s"} ago, not viewed.`;
  }

  if (input.dueBucket === "overdue") {
    const days = daysBetween(input.dueAt, now);

    return days <= 0
      ? "Follow-up is overdue."
      : `Follow-up overdue by ${days} day${days === 1 ? "" : "s"}.`;
  }

  return null;
}

/**
 * Primary next-step label for a follow-up row. Email-capable rows lead with
 * "Review and send"; phone rows lead with "Call"; everything else opens the
 * linked record.
 */
export function getFollowUpNextActionLabel(input: {
  channel: FollowUpChannel;
  relatedKind: "inquiry" | "quote";
}): string {
  if (input.channel === "email") {
    return "Review and send";
  }

  if (input.channel === "phone") {
    return "Call";
  }

  return input.relatedKind === "quote" ? "Open quote" : "Open inquiry";
}

/** Quote-linked items sort before inquiry/post-win work (quote-first queue). */
export function compareQuoteFirst(
  left: { quoteId: string | null; dueAt: Date },
  right: { quoteId: string | null; dueAt: Date },
): number {
  const leftIsQuote = left.quoteId ? 0 : 1;
  const rightIsQuote = right.quoteId ? 0 : 1;

  if (leftIsQuote !== rightIsQuote) {
    return leftIsQuote - rightIsQuote;
  }

  return left.dueAt.getTime() - right.dueAt.getTime();
}

/** Nullable whole-unit money for quote-linked follow-up rows. */
export function formatQuoteAmount(
  totalInCents: number | null | undefined,
  currency: string | null,
): string | null {
  if (totalInCents === null || totalInCents === undefined) {
    return null;
  }

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: currency || "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(totalInCents / 100);
  } catch {
    return `${(totalInCents / 100).toFixed(0)}`;
  }
}

/**
 * Parse the follow-up list view's URL searchParams. Defaults to the
 * unfiltered list ("all" everywhere, page 1). Single home for the parser
 * previously inline in the follow-ups page.
 */
export function parseFollowUpListFilters(
  searchParams: Record<string, string | string[] | undefined>,
): FollowUpListFilters {
  const rawStatus = typeof searchParams.status === "string" ? searchParams.status : "all";
  const rawDue = typeof searchParams.due === "string" ? searchParams.due : "all";
  const rawSort = typeof searchParams.sort === "string" ? searchParams.sort : "due_asc";
  const rawQ = typeof searchParams.q === "string" ? searchParams.q : "";
  const rawPage = typeof searchParams.page === "string" ? Number(searchParams.page) : 1;

  const status: FollowUpStatusFilterValue = (followUpStatusFilterValues as readonly string[]).includes(rawStatus)
    ? (rawStatus as FollowUpStatusFilterValue)
    : "all";
  const due: FollowUpDueFilterValue = (followUpDueFilterValues as readonly string[]).includes(rawDue)
    ? (rawDue as FollowUpDueFilterValue)
    : "all";
  const sort: FollowUpSortValue = (followUpSortValues as readonly string[]).includes(rawSort)
    ? (rawSort as FollowUpSortValue)
    : "due_asc";

  return { status, due, sort, q: rawQ, page: Math.max(1, rawPage) };
}
