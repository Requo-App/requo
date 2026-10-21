import { describe, expect, it } from "vitest";

import { renderFollowUpEmail } from "@/emails/templates/follow-up-email";

describe("follow-up email CTA", () => {
  it("trims and escapes URLs and labels exactly once", () => {
    const { html } = renderFollowUpEmail({
      businessName: "Acme",
      customerName: "Taylor",
      message: "Please review your quote.",
      ctaUrl: '  https://example.com/quote?a=1&b="two"  ',
      ctaLabel: '  View <quote> & "details"  ',
    });

    expect(html).toContain('href="https://example.com/quote?a=1&amp;b=&quot;two&quot;"');
    expect(html).toContain("View &lt;quote&gt; &amp; &quot;details&quot;");
    expect(html).not.toContain("&amp;amp;");
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;quot;");
  });

  it("omits the CTA when its URL is blank", () => {
    const { html, text } = renderFollowUpEmail({
      businessName: "Acme",
      customerName: "Taylor",
      message: "Please reply.",
      ctaUrl: "  ",
      ctaLabel: "View details",
    });

    expect(html).not.toContain("View details");
    expect(text).not.toContain("View details");
  });
});
