import type { Metadata } from "next";
import { cacheLife } from "next/cache";

import { EditorialPage } from "@/components/marketing/editorial-page";
import { InViewReveal } from "@/components/marketing/in-view-reveal";
import { StructuredData } from "@/components/seo/structured-data";
import { absoluteUrl, createPageMetadata } from "@/lib/seo/site";
import {
  getBreadcrumbListStructuredData,
  getFaqPageStructuredData,
  getHowToStructuredData,
} from "@/lib/seo/structured-data";

export const metadata: Metadata = createPageMetadata({
  description:
    "How to go from inquiry to accepted quote: capture the request, draft from your pricing library, send a secure link, follow up on the view, and invoice to paid.",
  pathname: "/guides/inquiry-to-accepted-quote",
  title: "From Inquiry to Accepted Quote: How It Works",
});

const steps: readonly { name: string; text: string }[] = [
  {
    name: "Capture the inquiry with details and files",
    text: "Collect the request through a public service page with custom fields — scope, timeline, budget — or log a call or DM manually. Ask for photos and files upfront so the quote starts from facts.",
  },
  {
    name: "Qualify and draft the quote",
    text: "Review the inquiry, then draft from your pricing library, templates, and past quotes — AI assembles a starting point with confidence labels, and you set every price before anything is sent.",
  },
  {
    name: "Send a secure link",
    text: "Share the quote by Requo email or paste the public link into WhatsApp, SMS, or Messenger. The customer opens it on any device with no account needed and can accept, decline, or request per-item changes.",
  },
  {
    name: "Track the view and follow up",
    text: "The first view is stamped and notifies you. Nudge open quotes with follow-up tasks and reminders — Pro and Business plans can also send automatic follow-up emails while you wait.",
  },
  {
    name: "Win it and invoice to paid",
    text: "The accepted quote converts into an invoice without retyping. Send it by email and record each manual payment — cash, bank transfer, GCash, Maya, or check — until the balance is zero.",
  },
];

const guideFaqs = [
  {
    question: "How long should each step take?",
    answer:
      "Capture is instant with a good service page, drafting takes minutes from the quote library, and the view usually lands within a day. Follow-up timing matters most: nudge within a few days of the first view, not weeks later.",
  },
  {
    question: "What if the customer requests changes?",
    answer:
      "Change requests arrive with comments on individual line items. Adjust the lines and resend as a new version — every version stays snapshotted, so the approved scope is never ambiguous.",
  },
  {
    question: "What if the quote expires?",
    answer:
      "Set a validity date when you send. Expired quotes are marked automatically, and you can revise and resend rather than honoring a stale price.",
  },
  {
    question: "Do I need the paid plans for this workflow?",
    answer:
      "No. The full loop — capture, draft, send, track, follow up manually, invoice — works on Free. Paid plans add automatic follow-up emails, more services and AI drafts, advanced analytics, and team access.",
  },
] as const;

export default async function InquiryToAcceptedQuoteGuide() {
  "use cache";
  cacheLife("hours");

  const breadcrumbStructuredData = getBreadcrumbListStructuredData({
    items: [
      { name: "Home", url: absoluteUrl("/") },
      {
        name: "From Inquiry to Accepted Quote",
        url: absoluteUrl("/guides/inquiry-to-accepted-quote"),
      },
    ],
  });
  const howToStructuredData = getHowToStructuredData({
    name: "How to go from inquiry to accepted quote",
    description:
      "Capture the request, draft from your pricing library, send a secure link, follow up on the view, and invoice the accepted quote to paid.",
    steps: [...steps],
  });
  const faqStructuredData = getFaqPageStructuredData({
    items: [...guideFaqs],
  });

  return (
    <>
      <StructuredData
        data={breadcrumbStructuredData}
        id="guide-breadcrumb-structured-data"
      />
      <StructuredData
        data={howToStructuredData}
        id="guide-how-to-structured-data"
      />
      <StructuredData
        data={faqStructuredData}
        id="guide-faq-structured-data"
      />
      <EditorialPage
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "From Inquiry to Accepted Quote" },
        ]}
        ctaHeadline="Run your next inquiry through these steps."
        ctaSub="Capture it, quote it, follow it to paid."
        definition="Going from inquiry to accepted quote takes five moves: capture the request with details and files, draft from your pricing library, send a secure link the customer can answer, follow up once the view lands, and convert the approval into an invoice. Each step below maps to exactly one Requo screen."
        eyebrow="Guide"
        faqSlug="guide-inquiry-to-quote"
        faqs={[...guideFaqs]}
        secondaryCta={{ href: "/features/quotes", label: "See quote tracking" }}
        title="From inquiry to accepted quote"
      >
        <section
          aria-label="Steps from inquiry to accepted quote"
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 xl:px-0"
        >
          <ol className="grid gap-3 sm:gap-4">
            {steps.map((step, index) => (
              <InViewReveal delay={index * 45} key={step.name}>
                <li className="soft-panel flex gap-4">
                  <span
                    aria-hidden="true"
                    className="font-mono text-sm font-semibold text-primary-ink"
                  >
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-heading text-base font-semibold tracking-tight">
                      {step.name}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {step.text}
                    </p>
                  </div>
                </li>
              </InViewReveal>
            ))}
          </ol>
        </section>
      </EditorialPage>
    </>
  );
}
