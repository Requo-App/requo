export const activeBusinessSlugCookieName = "requo-active-business";

const ACTIVE_BUSINESS_SLUG_PATTERN = /^[a-z0-9-]{1,120}$/;

export function isValidActiveBusinessSlug(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ACTIVE_BUSINESS_SLUG_PATTERN.test(value) &&
    value !== "-" &&
    !value.startsWith("-") &&
    !value.endsWith("-")
  );
}

export function getActiveBusinessCookieAttributes(): {
  httpOnly: true;
  path: "/";
  sameSite: "lax";
  secure: boolean;
} {
  return {
    httpOnly: true,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  };
}

export const homePath = "/home";
export const newBusinessPath = "/new";

export type BusinessSettingsSection =
  | "general"
  | "notifications"
  | "profile"
  | "security"
  | "quote"
  | "email"
  | "support"
  | "integrations"
  | "billing"
  | "audit-log"
  | "agent"
  | "ai"
  | "members"
  | "workflow";

export function getBusinessPath(slug: string) {
  return `/${slug}`;
}

export function getBusinessHomePath(slug: string) {
  return `${getBusinessPath(slug)}/home`;
}

export function getBusinessAnalyticsPath(slug: string) {
  return `${getBusinessPath(slug)}/analytics`;
}

export function getBusinessInquiriesPath(slug: string) {
  return `${getBusinessPath(slug)}/inquiries`;
}

export function getBusinessNewInquiryPath(
  slug: string,
  formSlug?: string | null,
) {
  const basePath = `${getBusinessInquiriesPath(slug)}/new`;

  if (!formSlug) {
    return basePath;
  }

  const searchParams = new URLSearchParams({
    form: formSlug,
  });

  return `${basePath}?${searchParams.toString()}`;
}

export function getBusinessInquiryPath(slug: string, inquiryId: string) {
  return `${getBusinessInquiriesPath(slug)}/${inquiryId}`;
}

export function getBusinessQuotesPath(slug: string) {
  return `${getBusinessPath(slug)}/quotes`;
}


export function getBusinessFollowUpsPath(slug: string) {
  return `${getBusinessPath(slug)}/follow-ups`;
}

export function getBusinessFollowUpPath(slug: string, followUpId: string) {
  return `${getBusinessFollowUpsPath(slug)}/${followUpId}`;
}

export function getBusinessNewQuotePath(
  slug: string,
  inquiryId?: string | null,
) {
  const basePath = `${getBusinessQuotesPath(slug)}/new`;

  if (!inquiryId) {
    return basePath;
  }

  const searchParams = new URLSearchParams({
    inquiryId,
  });

  return `${basePath}?${searchParams.toString()}`;
}

export function getBusinessQuotePath(slug: string, quoteId: string) {
  return `${getBusinessQuotesPath(slug)}/${quoteId}`;
}

export function getBusinessInvoicesPath(slug: string) {
  return `${getBusinessPath(slug)}/invoices`;
}

export function getBusinessInvoicePath(slug: string, invoiceId: string) {
  return `${getBusinessInvoicesPath(slug)}/${invoiceId}`;
}

export function getBusinessNewInvoicePath(slug: string, quoteId?: string | null) {
  const basePath = `${getBusinessInvoicesPath(slug)}/new`;
  if (!quoteId) return basePath;
  return `${basePath}?${new URLSearchParams({ quoteId }).toString()}`;
}

export function getBusinessInvoiceEditPath(slug: string, invoiceId: string) {
  return `${getBusinessInvoicesPath(slug)}/${invoiceId}/edit`;
}

export function getBusinessPaymentsPath(slug: string) {
  return `${getBusinessPath(slug)}/payments`;
}

export function getBusinessPaymentPath(slug: string, paymentId: string) {
  return `${getBusinessPaymentsPath(slug)}/${paymentId}`;
}

export function getBusinessPaymentReceiptPath(slug: string, paymentId: string) {
  return `${getBusinessPaymentPath(slug, paymentId)}/receipt`;
}

export function getBusinessPaymentReceiptExportPath(slug: string, paymentId: string) {
  return `/api/business/${slug}/payments/${paymentId}/receipt`;
}

