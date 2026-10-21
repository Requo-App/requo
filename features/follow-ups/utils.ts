import type { StatusTone } from "@/components/shared/status-badge";
import { newEntityId } from "@/lib/ids";
import type {
  FollowUpCategory,
  FollowUpChannel,
  FollowUpDueBucket,
  FollowUpRecurrence,
  FollowUpSendMode,
  FollowUpStatus,
  FollowUpTerminationCondition,
} from "@/features/follow-ups/types";

export const followUpStatusLabels: Record<FollowUpStatus, string> = {
  pending: "To do",
  completed: "Done",
  skipped: "Dismissed",
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

/**
 * Offset (in ms) between UTC and the given IANA timezone at `instant`.
 *
 * Positive for zones east of Greenwich (`Asia/Tokyo` → +9h), negative west.
 */
function getTimezoneOffsetMs(instant: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant);

  const values: Partial<Record<Intl.DateTimeFormatPartTypes, number>> = {};

  for (const part of parts) {
    if (part.type === "literal") {
      continue;
    }

    const numeric = Number(part.value);

    if (!Number.isNaN(numeric)) {
      values[part.type] = numeric;
    }
  }

  // Some ICU builds render midnight as hour 24.
  const hour = values.hour === 24 ? 0 : (values.hour ?? 0);
  const asUtc = Date.UTC(
    values.year ?? 1970,
    (values.month ?? 1) - 1,
    values.day ?? 1,
    hour,
    values.minute ?? 0,
    values.second ?? 0,
  );

  return asUtc - instant.getTime();
}

/** Local wall-clock time of `instant` in `timezone`, read back as a UTC ms value. */
function getWallClockMs(instant: Date, timezone: string): number {
  const offset = getTimezoneOffsetMs(instant, timezone);

  return instant.getTime() + offset;
}

/**
 * Convert a business-local calendar date + wall-clock time into the UTC
 * instant it refers to.
 *
 * The naive "9 AM local = 9:00 − offset" shortcut breaks for every zone east
 * of UTC+9: the local morning falls on the *previous* UTC day, so the stored
 * instant lands on the wrong calendar date. This resolves the wall clock
 * against the zone instead, and handles DST gaps (spring forward) and
 * overlaps (fall back) the way `ZonedDateTime` does.
 */
export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timezone: string,
): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);

  if (
    !year ||
    !month ||
    !day ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return new Date(`${date}T12:00:00.000Z`);
  }

  const targetWallMs = Date.UTC(year, month - 1, day, hour, minute, 0);

  let offsets: number[];

  try {
    // Probe around the target so a DST transition inside the probe window
    // still yields the offset that actually applies.
    const probes = [
      targetWallMs,
      targetWallMs - 12 * 60 * 60 * 1000,
      targetWallMs + 12 * 60 * 60 * 1000,
    ];

    offsets = [...new Set(probes.map((probe) => getTimezoneOffsetMs(new Date(probe), timezone)))];
  } catch {
    return new Date(`${date}T12:00:00.000Z`);
  }

  for (const offset of offsets) {
    const candidate = new Date(targetWallMs - offset);

    if (getWallClockMs(candidate, timezone) === targetWallMs) {
      return candidate;
    }
  }

  // The wall clock does not exist (DST spring-forward gap). Keep the earliest
  // candidate so the follow-up lands on the same calendar day.
  return new Date(targetWallMs - offsets[0]);
}

/**
 * The UTC instant of 00:00 on the given calendar date in the business
 * timezone. Used as the inclusive/exclusive bound for "today" and "tomorrow"
 * in list and overview queries.
 */
export function getBusinessDayStartInstant(
  date: string,
  timezone: string,
): Date {
  return zonedDateTimeToUtc(date, "00:00", timezone);
}

