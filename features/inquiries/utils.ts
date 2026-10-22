import {
  Archive,
  CircleAlert,
  CircleDot,
  Clock3,
  FileText,
  Timer,
  Trophy,
} from "lucide-react";

import type { StatusTone } from "@/components/shared/status-badge";
import type {
  InquiryRecordState,
  InquirySourceValue,
  InquiryStatus,
} from "@/features/inquiries/types";
import {
  inquirySourceLabels,
  normalizeInquirySource,
} from "@/features/inquiries/types";
import {
  getInquiryContactHandleUrl,
  inquiryContactMethodLabels,
  inquiryContactMethods,
  type InquiryContactMethod,
} from "@/features/inquiries/form-config";

/**
 * Hard ceiling on how many inquiries a single bulk action may touch.
 *
 * Shared by the bulk actions (server), the bulk schema, and the list UI so
 * the limit the user is promised is the limit the server enforces.
 */
export const inquiryBulkSelectionLimit = 50;

export const inquiryStatusLabels: Record<InquiryStatus, string> = {
  new: "New",
  quoted: "Quoted",
  waiting: "Waiting",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
  overdue: "Overdue",
};

/**
 * Semantic tone per status — the colour lives in `components/shared/status-badge`.
 *
 * Exhaustive `Record`, so adding an `InquiryStatus` member fails the typecheck
 * until a tone is chosen for it.
 */
export const inquiryStatusTones: Record<InquiryStatus, StatusTone> = {
  new: "info",
  quoted: "highlight",
  waiting: "warning",
  won: "success",
  lost: "danger",
  archived: "neutral",
  overdue: "attention",
};

export const inquiryStatusIcons = {
  new: CircleDot,
  quoted: FileText,
  waiting: Clock3,
  won: Trophy,
  lost: CircleAlert,
  archived: Archive,
  overdue: Timer,
} as const;

export const inquiryRecordStateLabels: Record<
  Exclude<InquiryRecordState, "active">,
  string
> = {
  archived: "Archived",
};

export const inquiryRecordStateTones: Record<
  Exclude<InquiryRecordState, "active">,
  StatusTone
> = {
  archived: "neutral",
};

export const inquiryRecordStateIcons = {
  archived: Archive,
} as const;

const inquiryDateFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
});

const inquiryDateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function getInquiryStatusLabel(status: InquiryStatus) {
  return inquiryStatusLabels[status];
}

export function getInquiryRecordStateLabel(
  state: Exclude<InquiryRecordState, "active">,
) {
  return inquiryRecordStateLabels[state];
}

export function formatInquiryDate(value: Date | string) {
  // Date-only strings ("YYYY-MM-DD", e.g. requested deadlines) parse as UTC
  // midnight via `new Date`, which shifts the day in UTC-negative timezones.
  // Treat them as local midnight, mirroring `formatQuoteDate`.
  const date =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())
      ? new Date(`${value.trim()}T00:00:00`)
      : new Date(value);
  return inquiryDateFormatter.format(date);
}

export function formatInquiryDateTime(value: Date | string) {
  return inquiryDateTimeFormatter.format(new Date(value));
}

export function formatInquiryBudget(value: string | null) {
  return value?.trim() || "Not shared";
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns a human-readable channel label for a dashboard inquiry source.
 * Canonical values: Service Form / Agent / Manual / API.
 * Legacy values (public-inquiry-page, manual-dashboard, ai_agent, …) are
 * mapped forward; null/unknown renders as "Unknown".
 */
export function getInquirySourceLabel(source: string | null | undefined): string {
  const normalized: InquirySourceValue = normalizeInquirySource(source ?? null);
  return inquirySourceLabels[normalized];
}

export type CustomerContactInfo = {
  customerEmail?: string | null;
  customerContactMethod?: string | null;
  customerContactHandle?: string | null;
};

export function getCustomerContactEmail(contact: CustomerContactInfo) {
  const savedEmail = contact.customerEmail?.trim();

  if (savedEmail) {
    return savedEmail;
  }

  if (contact.customerContactMethod?.trim().toLowerCase() === "email") {
    return contact.customerContactHandle?.trim() || null;
  }

  return null;
}

export function shouldShowPreferredContactTile(contact: CustomerContactInfo) {
  const handle = contact.customerContactHandle?.trim();
  if (!handle || !contact.customerContactMethod) return false;

  const normalizedMethod = contact.customerContactMethod.trim().toLowerCase();
  if (normalizedMethod === "email") {
    // Hide when the handle is the same email already shown in the Email tile
    return handle.toLowerCase() !== (contact.customerEmail?.trim().toLowerCase() ?? "");
  }
  return true;
}

export function getContactMethodLabel(method: string | null) {
  const normalized = method?.trim().toLowerCase() ?? "";

  if (normalized in inquiryContactMethodLabels) {
    return inquiryContactMethodLabels[normalized as InquiryContactMethod];
  }

  return method?.trim() || "Contact details";
}

export function getContactHandleUrl(method: string | null, handle: string | null): string | null {
  const normalizedMethod = method?.trim().toLowerCase() ?? "";
  const trimmedHandle = handle?.trim() ?? "";
  if (!normalizedMethod || !trimmedHandle) return null;

  if (!inquiryContactMethods.includes(normalizedMethod as InquiryContactMethod)) {
    return null;
  }

  return getInquiryContactHandleUrl(
    normalizedMethod as InquiryContactMethod,
    trimmedHandle,
  );
}
