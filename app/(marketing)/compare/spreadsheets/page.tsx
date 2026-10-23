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
    "Requo vs spreadsheets for quotes: connected inquiries, versions, view tracking, follow-ups, and invoices — without giving up the flexibility you like.",
  pathname: "/compare/spreadsheets",
  title: "Quotes in Requo vs Spreadsheets",
});

const rows: readonly { label: string; sheets: string; requo: string }[] = [
  {
    label: "Inquiry capture",
    sheets: "A tab you fill in by hand",
    requo: "Public service pages plus manual entries",
  },
  {
    label: "Photos and files",
    sheets: "Links that rot in cells",
    requo: "Attached to the inquiry itself",
  },
  {
    label: "Quote versions",
    sheets: "Duplicated tabs named v2-final",
    requo: "Snapshotted on every send",
  },
  {
    label: "View tracking",
    sheets: "Not available",
    requo: "First view stamped, you are notified",
  },
  {
    label: "Follow-ups",
    sheets: "A reminder column you ignore",
    requo: "Tasks, reminders, and auto emails",
  },
  {
    label: "Customer history",
    sheets: "Filter and hope",
    requo: "Grouped by email automatically",
  },
  {
    label: "Invoice conversion",
    sheets: "Retyped on a second tab",
    requo: "One step from the accepted quote",
  },
  {
    label: "Price",
    sheets: "Free, plus your evenings",
    requo: "Free plan; Pro $9/mo and Business $24/mo (USD)",
  },
];

const compareFaqs = [
  {
    question: "Should I replace my quote spreadsheet with Requo?",
    answer:
      "If quotes live in one spreadsheet and follow-ups live in your head, yes: Requo keeps the inquiry, versions, view status, follow-ups, and invoice on one record. If your sheet encodes unusual pricing logic nothing else supports, keep it alongside Requo until the library covers it.",
  },
  {
    question: "Can I import my spreadsheet data?",
    answer:
      "Yes. Requo includes CSV, PDF, and PNG exports for inquiries, quotes, and invoices, and you can rebuild your price list as products and pricing entries so future quotes start from the library instead of a tab.",
  },
  {
    question: "What do spreadsheets still do better?",
    answer:
      "Ad-hoc math and one-off analyses. Requo is opinionated about the inquiry-to-paid loop; a spreadsheet stays useful for custom calculations no quote tool would build in.",
  },
  {
    question: "Does Requo do everything a spreadsheet does?",
    answer:
      "No — deliberately not. Requo tracks the commercial loop and records manual payments, but it has no job scheduling or dispatch and processes no online payments.",
  },
] as const;

export default async function CompareSpreadsheetsPage() {
  "use cache";
  cacheLife("hours");

  const breadcrumbStructuredData = getBreadcrumbListStructuredData({
    items: [
      { name: "Home", url: absoluteUrl("/") },
      {
        name: "Requo vs Spreadsheets",
        url: absoluteUrl("/compare/spreadsheets"),
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
        id="compare-spreadsheets-breadcrumb-structured-data"
      />
      <StructuredData
        data={faqStructuredData}
        id="compare-spreadsheets-faq-structured-data"
      />
      <EditorialPage
        breadcrumbs={[
          { name: "Home", href: "/" },
          { name: "Requo vs Spreadsheets" },
        ]}
        ctaHeadline="Keep the flexibility. Lose the chaos."
        ctaSub="Move the loop into Requo and keep the spreadsheet for math."
        definition="Spreadsheets are free and flexible — and quotes die in them: versions multiply, views are invisible, and follow-ups rely on memory. Requo keeps inquiries, versions, view tracking, follow-ups, and invoices on one record, so the job moves from request to paid without retyping."
        eyebrow="Compare"
        faqSlug="compare-spreadsheets"
        faqs={[...compareFaqs]}
        secondaryCta={{ href: "/features/quotes", label: "See quote tracking" }}
        title="Quoting in Requo vs spreadsheets"
      >
        <section
          aria-label="Requo versus spreadsheets"
          className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 xl:px-0"
        >
          <CompareTable
            leftHeader="Spreadsheets"
            rightHeader="Requo"
            rows={rows.map((row) => ({
              label: row.label,
              left: row.sheets,
              right: row.requo,
            }))}
          />
        </section>
      </EditorialPage>
    </>
  );
}
