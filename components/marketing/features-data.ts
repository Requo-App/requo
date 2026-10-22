/**
 * Feature landing pages (`/features/[slug]`).
 *
 * One entry per product-nav item. Copy stays inside what the product does
 * today: inquiry → quote → follow-up → accepted/rejected → invoice with
 * manual payments. No scheduling, no dispatch, no online payments.
 */

export type FeatureFaq = {
  question: string;
  answer: string;
};

export type FeaturePoint = {
  title: string;
  body: string;
};

export type FeatureDetail = {
  slug: string;
  /** Short label for nav, footer, and cross-links. */
  label: string;
  /** Primary query this page targets. */
  query: string;
  /** Query-led H1 (title ≈ H1 ≈ query). */
  headline: string;
  /** 40–60 word extractable definition answering "what is it". */
  definition: string;
  points: readonly FeaturePoint[];
  workflow: readonly string[];
  faqs: readonly FeatureFaq[];
  related: readonly string[];
  ctaHeadline: string;
  ctaSub: string;
  seoTitle: string;
  seoDescription: string;
};

export function featureHref(slug: string) {
  return `/features/${slug}`;
}

export const featureLinks: readonly { slug: string; label: string }[] = [
  { slug: "inquiries", label: "Inquiry" },
  { slug: "quotes", label: "Quote" },
  { slug: "follow-ups", label: "Follow-up" },
  { slug: "ai", label: "AI" },
  { slug: "invoices", label: "Invoice" },
  { slug: "analytics", label: "Analytics" },
];