export function getBusinessInvoicePrintPath(slug: string, invoiceId: string) {
  return `${getBusinessPath(slug)}/print/invoices/${invoiceId}`;
}

export function getBusinessInvoiceExportPath(slug: string, invoiceId: string, format?: "pdf" | "png") {
  const basePath = `/api/business/${slug}/invoices/${invoiceId}/export`;
  if (!format || format === "pdf") return basePath;
  return `${basePath}?${new URLSearchParams({ format }).toString()}`;
}

export function getBusinessInvoicesExportPath(slug: string) {
  return `/api/business/${slug}/invoices/export`;
}

export function getBusinessQuotePreviewPath(slug: string, quoteId: string) {
  return `${getBusinessQuotesPath(slug)}/${quoteId}/preview`;
}

export function getBusinessQuotePrintPath(slug: string, quoteId: string) {
  return `${getBusinessPath(slug)}/print/quotes/${quoteId}`;
}

export function getBusinessInquiryPrintPath(slug: string, inquiryId: string) {
  return `${getBusinessPath(slug)}/print/inquiries/${inquiryId}`;
}

export function getBusinessQuotesExportPath(slug: string) {
  return `/api/business/${slug}/quotes/export`;
}

export function getBusinessQuoteExportPath(
  slug: string,
  quoteId: string,
  format?: "pdf" | "png",
) {
  const basePath = `/api/business/${slug}/quotes/${quoteId}/export`;

  if (!format || format === "pdf") {
    return basePath;
  }

  const searchParams = new URLSearchParams({
    format,
  });

  return `${basePath}?${searchParams.toString()}`;
}

export function getBusinessQuotePdfExportPath(slug: string, quoteId: string) {
  return getBusinessQuoteExportPath(slug, quoteId, "pdf");
}

export function getBusinessInquiriesExportPath(slug: string) {
  return `/api/business/${slug}/inquiries/export`;
}

export function getBusinessInquiryExportPath(
  slug: string,
  inquiryId: string,
  format?: "pdf" | "png",
) {
  const basePath = `/api/business/${slug}/inquiries/${inquiryId}/export`;

  if (!format || format === "pdf") {
    return basePath;
  }

  const searchParams = new URLSearchParams({
    format,
  });

  return `${basePath}?${searchParams.toString()}`;
}

export function getBusinessInquiryPdfExportPath(slug: string, inquiryId: string) {
  return getBusinessInquiryExportPath(slug, inquiryId, "pdf");
}

export function getBusinessSettingsPath(
  slug: string,
  section?: BusinessSettingsSection,
) {
  const basePath = `${getBusinessPath(slug)}/settings`;

  return section ? `${basePath}/${section}` : basePath;
}

export function getBusinessAiSettingsPath(slug: string) {
  return `${getBusinessPath(slug)}/settings/ai`;
}

export function getBusinessMemberInvitePath(token: string) {
  return `/invite/${token}`;
}

export function getBusinessServicesPath(slug: string) {
  return `${getBusinessPath(slug)}/services`;
}

export function getBusinessServicePath(slug: string, serviceSlug: string) {
  return `${getBusinessServicesPath(slug)}/${serviceSlug}`;
}

export function getBusinessMembersPath(slug: string) {
  return getBusinessSettingsPath(slug, "members");
}

export function getBusinessNotificationsPath(slug: string) {
  return `${getBusinessPath(slug)}/notifications`;
}

export function getBusinessProductsPath(slug: string) {
  return `${getBusinessPath(slug)}/products`;
}

export function getBusinessAssistantPath(slug: string) {
  return `${getBusinessPath(slug)}/assistant`;
}

export function getBusinessPublicChatPath(slug: string) {
  return `/b/${slug}/chat`;
}

export function getBusinessPublicInquirePath(slug: string) {
  return `/b/${slug}/inquire`;
}

export function getBusinessServicePreviewPath(slug: string, serviceSlug: string) {
  return `${getBusinessPath(slug)}/preview/inquiry/${serviceSlug}`;
}

export function getBusinessSlugFromPathname(pathname: string) {
  const match = /^\/([^/]+)(?:\/|$)/.exec(pathname);

  return match ? decodeURIComponent(match[1]) : null;
}
