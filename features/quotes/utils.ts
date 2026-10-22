import {
  Archive,
  Ban,
  CircleCheck,
  CircleX,
  Clock3,
  FileText,
  Send,
} from "lucide-react";

import type { StatusTone } from "@/components/shared/status-badge";
import type {
  AiQuoteMissingInfoItem,
  AiQuoteProductStatus,
  AiQuoteReadiness,
} from "@/features/quote-drafting/types";
import type {
  DashboardQuoteLibraryItem,
  DashboardQuoteDetailCore,
  DashboardQuoteItem,
  PublicQuoteView,
  QuoteEditorLineItemValue,
  QuoteInquiryPrefill,
  QuoteLibraryEntryKind,
  QuoteReminderKind,
  QuoteStatus,
} from "@/features/quotes/types";
import type { PlanTier } from "@/lib/plans/plans";
import { prefixedId } from "@/lib/ids";

/**
 * Server-side readiness for a quote that carries AI pricing provenance.
 *
 * The readiness string is never taken from the browser. It is recomputed from
 * the provenance the hydration step attached to each line, so the
 * "suggested pricing needs your confirmation" gate cannot be cleared by
 * editing the form or by posting a hand-crafted payload.
 *
 * A quote with no AI provenance at all is not an AI-drafted quote, so it
 * returns `null` and never blocks delivery.
 */
export function computeQuoteAiReadiness(input: {
  items: Array<{
    aiProductStatus?: AiQuoteProductStatus | null;
    aiEvidence?: { matchType?: "exact" | "suggested" | "none" | null } | null;
  }>;
  missingInfo?: AiQuoteMissingInfoItem[] | null;
}): AiQuoteReadiness | null {
  const { items, missingInfo } = input;

  const hasProvenance = items.some(
    (item) => item.aiProductStatus != null || item.aiEvidence != null,
  );

  if (!hasProvenance) {
    return null;
  }

  const hasUnpriced = items.some(
    (item) =>
      item.aiProductStatus === "unpriced" ||
      (item.aiProductStatus == null && item.aiEvidence?.matchType === "none"),
  );
  const hasSuggested = items.some(
    (item) =>
      item.aiProductStatus === "suggested" ||
      item.aiEvidence?.matchType === "suggested",
  );
  const hasCriticalQuestions =
    missingInfo?.some((item) => item.critical === true) ?? false;

  if (hasUnpriced) {
    return "scope_only";
  }

  if (hasSuggested || hasCriticalQuestions) {
    return "needs_confirmation";
  }

  return "ready";
}

export const quoteStatusLabels: Record<QuoteStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  revision_requested: "Revision requested",
  accepted: "Accepted",
  rejected: "Rejected",
  expired: "Expired",
  voided: "Voided",
};

/**
 * Semantic tone per status — the colour lives in `components/shared/status-badge`.
 *
 * Exhaustive `Record`, so adding a `QuoteStatus` member fails the typecheck
 * until a tone is chosen for it.
 */
export const quoteStatusTones: Record<QuoteStatus, StatusTone> = {
  draft: "progress",
  sent: "active",
  revision_requested: "warning",
  accepted: "success",
  rejected: "danger",
  expired: "attention",
  voided: "neutral",
};

export const quoteStatusIcons = {
  draft: FileText,
  sent: Send,
  revision_requested: Clock3,
  accepted: CircleCheck,
  rejected: CircleX,
  expired: Clock3,
  voided: Ban,
} as const;

export const quoteRecordStateLabels = {
  archived: "Archived",
} as const;

export const quoteRecordStateTones = {
  archived: "neutral",
} as const satisfies Record<"archived", StatusTone>;

export const quoteRecordStateIcons = {
  archived: Archive,
} as const;

export const quoteLibraryEntryKindLabels: Record<QuoteLibraryEntryKind, string> = {
  block: "Pricing block",
  package: "Service package",
  template: "Quote template",
};

