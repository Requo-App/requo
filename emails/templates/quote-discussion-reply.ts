import {
  emailBrand,
  escapeHtml,
  renderEmailLayout,
  renderNoteCard,
  renderTextUrl,
} from "./shared";

type QuoteDiscussionReplyEmailInput = {
  businessName: string;
  customerName: string;
  quoteNumber: string;
  replyPreview: string;
  publicQuoteUrl: string;
};

/**
 * All customer-supplied and owner-supplied text is escaped. The template
 * renders plain text only; message HTML is never treated as markup.
 */
export function renderQuoteDiscussionReplyEmail({
  businessName,
  customerName,
  quoteNumber,
  replyPreview,
  publicQuoteUrl,
}: QuoteDiscussionReplyEmailInput) {
  const subject = `${businessName} replied about quote ${quoteNumber}`;
  const text = [
    `Hi ${customerName},`,
    "",
    `${businessName} replied to your question about quote ${quoteNumber}.`,
    "",
    replyPreview.length > 600 ? `${replyPreview.slice(0, 600)}…` : replyPreview,
    "",
    "Open the quote to read the full conversation and reply:",
    publicQuoteUrl,
    "",
    "Replies to this email are not monitored. Use the quote link above to continue the discussion.",
    "",
    `Sent by ${businessName} through Requo.`,
  ].join("\n");

  const html = renderEmailLayout({
    label: "Quote discussion",
    title: `${businessName} replied`,
    preheader: `A new reply about quote ${quoteNumber}.`,
    footerContext: businessName,
    children: `
      <p style="margin: 0; color: ${emailBrand.foregroundColor}; font-size: 15px; line-height: 24px;">Hi ${escapeHtml(customerName)},</p>
      <p style="margin: 14px 0 0; color: ${emailBrand.foregroundColor}; font-size: 15px; line-height: 24px;">
        ${escapeHtml(businessName)} replied to your question about quote <strong>${escapeHtml(quoteNumber)}</strong>.
      </p>
      ${renderNoteCard("Reply", replyPreview.length > 600 ? `${replyPreview.slice(0, 600)}…` : replyPreview)}
      <p style="margin: 18px 0 0; color: ${emailBrand.foregroundColor}; font-size: 15px; line-height: 24px;">
        Open the quote to read the full conversation and reply.
      </p>
      ${renderTextUrl(publicQuoteUrl)}
      <p style="margin: 18px 0 0; color: ${emailBrand.mutedTextColor}; font-size: 13px; line-height: 20px;">
        Replies to this email are not monitored. Use the quote link above to continue the discussion.
      </p>
    `,
  });

  return { subject, text, html };
}