export const featureDetails: Record<string, FeatureDetail> = {
  inquiries: {
    slug: "inquiries",
    label: "Inquiry",
    query: "inquiry management software",
    headline: "Inquiry management software for service businesses",
    definition:
      "Requo inquiry management software collects every service request in one place: public forms with custom fields, manual entries for calls and DMs, attached photos and files, statuses, notes, and customer history grouped by email — so no request starts as a scattered thread.",
    points: [
      {
        title: "Capture requests from every channel",
        body: "Share a public inquiry form, or log calls, DMs, and referrals manually in seconds with the customer name, request details, and files.",
      },
      {
        title: "Ask for the details upfront",
        body: "Custom fields collect scope, property details, timeline, and budget before you price — fewer quotes start with a round of questions.",
      },
      {
        title: "Keep photos and files on the request",
        body: "Customers attach photos and documents to the inquiry itself, next to the scope they describe instead of buried in messages.",
      },
      {
        title: "Remember every customer",
        body: "Past inquiries and quotes from the same customer group into a history view by email, so repeat work starts with context.",
      },
      {
        title: "Move the best ones to quote instantly",
        body: "Filter by status, search by name, and turn a qualified inquiry into a quote without retyping the job.",
      },
    ],
    workflow: ["Capture", "Qualify", "Quote", "Follow up", "Win"],
    faqs: [
      {
        question: "What is inquiry management software?",
        answer:
          "Inquiry management software collects, organizes, and tracks incoming service requests from first contact to quoted work. Requo keeps every request — forms, calls, DMs, referrals — with its details, files, notes, and status in one place instead of scattered across inboxes.",
      },
      {
        question: "Can I add inquiries that came from calls or DMs?",
        answer:
          "Yes. Share your public form for inbound requests, or manually add inquiries in seconds with the customer name, request details, and files. AI automatically flags potential duplicates.",
      },
      {
        question: "Can customers attach photos to an inquiry?",
        answer:
          "Yes. Customers can attach photos and files to the inquiry itself, and they stay with the opportunity through quoting, revisions, approval, and invoicing.",
      },
      {
        question: "How do inquiries become quotes?",
        answer:
          "Open an inquiry and create a quote from it — customer details, scope, and attachments carry over. AI can draft a starting point from your pricing library that you review before sending.",
      },
    ],
    related: ["quotes", "follow-ups", "ai"],
    ctaHeadline: "Stop losing inquiries to scattered inboxes.",
    ctaSub: "Capture every request in one place and quote while it is warm.",
    seoTitle: "Inquiry Management Software for Service Businesses | Requo",
    seoDescription:
      "Capture every service request in one place: public forms, manual entries, photos, statuses, and customer history that flow straight into quotes.",
  },
  quotes: {
    slug: "quotes",
    label: "Quote",
    query: "quote tracking software",
    headline: "Quote tracking software for service businesses",
    definition:
      "Requo quote tracking software drafts, sends, and follows every quote from sent to decided: line-item pricing from your library, secure customer links, viewed / accepted / rejected / expired status, versions, expiry dates, and per-item change requests — all connected to the original inquiry.",
    points: [
      {
        title: "Draft from your pricing library",
        body: "AI matches line items from your products, pricing entries, templates, and past quotes. You review the draft and set every price.",
      },
      {
        title: "Send a link, not an attachment",
        body: "Every quote gets a secure public link customers open on any device — or send it through Requo email with your own templates.",
      },
      {
        title: "See viewed, accepted, rejected, expired",
        body: "The first view is stamped and notifies you. Every outcome stays on the record instead of scattered across threads.",
      },
      {
        title: "Handle change requests cleanly",
        body: "Customers comment on individual line items. You adjust and resend as a new version — the old ones stay snapshotted.",
      },
      {
        title: "Set expiry so old prices die",
        body: "Quote validity dates keep stale prices from lingering, and expired quotes are marked automatically.",
      },
    ],
    workflow: ["Draft", "Send", "Viewed", "Decided", "Invoiced"],
    faqs: [
      {
        question: "What is quote tracking software?",
        answer:
          "Quote tracking software follows a sent quote until the customer decides. Requo stamps the first view, tracks sent, viewed, accepted, rejected, expired, and voided status, and keeps versions and change requests on one record.",
      },
      {
        question: "Do customers need an account to open a quote?",
        answer:
          "No. Every quote gets a public link customers open on their phone or computer, review the details, and accept or reject with one tap.",
      },
      {
        question: "Can customers request changes to a quote?",
        answer:
          "Yes. They can request changes with comments on individual line items. You adjust the lines and resend the quote as a new version.",
      },
      {
        question: "What happens after a customer accepts?",
        answer:
          "The quote is marked accepted and stays connected to the inquiry and customer details. Convert it into an invoice in one step and track manual payments to paid.",
      },
    ],
    related: ["inquiries", "follow-ups", "invoices"],
    ctaHeadline: "Know exactly where every quote stands.",
    ctaSub: "Send clear quotes and see viewed, accepted, and expired at a glance.",
    seoTitle: "Quote Tracking Software for Service Businesses | Requo",
    seoDescription:
      "Draft, send, and track every quote: line-item pricing, secure links, viewed and accepted status, versions, and change requests in one place.",
  },
  "follow-ups": {
    slug: "follow-ups",
    label: "Follow-up",
    query: "quote follow-up software",
    headline: "Quote follow-up software for service businesses",
    definition:
      "Requo quote follow-up software makes sure open quotes get answered: view tracking that shows when to nudge, follow-up tasks with due dates and reminders for every inquiry and quote, and automatic follow-up emails on Pro and Business plans for quotes that go quiet.",
    points: [
      {
        title: "Know when to nudge",
        body: "The first quote view is stamped and notifies you — follow up with timing, not guesswork.",
      },
      {
        title: "Tasks for every open opportunity",
        body: "Create follow-up reminders with due dates for any inquiry or quote so nothing relies on memory.",
      },
      {
        title: "Automatic emails on paid plans",
        body: "Pro and Business plans send automatic follow-up emails when a quote goes quiet, while you stay in control of the thread.",
      },
      {
        title: "See what is waiting at a glance",
        body: "Open, viewed, and overdue follow-ups stay visible in one list until each opportunity is decided.",
      },
      {
        title: "Keep the history",
        body: "Every nudge, view, and response lands on the same record — the next conversation starts with full context.",
      },
    ],
    workflow: ["Viewed", "Reminded", "Nudged", "Decided", "Won"],
    faqs: [
      {
        question: "What is quote follow-up software?",
        answer:
          "Quote follow-up software reminds you — and nudges the customer — until an open quote is decided. Requo pairs view tracking with follow-up tasks, due dates, reminders, and automatic follow-up emails on Pro and Business plans.",
      },
      {
        question: "How do I know a quote needs a follow-up?",
        answer:
          "Every quote tracks sent, viewed, accepted, rejected, expired, and voided status. Quotes sitting in sent or viewed with no response are the ones to nudge.",
      },
      {
        question: "Does Requo send follow-ups automatically?",
        answer:
          "Pro and Business plans can send automatic follow-up emails when customers have not responded. Free plans use manual follow-up reminders with due dates.",
      },
      {
        question: "Can I set reminders for inquiries too?",
        answer:
          "Yes. Follow-up reminders work for both inquiries and quotes, each with its own due date and reminder.",
      },
    ],
    related: ["quotes", "inquiries", "analytics"],
    ctaHeadline: "Never let a warm quote go cold.",
    ctaSub: "See what is waiting and follow up before competitors do.",
    seoTitle: "Quote Follow-Up Software for Service Businesses | Requo",
    seoDescription:
      "Follow up before quotes go cold: view tracking, follow-up tasks with reminders, and automatic nudge emails on Pro and Business plans.",
  },
  ai: {
    slug: "ai",
    label: "AI",
    query: "AI quote software",
    headline: "AI quote software for service businesses",
    definition:
      "Requo AI quote software drafts quotes from your own context — pricing library, templates, past quotes, and business knowledge — with confidence labels on every line. You review and adjust each draft before sending. An owner Assistant plus a customer-facing Agent round out the loop.",
    points: [
      {
        title: "Drafts grounded in your pricing",
        body: "AI pulls line items from your products, pricing entries, templates, and past quotes — never invented prices you did not set.",
      },
      {
        title: "Confidence labels on every line",
        body: "Matched items and estimated items are labeled, so review time goes where it matters.",
      },
      {
        title: "You approve everything",
        body: "Every draft waits for your review. Scope and pricing stay yours; AI only assembles the starting point.",
      },
      {
        title: "Assistant in the dashboard",
        body: "Search business data, create inquiries and quotes, and review metrics by asking — inside the business, subject to plan limits.",
      },
      {
        title: "Customer-facing Agent on paid plans",
        body: "Pro and Business plans include a public Agent that answers questions and collects qualified inquiries from your website.",
      },
    ],
    workflow: ["Inquiry", "AI draft", "Review", "Send", "Decided"],
    faqs: [
      {
        question: "What is AI quote software?",
        answer:
          "AI quote software drafts price quotes from business context instead of a blank page. Requo builds drafts from your pricing library, templates, past quotes, and business knowledge, labels confidence per line item, and waits for your review before anything is sent.",
      },
      {
        question: "Does the AI set my prices?",
        answer:
          "No. AI assembles line items from context you already saved. You review the draft, adjust pricing and scope, and send. Nothing goes out without approval.",
      },
      {
        question: "What AI features are included?",
        answer:
          "AI quote drafting on all plans within monthly allowances, an owner Assistant that searches business data and performs supported operations, and a public customer-facing Agent on Pro and Business plans.",
      },
      {
        question: "How many AI drafts do I get?",
        answer:
          "About 10 AI quote drafts per month on Free, about 50 on Pro, and about 165 on Business. Drafts and revisions both count, so actual usage varies.",
      },
    ],
    related: ["quotes", "inquiries", "analytics"],
    ctaHeadline: "Draft quotes in minutes, not evenings.",
    ctaSub: "Start from AI context you trust, then send with confidence.",
    seoTitle: "AI Quote Software for Service Businesses | Requo",
    seoDescription:
      "Draft quotes from your pricing library and past work with confidence labels, plus an owner Assistant and customer-facing Agent.",
  },
  invoices: {
    slug: "invoices",
    label: "Invoice",
    query: "invoice from quote",
    headline: "Turn accepted quotes into invoices",
    definition:
      "Requo turns an accepted quote into an invoice without retyping: the same line items become the bill, you send it by email, then record each manual payment — cash, bank transfer, GCash, Maya, or check — as the invoice moves from unpaid to paid.",
    points: [
      {
        title: "One-step conversion",
        body: "An accepted quote becomes an invoice with the same lines, customer, and totals — no second data entry.",
      },
      {
        title: "Send by email",
        body: "Deliver invoices through Requo email and keep the sent record on the invoice itself.",
      },
      {
        title: "Manual payments, tracked honestly",
        body: "Record cash, bank transfer, GCash, Maya, check, or other payments by hand, including partial payments.",
      },
      {
        title: "Status that follows reality",
        body: "Invoices show unpaid, partially paid, paid, or overdue as payments are recorded — Requo tracks status, it does not process cards.",
      },
      {
        title: "Connected to the whole job",
        body: "Inquiry, quote versions, invoice, and payments stay on one trail from first contact to final payment.",
      },
    ],
    workflow: ["Accepted", "Invoiced", "Sent", "Paid", "Done"],
    faqs: [
      {
        question: "Can I create an invoice from a quote?",
        answer:
          "Yes. An accepted quote converts into an invoice in one step with the same line items, customer, and totals — nothing retyped.",
      },
      {
        question: "Does Requo process online payments?",
        answer:
          "No. Requo tracks payment status; it does not process cards or online payments. You record each manual payment — cash, bank transfer, GCash, Maya, check, or other — and the status follows.",
      },
      {
        question: "Can I track partial payments?",
        answer:
          "Yes. Record each payment as it arrives and the invoice shows as unpaid, partially paid, paid, or overdue.",
      },
      {
        question: "How do invoices connect to quotes?",
        answer:
          "Each invoice links back to its accepted quote and the original inquiry, so the full trail from first contact to final payment stays in one place.",
      },
    ],
    related: ["quotes", "analytics", "follow-ups"],
    ctaHeadline: "Get paid without retyping the job.",
    ctaSub: "Convert accepted quotes and track every payment to paid.",
    seoTitle: "Turn Accepted Quotes into Invoices | Requo",
    seoDescription:
      "Convert accepted quotes into invoices in one step, send by email, and track manual payments from unpaid to paid.",
  },
  analytics: {
    slug: "analytics",
    label: "Analytics",
    query: "quote conversion analytics",
    headline: "Quote conversion analytics for service businesses",
    definition:
      "Requo quote conversion analytics shows where opportunities move and stall: inquiry sources, quote activity, conversion trends, response timing, and follow-up performance — with scheduled reports and CSV exports on eligible plans so the numbers leave the dashboard.",
    points: [
      {
        title: "Follow the funnel",
        body: "See inquiries turn into quotes and quotes into accepted work — and spot the stage where opportunities stall.",
      },
      {
        title: "Know your sources",
        body: "Track which channels bring requests and which bring accepted quotes, so effort goes where it pays.",
      },
      {
        title: "Mind response timing",
        body: "Response timing and follow-up performance show whether speed or persistence is costing you jobs.",
      },
      {
        title: "Reports on a schedule",
        body: "Eligible plans deliver scheduled analytics reports and advanced views without opening the dashboard.",
      },
      {
        title: "Export the raw numbers",
        body: "CSV exports for inquiries and quotes keep a copy of operational data for analysis anywhere.",
      },
    ],
    workflow: ["Capture", "Measure", "Find stalls", "Fix", "Convert"],
    faqs: [
      {
        question: "What is quote conversion analytics?",
        answer:
          "Quote conversion analytics measures how inquiries become accepted quotes. Requo tracks inquiry sources, quote activity, conversion trends, response timing, and follow-up performance so you can see where opportunities stall.",
      },
      {
        question: "Which plan includes advanced analytics?",
        answer:
          "Advanced analytics with scheduled reports is available on Pro and Business plans. Core inquiry-to-quote tracking is included on every plan.",
      },
      {
        question: "Can I export my data?",
        answer:
          "Yes. Requo includes CSV exports for inquiries and quotes, so you can analyze operational data anywhere.",
      },
      {
        question: "Does analytics include team performance?",
        answer:
          "Business plans add members with roles and audit logs, so activity across the business stays attributable and reviewable.",
      },
    ],
    related: ["follow-ups", "quotes", "invoices"],
    ctaHeadline: "Find where opportunities get stuck.",
    ctaSub: "Track sources, timing, and conversion from inquiry to accepted.",
    seoTitle: "Quote Conversion Analytics for Service Businesses | Requo",
    seoDescription:
      "See what moves from inquiry to accepted quote: sources, activity, conversion trends, response timing, and follow-up performance.",
  },
};

export function getFeatureDetail(slug: string): FeatureDetail | undefined {
  return featureDetails[slug];
}