export function getQuickFollowUpDueDate(
  option: "tomorrow" | "3d" | "7d",
  now = new Date(),
  timezone?: string,
) {
  const today = timezone
    ? getTodayDateStringInTimezone(timezone, now)
    : getTodayUtcDateString(now);

  switch (option) {
    case "tomorrow":
      return addCalendarDays(today, 1);
    case "7d":
      return addCalendarDays(today, 7);
    case "3d":
    default:
      return addCalendarDays(today, 3);
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
    return zonedDateTimeToUtc(value, "09:00", timezone);
  } catch {
    return new Date(`${value}T12:00:00.000Z`);
  }
}

/**
 * Parse a business-local date + time (`YYYY-MM-DDTHH:mm`) into a UTC instant.
 *
 * The browser sends a naive wall-clock string, so it must be read in the
 * business timezone — parsing it in the server timezone would shift the
 * snooze by the offset between the two.
 */
export function parseFollowUpDateTimeInput(
  value: string,
  timezone?: string,
): Date {
  const match = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/.exec(value.trim());

  if (!match) {
    const parsed = new Date(value);

    return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  }

  const [, date, hour, minute] = match;

  if (!timezone) {
    return new Date(`${date}T${hour}:${minute}:00.000Z`);
  }

  return zonedDateTimeToUtc(date, `${hour}:${minute}`, timezone);
}

/**
 * Calendar date of an instant, rendered in the given timezone. Without a
 * timezone the UTC date is used, which keeps server and client output
 * identical for records that carry no business context.
 */
export function getDateInputValue(value: Date | string, timezone?: string) {
  if (typeof value === "string") {
    return value.slice(0, 10);
  }

  if (timezone) {
    return getLocalDateString(value, timezone);
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

  // Compare business-local calendar dates: a follow-up due "today" in Sydney
  // must not read as overdue because its UTC date already rolled over.
  const dueDate = getDateInputValue(input.dueAt, timezone);
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

/**
 * Normalize the stored category. The column is free text, so anything that
 * is not the known "post win" value is treated as a sales follow-up.
 */
export function getFollowUpCategory(value: string | null | undefined): FollowUpCategory {
  return value === "post_win" ? "post_win" : "sales";
}

export function getFollowUpDueBucketLabel(bucket: FollowUpDueBucket) {
  return followUpDueBucketLabels[bucket];
}

/**
 * Human-readable date for a follow-up instant.
 *
 * The business timezone is used when known so the rendered day matches the
 * day the owner picked. Rendering stays deterministic (a fixed IANA zone, not
 * the browser zone) so server and client markup match.
 */
export function formatFollowUpDate(value: Date | string, timezone?: string) {
  if (typeof value === "string") {
    // A bare `YYYY-MM-DD` string is a calendar date, not an instant, so it
    // is rendered in UTC. Converting it into the target zone first would
    // shift it a day backwards for every negative offset.
    const date = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);

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

  if (Number.isNaN(value.getTime())) {
    return "Set a date";
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
    timeZone: timezone || "UTC",
    year: "numeric",
  }).format(value);
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

/**
 * The next due date of a recurring follow-up.
 *
 * With a business timezone the step is taken in calendar days at the same
 * local wall clock, so a 9 AM follow-up stays at 9 AM across a DST change
 * instead of drifting an hour every time the clocks move.
 */
export function getNextRecurrenceDueDate(
  currentDueAt: Date,
  recurrence: Exclude<FollowUpRecurrence, "none">,
  timezone?: string,
): Date {
  const days = followUpRecurrenceDays[recurrence];

  if (!timezone) {
    return new Date(currentDueAt.getTime() + days * 24 * 60 * 60 * 1000);
  }

  const localDate = getLocalDateString(currentDueAt, timezone);
  const nextDate = addCalendarDays(localDate, days);

  // Rebuild the same wall-clock time on the new calendar date.
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(currentDueAt);

  const hour = parts.find((part) => part.type === "hour")?.value ?? "09";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";

  return zonedDateTimeToUtc(nextDate, `${hour}:${minute}`, timezone);
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