export const quoteReminderLabels: Record<QuoteReminderKind, string> = {
  follow_up_due: "Follow up due",
  expiring_soon: "Expiring soon",
};

export const quoteReminderTones: Record<QuoteReminderKind, StatusTone> = {
  follow_up_due: "attention",
  expiring_soon: "warning",
};

export const quoteFollowUpReminderDays = 3;
export const quoteExpiringSoonReminderDays = 7;

export function getQuoteStatusLabel(status: QuoteStatus) {
  return quoteStatusLabels[status];
}

export function getQuoteLibraryEntryKindLabel(kind: QuoteLibraryEntryKind) {
  return quoteLibraryEntryKindLabels[kind];
}

export function getQuoteReminderLabel(kind: QuoteReminderKind) {
  return quoteReminderLabels[kind];
}

export const QUOTE_PUBLIC_TOKEN_LENGTH = 20;

const QUOTE_PUBLIC_TOKEN_ALPHABET =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";

export function createQuotePublicToken() {
  // 20 URL-safe chars (~120-bit entropy from a CSPRNG): unguessable in
  // practice, yet compact in the public /quote/[token] URL. Deliberately
  // opaque so it never resembles the sequential quoteNumber beside it.
  // 256 % 64 === 0, so the modulo mapping below is unbiased.
  const bytes = crypto.getRandomValues(
    new Uint8Array(QUOTE_PUBLIC_TOKEN_LENGTH),
  );
  let token = "";

  for (let i = 0; i < bytes.length; i++) {
    token += QUOTE_PUBLIC_TOKEN_ALPHABET[bytes[i] % 64];
  }

  return token;
}

export function getPublicQuoteUrl(token: string) {
  return `/quote/${token}`;
}

export function formatQuoteMoney(amountInCents: number, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amountInCents / 100);
}

