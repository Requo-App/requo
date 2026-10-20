import { describe, expect, it } from "vitest";

import { renderInquiryAcknowledgmentEmail } from "@/emails/templates/inquiry-acknowledgment";

describe("inquiry acknowledgment email", () => {
  it("escapes visitor-supplied details so they cannot inject HTML", () => {
    const { html } = renderInquiryAcknowledgmentEmail({
      businessName: "Acme Roofing",
      customerName: "Taylor",
      serviceCategory: "Roof repair",
      details: '<img src="http://evil.example/p.gif"><script>alert(1)</script>',
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("escapes the service name in the body", () => {
    const { html } = renderInquiryAcknowledgmentEmail({
      businessName: "Acme Roofing",
      customerName: "Taylor",
      serviceCategory: '<b>Bold</b> "quotes"',
    });

    expect(html).not.toContain("<b>Bold</b>");
    expect(html).toContain("&lt;b&gt;Bold&lt;/b&gt;");
    // The details card escapes the value itself, so it must not be
    // escaped twice.
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;quot;");
  });

  it("keeps newlines readable in the details block", () => {
    const { html } = renderInquiryAcknowledgmentEmail({
      businessName: "Acme Roofing",
      customerName: "Taylor",
      serviceCategory: "Roof repair",
      details: "First line\nSecond line",
    });

    expect(html).toContain("First line<br />Second line");
  });
});
