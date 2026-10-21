import {
  emailBrand,
  escapeAttribute,
  escapeHtml,
  renderEmailLayout,
  renderTextUrl,
} from "./shared";

type FollowUpEmailInput = {
  businessName: string;
  customerName: string;
  /** The owner-authored follow-up message shown to the customer. */
  message: string;
  /** Optional call to action (e.g. "View your quote"). */
  ctaLabel?: string | null;
  ctaUrl?: string | null;
  /** Business-configured signature, appended above the sign-off. */
  emailSignature?: string | null;
  /** Overrides the default subject line. */
  subject?: string | null;
};

/**
 * Branded follow-up email for a customer touchpoint that is not a quote
 * (an inquiry follow-up, or a quote follow-up without a public link).
 *
 * Quote follow-ups that have a public URL use the quote follow-up template
 * instead — this renderer is the branded fallback.
 */
export function renderFollowUpEmail({
  businessName,
  customerName,
  message,
  ctaLabel,
  ctaUrl,
  emailSignature,
  subject,
}: FollowUpEmailInput) {
  const greeting = customerName ? `Hi ${customerName},` : "Hi,";
  const resolvedSubject = subject?.trim() || `Following up from ${businessName}`;

  // `renderEmailLayout` escapes the title/preheader but renders `children`
  // raw, so every interpolated value must be escaped here.
  const safeMessage = escapeHtml(message).replace(/\n/g, "<br />");
  const safeSignature = emailSignature
    ? escapeHtml(emailSignature).replace(/\n/g, "<br />")
    : "";
  const ctaHref = ctaUrl ? escapeAttribute(ctaUrl) : null;
  const ctaLabelText = ctaLabel?.trim() || "View details";

  const children = `
      <p style="margin: 0 0 12px; color: ${emailBrand.foregroundColor}; font-size: 15px; line-height: 24px;">${escapeHtml(greeting)}</p>
      <p style="margin: 0 0 12px; color: ${emailBrand.foregroundColor}; font-size: 15px; line-height: 24px;">${safeMessage}</p>
      ${
        safeSignature
          ? `<p style="margin: 22px 0 0; color: ${emailBrand.mutedTextColor}; font-size: 14px; line-height: 22px;">${safeSignature}</p>`
          : ""
      }
      <p style="margin: 22px 0 0; color: ${emailBrand.foregroundColor}; font-size: 14px; line-height: 22px;">Best regards,<br />${escapeHtml(businessName)}</p>
      ${ctaHref ? renderTextUrl(ctaHref) : ""}
    `;

  const html = renderEmailLayout({
    label: "Follow-up",
    title: "Just following up",
    preheader: `${businessName} is following up with you.`,
    footerContext: businessName,
    children,
    ...(ctaHref ? { cta: { href: ctaHref, label: escapeHtml(ctaLabelText) } } : {}),
  });

  const text = [
    greeting,
    message,
    emailSignature?.trim(),
    "Best regards,",
    businessName,
    ctaHref ? `${ctaLabelText}: ${ctaUrl}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    subject: resolvedSubject,
    html,
    text,
  };
}