export function formatQuoteDate(value: Date | string) {
  const date = typeof value === "string" ? new Date(`${value}T00:00:00`) : value;

  if (Number.isNaN(date.getTime())) {
    return "Set a date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatQuoteDateTime(value: Date) {
  if (Number.isNaN(value.getTime())) {
    return "Unavailable";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(value);
}

export function centsToMoneyInput(amountInCents: number) {
  if (!amountInCents) {
    return "";
  }

  return (amountInCents / 100).toFixed(2);
}

export function createQuoteEditorLineItemValue(
  value?: Partial<{
    id: string;
    description: string;
    quantity: string;
    unitPrice: string;
    aiReview: QuoteEditorLineItemValue["aiReview"];
    aiProductStatus: QuoteEditorLineItemValue["aiProductStatus"];
    aiProductLibraryEntryId: QuoteEditorLineItemValue["aiProductLibraryEntryId"];
    aiProductLibraryItemId: QuoteEditorLineItemValue["aiProductLibraryItemId"];
    aiEvidence: QuoteEditorLineItemValue["aiEvidence"];
  }>,
): QuoteEditorLineItemValue {
  return {
    id: value?.id ?? prefixedId("draft_item"),
    description: value?.description ?? "",
    quantity: value?.quantity ?? "1",
    unitPrice: value?.unitPrice ?? "",
    aiReview: value?.aiReview,
    aiProductStatus: value?.aiProductStatus,
    aiProductLibraryEntryId: value?.aiProductLibraryEntryId,
    aiProductLibraryItemId: value?.aiProductLibraryItemId,
    aiEvidence: value?.aiEvidence,
  };
}

export function createQuoteEditorLineItem(): QuoteEditorLineItemValue {
  return createQuoteEditorLineItemValue();
}

export function createQuoteEditorLineItemFromLibraryItem(
  item: Pick<DashboardQuoteLibraryItem, "description" | "quantity" | "unitPriceInCents">,
) {
  return createQuoteEditorLineItemValue({
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: centsToMoneyInput(item.unitPriceInCents),
  });
}

export function isQuoteEditorLineItemBlank(item: QuoteEditorLineItemValue) {
  const quantity = item.quantity.trim();

  return (
    item.description.trim() === "" &&
    item.unitPrice.trim() === "" &&
    (quantity === "" || quantity === "1")
  );
}

export function parseCurrencyInputToCents(value: string) {
  const normalized = value.trim().replace(/,/g, "");

  if (!normalized) {
    return 0;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return 0;
  }

  return Math.round(Number(normalized) * 100);
}

/**
 * Strict money parser for untrusted input. Returns `null` for anything that
 * is not a positive decimal amount with at most two decimals — unlike
 * `parseCurrencyInputToCents`, which folds bad input to `0` for display.
 */
export function parseQuoteMoneyAmountToCents(value: string): number | null {
  const normalized = value.trim().replace(/,/g, "");

  if (!normalized) {
    return 0;
  }

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.round(parsed * 100);
}

/**
 * Strict percentage parser for untrusted input. Returns `null` for anything
 * outside `0`–`100`, so the caller can reject the value instead of silently
 * treating it as zero.
 */
export function parseQuoteMoneyPercentage(value: string): number | null {
  const normalized = value.trim();

  if (!normalized) {
    return 0;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    return null;
  }

  return parsed;
}

export type QuoteMoneyInputType = "amount" | "percentage";

/**
 * Resolves the discount and tax amounts for a quote from the owner's raw
 * intent.
 *
 * The percentage → amount conversion lives here, on the server as well as in
 * the browser, so the persisted cents are always the ones the owner saw. The
 * server re-derives the amounts from the submitted intent rather than
 * trusting a total computed in the client.
 */
export function calculateQuoteDiscountAndTax(input: {
  subtotalInCents: number;
  discountValue: string;
  discountType: QuoteMoneyInputType;
  taxValue: string;
  taxType: QuoteMoneyInputType;
}) {
  const { subtotalInCents } = input;

  let parsedDiscount = 0;
  if (input.discountType === "percentage") {
    const percentage = Number.parseFloat(input.discountValue.trim());
    if (Number.isFinite(percentage) && percentage > 0) {
      parsedDiscount = Math.round((subtotalInCents * percentage) / 100);
    }
  } else {
    parsedDiscount = parseCurrencyInputToCents(input.discountValue);
  }

  const discountInCents = Math.min(subtotalInCents, parsedDiscount);
  const taxableAmount = subtotalInCents - discountInCents;

  let parsedTax = 0;
  if (input.taxType === "percentage") {
    const percentage = Number.parseFloat(input.taxValue.trim());
    if (Number.isFinite(percentage) && percentage > 0) {
      parsedTax = Math.round((taxableAmount * percentage) / 100);
    }
  } else {
    parsedTax = parseCurrencyInputToCents(input.taxValue);
  }

  const taxInCents = Math.max(0, parsedTax);

  return {
    discountInCents,
    taxInCents,
    totalInCents: subtotalInCents - discountInCents + taxInCents,
  };
}

/**
 * Parses the editor's quantity input the way the server does. A partially
 * numeric value such as `2abc` is rejected outright instead of being read as
 * `2`, so the live total never overstates what the server will accept.
 */
function parseEditorQuantity(value: string) {
  const normalized = value.trim();

  if (!/^\d+$/.test(normalized)) {
    return 0;
  }

  const parsed = Number.parseInt(normalized, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function calculateQuoteEditorTotals(
  items: QuoteEditorLineItemValue[],
  discountValue: string,
  discountType: QuoteMoneyInputType = "amount",
  taxValue: string = "",
  taxType: QuoteMoneyInputType = "amount",
) {
  const subtotalInCents = items.reduce((sum, item) => {
    return (
      sum +
      parseEditorQuantity(item.quantity) * parseCurrencyInputToCents(item.unitPrice)
    );
  }, 0);

  return {
    subtotalInCents,
    ...calculateQuoteDiscountAndTax({
      subtotalInCents,
      discountValue,
      discountType,
      taxValue,
      taxType,
    }),
  };
}

function normalizeQuoteValidityDays(validityDays?: number) {
  if (!Number.isFinite(validityDays)) {
    return 14;
  }

  return Math.min(365, Math.max(1, Math.trunc(validityDays as number)));
}

export function getDefaultQuoteValidityDate(validityDays = 14) {
  // The validity date is a UTC calendar date: adding the days in local time
  // and then formatting in UTC shifts the result by a day east of UTC.
  const days = normalizeQuoteValidityDays(validityDays);

  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function buildQuoteTitleFromInquiry(inquiry: QuoteInquiryPrefill) {
  return `${inquiry.subject ?? inquiry.customerName} quote`;
}

export function getQuoteEditorInitialValuesFromInquiry(
  inquiry: QuoteInquiryPrefill,
  options?: {
    defaultQuoteNotes?: string | null;
    defaultQuoteTerms?: string | null;
    defaultQuoteValidityDays?: number;
  },
) {
  return {
    title: buildQuoteTitleFromInquiry(inquiry),
    customerName: inquiry.customerName,
    customerEmail: inquiry.customerEmail,
    customerContactMethod: inquiry.customerContactMethod,
    customerContactHandle: inquiry.customerContactHandle,
    notes: options?.defaultQuoteNotes?.trim() ?? "",
    terms: options?.defaultQuoteTerms?.trim() ?? "",
    validUntil: getDefaultQuoteValidityDate(options?.defaultQuoteValidityDays),
    discount: "",
    discountType: "amount" as const,
    tax: "",
    taxType: "amount" as const,
    taxLabel: "",
    items: [createQuoteEditorLineItem()],
  };
}

/**
 * Seeds the editor from a quote.
 *
 * Reads only the quote's own fields plus its line items, so it accepts the
 * staged `getQuoteDetailCoreForBusiness` slice (core + items) as well as the
 * whole-record aggregate.
 */
export function getQuoteEditorInitialValuesFromDetail(
  quote: DashboardQuoteDetailCore & { items: DashboardQuoteItem[] },
) {
  return {
    title: quote.title,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail,
    customerContactMethod: quote.customerContactMethod,
    customerContactHandle: quote.customerContactHandle,
    notes: quote.notes ?? "",
    terms: quote.terms ?? "",
    validUntil: quote.validUntil,
    discount: centsToMoneyInput(quote.discountInCents),
    discountType: "amount" as const,
    tax: centsToMoneyInput(quote.taxInCents),
    // The quote stores an absolute tax amount, so the editor must not read it
    // back as a percentage — a percentage seed re-prices the tax against the
    // subtotal and inflates the total on the next save.
    taxType: "amount" as const,
    taxLabel: quote.taxLabel ?? "",
    items: quote.items.length
      ? quote.items.map((item) => ({
          id: item.id,
          description: item.description,
          quantity: String(item.quantity),
          unitPrice: centsToMoneyInput(item.unitPriceInCents),
        }))
      : [createQuoteEditorLineItem()],
  };
}

export function getTodayUtcDateString() {
  return new Date().toISOString().slice(0, 10);
}

export function isQuotePastValidityDate(validUntil: string) {
  return validUntil < getTodayUtcDateString();
}

export function getFutureUtcDateString(daysAhead: number) {
  return new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

export function getQuoteReminderKinds(input: {
  status: QuoteStatus;
  sentAt: Date | null;
  customerRespondedAt: Date | null;
  validUntil: string;
  now?: Date;
}) {
  if (input.status !== "sent" || input.customerRespondedAt) {
    return [] satisfies QuoteReminderKind[];
  }

  const now = input.now ?? new Date();
  const reminderKinds: QuoteReminderKind[] = [];
  const followUpDueAt = new Date(
    now.getTime() - quoteFollowUpReminderDays * 24 * 60 * 60 * 1000,
  );
  const expiringSoonCutoff = getFutureUtcDateString(quoteExpiringSoonReminderDays);
  const today = now.toISOString().slice(0, 10);

  if (input.sentAt && input.sentAt <= followUpDueAt) {
    reminderKinds.push("follow_up_due");
  }

  if (input.validUntil >= today && input.validUntil <= expiringSoonCutoff) {
    reminderKinds.push("expiring_soon");
  }

  return reminderKinds;
}

/* ---------------------------------------------------------------------------
 * Send channel helpers
 * --------------------------------------------------------------------------- */

import {
  AtSign,
  MessageCircle,
  MessageSquare,
  Phone,
  Smartphone,
  Link2,
} from "lucide-react";

import type { QuoteSendChannel } from "@/features/quotes/types";

export const quoteSendChannelLabels: Record<QuoteSendChannel, string> = {
  email: "Email",
  sms: "SMS",
  whatsapp: "WhatsApp",
  messenger: "Messenger",
  instagram: "Instagram",
  phone: "Phone",
  other: "Other",
};

export const quoteSendChannelIcons: Record<
  QuoteSendChannel,
  typeof AtSign
> = {
  email: AtSign,
  sms: Smartphone,
  whatsapp: MessageCircle,
  messenger: MessageSquare,
  instagram: AtSign,
  phone: Phone,
  other: Link2,
};

export function getSendChannelLabel(channel: QuoteSendChannel) {
  return quoteSendChannelLabels[channel];
}

export function getDefaultSendChannel(contactMethod: string): QuoteSendChannel {
  const normalized = contactMethod.toLowerCase().trim();

  if (normalized === "email") return "email";
  if (normalized === "sms" || normalized === "text") return "sms";
  if (normalized === "whatsapp") return "whatsapp";
  if (normalized === "messenger" || normalized === "facebook") return "messenger";
  if (normalized === "instagram") return "instagram";
  if (normalized === "phone" || normalized === "call") return "phone";

  return "other";
}

/* ---------------------------------------------------------------------------
 * Message templates
 * --------------------------------------------------------------------------- */

type MessageTemplateInput = {
  customerName: string;
  businessName: string;
  quoteLink: string;
};

export function generateQuoteChatMessage(input: MessageTemplateInput) {
  return `Hi ${input.customerName}, here's your quote from ${input.businessName}: ${input.quoteLink}`;
}

export function generateQuoteSmsMessage(input: MessageTemplateInput) {
  return `Hi ${input.customerName}, your quote from ${input.businessName} is ready: ${input.quoteLink}`;
}

export function generateQuoteEmailSubject(businessName: string) {
  return `Your quote from ${businessName}`;
}

export function generateQuoteEmailBody(input: MessageTemplateInput) {
  return `Hi ${input.customerName},

Here's your quote from ${input.businessName}:

${input.quoteLink}

Please review it when you have time. Let us know if you have any questions.

Thanks,
${input.businessName}`;
}

export function generateQuoteFollowUpMessage(input: MessageTemplateInput) {
  return `Hi ${input.customerName}, just following up on the quote we sent: ${input.quoteLink}

Let us know if you have any questions.`;
}

export function getChannelPrimaryAction(
  channel: QuoteSendChannel,
): { label: string; variant: "email" | "copy" } {
  switch (channel) {
    case "email":
      return { label: "Open in Email App", variant: "email" };
    case "sms":
      return { label: "Copy SMS Message", variant: "copy" };
    case "whatsapp":
      return { label: "Copy WhatsApp Message", variant: "copy" };
    case "messenger":
    case "instagram":
      return { label: "Copy Chat Message", variant: "copy" };
    case "phone":
      return { label: "Copy Quote Link", variant: "copy" };
    case "other":
    default:
      return { label: "Copy Quote Link", variant: "copy" };
  }
}

export function getChannelMessage(
  channel: QuoteSendChannel,
  input: MessageTemplateInput,
) {
  switch (channel) {
    case "email":
      return generateQuoteEmailBody(input);
    case "sms":
      return generateQuoteSmsMessage(input);
    case "whatsapp":
    case "messenger":
    case "instagram":
      return generateQuoteChatMessage(input);
    case "phone":
    case "other":
    default:
      return generateQuoteChatMessage(input);
  }
}

export function buildMailtoUrl(input: {
  to: string;
  subject: string;
  body: string;
}) {
  const params = new URLSearchParams();

  params.set("subject", input.subject);
  params.set("body", input.body);

  return `mailto:${encodeURIComponent(input.to)}?${params.toString()}`;
}

/* ---------------------------------------------------------------------------
 * Quote template utilities
 * --------------------------------------------------------------------------- */

export type QuoteTemplateData = {
  title: string;
  notes: string | null;
  terms: string | null;
  validityDays: number;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }>;
};

export type QuoteBusinessDefaults = {
  defaultQuoteNotes?: string | null;
  defaultQuoteTerms?: string | null;
  defaultQuoteValidityDays?: number;
};

/**
 * Transforms a quote library template entry into data ready
 * to apply to the quote editor form state.
 *
 * When a template field (notes, terms) is null/empty, falls through
 * to the business default instead of clearing the field.
 */
export function applyTemplateToQuoteForm(
  template: QuoteTemplateData,
  businessDefaults?: QuoteBusinessDefaults,
): {
  title: string;
  notes: string;
  terms: string;
  validUntil: string;
  items: Array<{
    id: string;
    description: string;
    quantity: number;
    unitPriceInCents: number;
    lineTotalInCents: number;
  }>;
} {
  const validUntil = new Date(
    Date.now() + template.validityDays * 24 * 60 * 60 * 1000,
  );

  return {
    title: template.title,
    notes: template.notes?.trim() || businessDefaults?.defaultQuoteNotes?.trim() || "",
    terms: template.terms?.trim() || businessDefaults?.defaultQuoteTerms?.trim() || "",
    validUntil: validUntil.toISOString().slice(0, 10),
    items: template.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity,
      unitPriceInCents: item.unitPriceInCents,
      lineTotalInCents: item.quantity * item.unitPriceInCents,
    })),
  };
}

/**
 * Map a dashboard quote row to the PublicQuoteView shape the customer-facing
 * renderers expect. Single home for the mapping previously copied into the
 * quote detail header region and the quote preview page.
 */
export function toPublicQuoteView({
  quote,
  business,
  businessContactEmail,
  token,
  publicViewedAt,
  items,
}: {
  quote: DashboardQuoteDetailCore;
  business: {
    id: string;
    name: string;
    slug: string;
    plan: PlanTier;
    logoStoragePath: string | null;
  };
  businessContactEmail: string | null;
  token: string;
  publicViewedAt: Date | null;
  items: DashboardQuoteItem[];
}): PublicQuoteView {
  return {
    id: quote.id,
    businessId: business.id,
    token,
    quoteNumber: quote.quoteNumber,
    title: quote.title,
    businessName: business.name,
    businessSlug: business.slug,
    businessPlan: business.plan,
    businessShortDescription: null,
    businessContactEmail,
    businessLogoStoragePath: business.logoStoragePath,
    customerName: quote.customerName,
    customerEmail: quote.customerEmail ?? null,
    customerContactMethod: quote.customerContactMethod ?? "",
    customerContactHandle: quote.customerContactHandle ?? "",
    currency: quote.currency,
    notes: quote.notes ?? null,
    terms: quote.terms ?? null,
    validUntil: quote.validUntil,
    version: quote.version,
    status: quote.status,
    subtotalInCents: quote.subtotalInCents,
    discountInCents: quote.discountInCents,
    taxInCents: quote.taxInCents,
    taxLabel: quote.taxLabel ?? null,
    totalInCents: quote.totalInCents,
    sentAt: quote.sentAt ?? null,
    acceptedAt: quote.acceptedAt ?? null,
    publicViewedAt,
    customerRespondedAt: quote.customerRespondedAt ?? null,
    customerResponseMessage: quote.customerResponseMessage ?? null,
    items,
  };
}
