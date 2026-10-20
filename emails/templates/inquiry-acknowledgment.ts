import {
  emailBrand,
  escapeHtml,
  renderDetailsCard,
  renderEmailLayout,
} from "./shared";

type InquiryAcknowledgmentTemplateInput = {
  businessName: string;
  customerName: string;
  serviceCategory: string;
  details?: string;
};

export function renderInquiryAcknowledgmentEmail({
  businessName,
  customerName,
  serviceCategory: serviceName,
  details,
}: InquiryAcknowledgmentTemplateInput) {
  const subject = `We received your inquiry — ${businessName}`;

  // Every interpolated value is public, visitor-supplied text. `renderEmailLayout`
  // escapes `title`/`preheader` but renders `children` raw, so the body values
  // must be escaped here — otherwise an anonymous visitor can inject arbitrary
  // HTML into an email sent from the platform's verified domain.
  const safeServiceName = escapeHtml(serviceName);
  const safeDetails = escapeHtml(details ?? "").replace(/\n/g, "<br />");

  const html = renderEmailLayout({
    label: "Inquiry",
    title: `Thanks for reaching out${customerName ? `, ${customerName}` : ""}!`,
    preheader: `We received your ${serviceName} inquiry and will get back to you soon.`,
    footerContext: businessName,
    children: `
      <p style="margin: 0 0 12px; color: ${emailBrand.foregroundColor}; font-size: 15px; line-height: 24px;">We received your <strong>${safeServiceName}</strong> inquiry and will get back to you soon.</p>
      <p style="margin: 0 0 12px; color: ${emailBrand.mutedTextColor}; font-size: 14px; line-height: 22px;">There is nothing else you need to do right now. If anything changes, we will reach out using the contact details you provided.</p>
      ${renderDetailsCard("Your inquiry", [
        { label: "Service", value: safeServiceName },
        { label: "Sent to", value: businessName },
      ])}
      ${
        details
          ? `<p style="margin: 0; color: ${emailBrand.mutedTextColor}; font-size: 13px; line-height: 20px;">Reference details:<br />${safeDetails}</p>`
          : ""
      }
    `,
  });

  return {
    subject,
    html,
  };
}