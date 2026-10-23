import { NextResponse } from "next/server";

import { getPlanPriceLabel } from "@/lib/billing/plans";
import { planCatalog, proTrialSummary } from "@/lib/plans/catalog";
import { planTiers } from "@/lib/plans/plans";

const planLines = planTiers
  .map((plan) => {
    const entry = planCatalog[plan];
    const price =
      plan === "free"
        ? "$0 for one business"
        : `${getPlanPriceLabel(plan, "USD", "monthly")} or ${getPlanPriceLabel(
            plan,
            "USD",
            "yearly",
          )} per business`;

    return `- ${entry.label}: ${price}. ${entry.description} Includes: ${entry.highlights.join("; ")}.`;
  })
  .join("\n");

const llmsContent = `# Requo

Requo is inquiry, quote, and invoice management software for service businesses.

## What Requo does

- Capture inquiries through public service pages, manual entry, or a customer-facing Agent.
- Create professional quotes with a quote library, pricing entries, templates, and AI-assisted drafting.
- Share quotes by public link or email and track viewed, accepted, rejected, expired, and voided status.
- Convert an accepted quote into an invoice, send it, and record manual payments until it is paid.
- Create follow-up reminders for inquiries and quotes; Pro and Business can send automatic follow-up emails.
- Review conversion and workflow analytics, scheduled reports, and CSV exports.
- Use the Assistant to search business data and perform supported inquiry and quote operations.

## Plans

${proTrialSummary}. When the trial ends, the business returns to Free and its data stays available.
${planLines}

Annual billing includes two months free. Paid subscriptions are billed per business.

## Key pages

- Home: /
- Pricing: /pricing (machine-readable: /pricing.md)
- Solutions hub: /solutions
- Solutions: /solutions/contractors-home-services, /solutions/professional-it-services, /solutions/creative-marketing, /solutions/photo-video, /solutions/events-rentals, /solutions/custom-fabrication-signage
- Features: /features/inquiries, /features/quotes, /features/follow-ups, /features/ai, /features/invoices, /features/analytics
- About: /about
- Compare: /compare/spreadsheets, /compare/job-management-software
- Guide: /guides/inquiry-to-accepted-quote
- Security: /security
- Legal: /privacy, /terms, /refund-policy, /legal/dpa, /subprocessors
- Public inquiry pages: /inquire/[slug]
- Public customer Agent: /b/[slug]/chat
`;

export function GET() {
  return new NextResponse(llmsContent, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
