import type { Metadata } from "next";
import { cacheLife } from "next/cache";

import { EditorialPage } from "@/components/marketing/editorial-page";
import { CompareTable } from "@/components/marketing/compare-table";
import { StructuredData } from "@/components/seo/structured-data";
import { absoluteUrl, createPageMetadata } from "@/lib/seo/site";
import {
  getBreadcrumbListStructuredData,
  getFaqPageStructuredData,
} from "@/lib/seo/structured-data";

export const metadata: Metadata = createPageMetadata({
  description:
    "Requo vs job-management suites like Jobber or Housecall Pro: no scheduling or dispatch — a focused inquiry-to-quote-to-invoice loop for owners who sell custom work.",
  pathname: "/compare/job-management-software",
  title: "Requo vs Job-Management Software",
});

const rows: readonly { label: string; suites: string; requo: string }[] = [
  {
    label: "Scheduling and dispatch",
    suites: "Core strength: calendars, routes, crews",
    requo: "Not included — Requo has no scheduling",
  },
  {
    label: "Quote workflow",
    suites: "Estimates inside a bigger suite",
    requo: "The whole product: inquiry to paid",
  },
  {
    label: "Online payments",
    suites: "Built-in card processing",
    requo: "Manual payments recorded by hand",
  },
  {
    label: "Learning curve",
    suites: "Weeks to configure the suite",
    requo: "Quote your next inquiry today",
  },
  {
    label: "Starting price",
    suites: "Suite pricing for the bundle",
    requo: "Free plan; Pro $9/mo; Business $24/mo",
  },
  {
    label: "Best fit",
    suites: "Field crews needing dispatch",
    requo: "Owners who sell custom-quoted work",
  },
];

const compareFaqs = [
  {
    question: "Is Requo a Jobber or Housecall Pro alternative?",
    answer:
      "Only partly. If you need scheduling, dispatch, and route management, those suites are the right call — Requo has none of that. If your bottleneck is quoting custom work and following up, Requo covers that loop without the suite you would not use.",
  },
  {
    question: "Can I use Requo alongside job-management software?",
    answer:
      "Yes. Many owners quote in one place and schedule in another. Requo keeps the commercial trail — inquiry, quote versions, views, follow-ups, invoice, payments — and your suite keeps the calendar.",
  },
  {
    question: "Does Requo process payments like those suites?",
    answer:
      "No. Job suites typically process cards; Requo records manual payments — cash, bank transfer, GCash, Maya, check — and tracks the invoice from unpaid to paid.",
  },
  {
    question: "Who should pick Requo instead?",
    answer:
      "Solo owners and small teams whose jobs start with a custom inquiry and a custom quote, and who lose work to slow responses and missed follow-ups rather than to scheduling chaos.",
  },
] as const;

export default async function CompareJobManagementPage() {
  "use cache";
  cacheLife("hours");

  const breadcrumbStructuredData = getBreadcrumbListStructuredData({
    items: [
      { name: "Home", url: absoluteUrl("/") },
      {
        name: "Requo vs Job-Management Software",
        url: absoluteUrl("/compare/job-management-software"),
      },
    ],
  });
  const faqStructuredData = getFaqPageStructuredData({
    items: [...compareFaqs],
  });

  return (
    <>
      <StructuredData
        data={breadcrumbStructuredData}
        id="compare-jms-breadcrumb-structured-data"
      />
      <StructuredData
        data={faqStructuredData}
        id="compare-jms-faq-structured-data"
      />
      <EditorialPage
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Requo vs Job-Management Software" },
        ]}
        ctaHeadline="Pick the tool that matches the bottleneck."
        ctaSub="If quoting is the bottleneck, start free today."
        definition="Job-management suites like Jobber or Housecall Pro excel at scheduling and dispatch — which Requo deliberately omits. Requo is the narrower tool: a focused inquiry-to-quote-to-invoice loop with AI drafting, view tracking, follow-ups, and manual payment records for owners who sell custom work."
        eyebrow="Compare"
        faqSlug="compare-job-management"
        faqs={[...compareFaqs]}
        secondaryCta={{ href: "/about", label: "What Requo is" }}
        title="Requo vs job-management software"
      >
        <section
          aria-label="Requo versus job-management suites"
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 xl:px-0"
        >
          <CompareTable
            leftHeader="Job suites"
            rightHeader="Requo"
            rows={rows.map((row) => ({
              label: row.label,
              left: row.suites,
              right: row.requo,
            }))}
          />
        </section>
      </EditorialPage>
    </>
  );
}
