import {
  BellRing,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  CheckCircle2,
  ClipboardList,
  FileText,
  House,
  Link2,
  Palette,
  Package,
  Printer,
  ReceiptText,
  Ruler,
  Sparkles,
  Users,
  type LucideIcon,
} from "lucide-react";

import type { InvoiceStatus } from "@/features/invoices/types";
import type { QuoteStatus } from "@/features/quotes/types";

import type { BusinessType } from "@/features/inquiries/business-types";

export type SolutionLink = {
  slug: string;
  title: string;
  description: string;
  icon: LucideIcon;
};

export const solutionLinks: readonly SolutionLink[] = [
  {
    slug: "contractors-home-services",
    title: "Contractors & Home Services",
    description: "Quotes for remodels, repairs, installs, and on-site work.",
    icon: House,
  },
  {
    slug: "creative-marketing",
    title: "Creative & Marketing",
    description: "Briefs, files, and quotes for client projects.",
    icon: Palette,
  },
  {
    slug: "professional-it-services",
    title: "Professional & IT Services",
    description: "Turn discovery inquiries into scoped proposals.",
    icon: BriefcaseBusiness,
  },
  {
    slug: "photo-video",
    title: "Photo & Video",
    description: "Shoots, coverage, and deliverables quoted in one place.",
    icon: Camera,
  },
  {
    slug: "events-rentals",
    title: "Events & Rentals",
    description: "Dates, venues, and guest counts quoted in one place.",
    icon: CalendarDays,
  },
  {
    slug: "custom-fabrication-signage",
    title: "Custom Fabrication & Signage",
    description: "Specs, dimensions, and made-to-order quotes.",
    icon: Printer,
  },
];

/**
 * Canonical solution → business-type mapping. Marketing positioning only:
 * solutions are display/SEO pages, while `businessTypes` remain the stored
 * taxonomy (`features/inquiries/business-types.ts`). Secondary types stay
 * supported via the general flow but are not primary marketing ICP.
 */
export const solutionBusinessTypes: Record<string, readonly BusinessType[]> = {
  "contractors-home-services": [
    "contractor_home_improvement",
    "repair_services",
  ],
  "creative-marketing": ["creative_marketing_services"],
  "professional-it-services": [
    "web_it_services",
    "consulting_professional_services",
  ],
  "photo-video": ["photo_video_production"],
  "events-rentals": ["event_services_rentals"],
  "custom-fabrication-signage": ["fabrication_custom_build", "print_signage"],
};

/** Supported but not actively marketed as a primary solution. */
export const secondaryBusinessTypes: readonly BusinessType[] = [
  "cleaning_services",
  "landscaping_outdoor_services",
  "moving_relocation",
  "auto_services",
  "pet_services",
];

/** Fallback for project-based services that fit no specialized category. */
export const fallbackBusinessType: BusinessType = "general_project_services";

export type SolutionExampleField = {
  label: string;
  value: string;
};

/** Shared shape for every product card: hero, demo tabs, customer view. */
export type SolutionCardData = {
  cardTitle: string;
  cardSubtitle: string;
  fields: readonly SolutionExampleField[];
  quoteLabel: string;
  quoteValue: string;
  statusLabel: string;
  statusValue: string;
  note: string;
  quoteStatus: QuoteStatus;
  /**
   * Set only for invoice moments (accepted quote → invoice → manual
   * payments). Takes precedence over `quoteStatus` in the card shell so the
   * paid tail renders a real invoice badge instead of a quote badge.
   */
  invoiceStatus?: InvoiceStatus;
};

export type SolutionDemoTab = {
  id: string;
  label: string;
  /** Left-column title for the journey narrative (benefit, not feature). */
  stageHeadline: string;
  /** 1–2 sentences supporting the stage headline. */
  stageBody: string;
  /**
   * Chips proving "nothing retyped". Defaults to the first tab's field
   * values when omitted.
   */
  carriedForward?: readonly string[];
} & SolutionCardData;

export type SolutionFeature = {
  icon: LucideIcon;
  title: string;
  body: string;
};

export type SolutionFaq = {
  question: string;
  answer: string;
};

export type SolutionRelated = {
  slug: string;
  blurb: string;
};

export type SolutionCustomerView = SolutionCardData;

export type SolutionDetail = {
  slug: string;
  /** Short label for headings and footer links. */
  shortTitle: string;
  headline: string;
  description: string;
  /** 40–60 word extractable definition answering "what is it". */
  definition: string;
  secondaryCtaLabel: string;
  heroCard: SolutionCardData;
  /** Business-specific workflow. Last four steps are always the supported tail. */
  workflow: readonly string[];
  demoHeadline: string;
  demoIntro: string;
  demoTabs: readonly SolutionDemoTab[];
  featuresHeading: string;
  featuresIntro: string;
  features: readonly SolutionFeature[];
  customerView: SolutionCustomerView;
  faqs: readonly SolutionFaq[];
  related: readonly SolutionRelated[];
  ctaHeadline: string;
  ctaSub: string;
  seoTitle: string;
  seoDescription: string;
};

export function solutionHref(slug: string) {
  return `/solutions/${slug}`;
}

export const solutionDetails: Record<string, SolutionDetail> = {
  "contractors-home-services": {
    slug: "contractors-home-services",
    shortTitle: "Contractors",
    headline: "Turn project inquiries into clear, confident quotes.",
    description:
      "Keep customer requests, project details, attachments, quotes, follow-ups, invoices, and payment status connected from the first message to the final payment.",
    definition:
      "Contractor quote software turns project inquiries into priced, trackable quotes: property details, scope, budget signals, and site photos arrive on one inquiry, line-item pricing builds the estimate, view tracking and follow-up tasks chase the decision, and the accepted quote becomes the invoice.",
    secondaryCtaLabel: "See the contractor workflow",
    heroCard: {
      cardTitle: "Sarah Jenkins",
      cardSubtitle: "Kitchen Renovation",
      fields: [
        { label: "Property", value: "Single-family home" },
        { label: "Scope", value: "Full kitchen renovation" },
        { label: "Attachments", value: "3 photos" },
      ],
      quoteLabel: "Quote",
      quoteValue: "$21,400",
      statusLabel: "Quote activity",
      statusValue: "Viewed",
      note: "Follow up tomorrow",
      quoteStatus: "sent",
    },
    workflow: [
      "Project inquiry",
      "Property details",
      "Estimate",
      "Quote",
      "Follow-up",
      "Approval",
      "Invoice",
      "Payment",
    ],
    demoHeadline: "One kitchen renovation. Inquiry to paid.",
    demoIntro:
      "One kitchen renovation, from inquiry to paid — nothing retyped.",
    demoTabs: [
      {
        id: "inquiry",
        label: "Project inquiry",
        stageHeadline: "The request arrives complete.",
        stageBody:
          "Property, scope, budget, and photos land on one inquiry — no return trip for the basics.",
        cardTitle: "Sarah Jenkins",
        cardSubtitle: "Kitchen Renovation inquiry",
        fields: [
          { label: "Property", value: "Single-family home" },
          { label: "Scope", value: "Full kitchen renovation" },
          { label: "Attachments", value: "3 photos" },
        ],
        quoteLabel: "Budget signal",
        quoteValue: "$18–25k",
        statusLabel: "Inquiry",
        statusValue: "New · details + photos in one place",
        note: "Property, scope, budget, and photos arrive on one inquiry",
        quoteStatus: "draft",
      },
      {
        id: "quote",
        label: "Quote",
        stageHeadline: "Price it without starting over.",
        stageBody:
          "Line items sit on the same job — photos, scope, and budget already there. The homeowner opens a link.",
        cardTitle: "Sarah Jenkins",
        cardSubtitle: "Kitchen Renovation · $21,400",
        fields: [
          { label: "Scope", value: "Full kitchen renovation" },
          { label: "Property", value: "Single-family home" },
          { label: "Attachments", value: "3 photos" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$21,400",
        statusLabel: "Quote activity",
        statusValue: "Viewed",
        note: "Secure link · valid 30 days · version 2",
        quoteStatus: "sent",
      },
      {
        id: "follow-up",
        label: "Follow-up",
        stageHeadline: "Know when to nudge.",
        stageBody:
          "The first view is stamped, and a due task keeps the quote visible until Sarah decides.",
        cardTitle: "Sarah Jenkins",
        cardSubtitle: "Kitchen Renovation · $21,400",
        fields: [
          { label: "Quote", value: "$21,400 · viewed" },
          { label: "Last activity", value: "Viewed 3 days ago" },
          { label: "Reminder", value: "Due today" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$21,400",
        statusLabel: "Next step",
        statusValue: "Follow up tomorrow",
        note: "Owner task + copy-paste follow-up draft — no auto-send",
        quoteStatus: "sent",
      },
      {
        id: "paid",
        label: "Paid",
        stageHeadline: "Approval becomes an invoice.",
        stageBody:
          "The same lines become the invoice. The manual payment is recorded by hand — balance $0.",
        cardTitle: "Sarah Jenkins",
        cardSubtitle: "Kitchen Renovation · paid",
        fields: [
          { label: "Quote", value: "$21,400 · approved" },
          { label: "Invoice", value: "Sent from the quote" },
          { label: "Payment", value: "Bank transfer · recorded by hand" },
        ],
        quoteLabel: "Balance due",
        quoteValue: "$0",
        statusLabel: "Payment status",
        statusValue: "Paid",
        note: "One invoice per quote · manual payments only, no pay page",
        quoteStatus: "accepted",
        invoiceStatus: "paid",
      },
    ],
    featuresHeading: "Everything you need around the quote.",
    featuresIntro:
      "Not a full toolbox of extras — the pieces a contractor actually touches between the first call and the final payment.",
    features: [
      {
        icon: ClipboardList,
        title: "Ask for the job details upfront",
        body: "Inquiry forms with custom fields collect the property, scope, budget, and timeline before you drive out — so fewer quotes start with a round of questions.",
      },
      {
        icon: Camera,
        title: "Keep project photos with the request",
        body: "Customers attach photos and files to the inquiry itself. You open them next to the scope and measurements instead of digging through messages.",
      },
      {
        icon: FileText,
        title: "Price from line items, not memory",
        body: "Build the estimate from your quote library or custom lines. Every send and revision is snapshotted as a version, and expiry dates keep old prices from lingering.",
      },
      {
        icon: BellRing,
        title: "See which quotes are waiting",
        body: "The first view is stamped and you get notified. Follow-up tasks with due dates and reminders keep open estimates visible until the homeowner decides.",
      },
      {
        icon: Sparkles,
        title: "Start from a draft, keep control of the price",
        body: "Review an AI draft built on the inquiry — line items, quantities, and notes in place — then adjust every price yourself before it goes out.",
      },
      {
        icon: ReceiptText,
        title: "Turn an approval into an invoice",
        body: "An accepted quote converts into an invoice without retyping the job. Record each manual payment — cash, bank transfer, GCash, Maya, check — and the status follows: unpaid, partially paid, paid, or overdue.",
      },
    ],
    customerView: {
      cardTitle: "Kitchen Renovation · $21,400",
      cardSubtitle: "Sent by your contractor",
      fields: [
        { label: "Scope", value: "Full kitchen renovation" },
        { label: "Valid until", value: "30 days" },
      ],
      quoteLabel: "Total",
      quoteValue: "$21,400",
      statusLabel: "Quote activity",
      statusValue: "Viewed",
      note: "The homeowner opens a secure link — no account, no app. Accept, decline, or request changes with per-item comments.",
      quoteStatus: "sent",
    },
    faqs: [
      {
        question: "Can I collect project details and photos through an inquiry?",
        answer:
          "Yes. Inquiry forms support custom fields for the property, scope, budget, and timeline, and customers can attach photos and files to the inquiry itself — so measurements and images arrive with the request instead of scattered across messages.",
      },
      {
        question: "Can I create quotes from project requests?",
        answer:
          "Yes. Build the quote from line items using your quote library or custom lines. AI can draft a starting point from the inquiry that you review and adjust — it never sets prices. Every send and revision is saved as a version, and you can set an expiry date.",
      },
      {
        question: "Can I keep customer and project information together?",
        answer:
          "Yes. The inquiry holds the project details, attached photos and files, and your notes in one place. Past inquiries and quotes from the same customer are grouped into a history view by email, so repeat work starts with context.",
      },
      {
        question: "Can I track quotes that need follow-up?",
        answer:
          "Yes. The first time a customer views a quote it is stamped and you are notified. Follow-up tasks with due dates and reminders keep open estimates visible, and eligible plans can send automatic follow-up emails for quotes that go quiet.",
      },
      {
        question: "How do payments work for a finished job?",
        answer:
          "An accepted quote converts into an invoice without retyping. You send it from Requo and record each payment by hand — cash, bank transfer, GCash, Maya, check, or other. The invoice then shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    related: [
      {
        slug: "custom-fabrication-signage",
        blurb:
          "Specifications and files that keep a custom order quotable.",
      },
      {
        slug: "events-rentals",
        blurb: "Dates, venues, and guest counts quoted in one connected flow.",
      },
    ],
    ctaHeadline: "Ready for the next project inquiry?",
    ctaSub:
      "Capture the request, send a clear quote, and know what needs your attention.",
    seoTitle: "Contractor Quote & Inquiry Software | Requo",
    seoDescription:
      "Turn scattered project inquiries into confident quotes: property details, photos, line-item pricing, follow-ups, invoices, and payment status in one workflow.",
  },
  "professional-it-services": {
    slug: "professional-it-services",
    shortTitle: "Professional & IT",
    headline: "Turn client inquiries into clear proposals and paid work.",
    description:
      "Keep client requirements, scope, quotes, follow-ups, invoices, and payment status together — without rebuilding the same information across tools.",
    definition:
      "Proposal software for professional and IT services turns discovery inquiries into scoped, signable proposals: requirements and files stay on one record, deliverables and fees are priced line by line, clients respond through a secure link, and the approved scope converts into an invoice without retyping.",
    secondaryCtaLabel: "See the professional workflow",
    heroCard: {
      cardTitle: "Acme Consulting",
      cardSubtitle: "Growth Strategy · $8,500",
      fields: [
        { label: "Scope", value: "12-week engagement" },
        { label: "Deliverables", value: "Workshop · Analysis · Plan" },
        { label: "Terms", value: "Valid 30 days" },
      ],
      quoteLabel: "Proposal",
      quoteValue: "$8,500",
      statusLabel: "Client activity",
      statusValue: "Viewed 2h ago",
      note: "Secure link — no account needed to respond",
      quoteStatus: "sent",
    },
    workflow: [
      "Client inquiry",
      "Requirements",
      "Discovery",
      "Proposal / Quote",
      "Follow-up",
      "Approval",
      "Invoice",
      "Payment",
    ],
    demoHeadline: "One strategy engagement. Inquiry to paid.",
    demoIntro:
      "One strategy engagement, from inquiry to paid — nothing retyped.",
    demoTabs: [
      {
        id: "inquiry",
        label: "Client inquiry",
        stageHeadline: "The request arrives complete.",
        stageBody:
          "Needs, timeline, and files land on one inquiry — discovery starts with context, not questions.",
        cardTitle: "Acme Consulting",
        cardSubtitle: "Growth strategy inquiry",
        fields: [
          { label: "Needs", value: "Market analysis + growth plan" },
          { label: "Timeline", value: "Start next quarter" },
          { label: "Files", value: "Intro call notes attached" },
        ],
        quoteLabel: "Budget range",
        quoteValue: "$8,500",
        statusLabel: "Inquiry",
        statusValue: "New · requirements in one place",
        note: "Requirements and files stay on the inquiry",
        quoteStatus: "draft",
      },
      {
        id: "proposal",
        label: "Proposal",
        stageHeadline: "Scope it without starting over.",
        stageBody:
          "Deliverables and fees sit on the same record — requirements already there. The client opens a link.",
        cardTitle: "Acme Consulting",
        cardSubtitle: "Growth Strategy · $8,500",
        fields: [
          { label: "Scope", value: "12-week engagement" },
          { label: "Deliverables", value: "Workshop · Analysis · Plan" },
          { label: "Terms", value: "Valid 30 days" },
        ],
        quoteLabel: "Proposal",
        quoteValue: "$8,500",
        statusLabel: "Client activity",
        statusValue: "Viewed 2h ago",
        note: "Secure link · valid 30 days · version 1",
        quoteStatus: "sent",
      },
      {
        id: "follow-up",
        label: "Follow-up",
        stageHeadline: "Know when to nudge.",
        stageBody:
          "The first view is stamped, and a due task keeps the proposal visible until Acme decides.",
        cardTitle: "Acme Consulting",
        cardSubtitle: "Growth Strategy · $8,500",
        fields: [
          { label: "Proposal", value: "$8,500 · viewed" },
          { label: "Last activity", value: "Viewed yesterday" },
          { label: "Reminder", value: "Due tomorrow" },
        ],
        quoteLabel: "Proposal",
        quoteValue: "$8,500",
        statusLabel: "Next step",
        statusValue: "Follow up",
        note: "Owner task + copy-paste follow-up draft — no auto-send",
        quoteStatus: "sent",
      },
      {
        id: "paid",
        label: "Paid",
        stageHeadline: "Approval becomes an invoice.",
        stageBody:
          "The same scope becomes the invoice. The manual payment is recorded by hand — balance $0.",
        cardTitle: "Acme Consulting",
        cardSubtitle: "Growth Strategy · paid",
        fields: [
          { label: "Proposal", value: "$8,500 · approved" },
          { label: "Invoice", value: "Sent from the proposal" },
          { label: "Payment", value: "Bank transfer · recorded by hand" },
        ],
        quoteLabel: "Balance due",
        quoteValue: "$0",
        statusLabel: "Payment status",
        statusValue: "Paid",
        note: "One invoice per proposal · manual payments only, no pay page",
        quoteStatus: "accepted",
        invoiceStatus: "paid",
      },
    ],
    featuresHeading: "Everything around the proposal.",
    featuresIntro:
      "The pieces that turn a vague client request into scoped, approved, billable work.",
    features: [
      {
        icon: ClipboardList,
        title: "Capture requirements once",
        body: "Inquiry forms with custom fields collect the engagement type, goals, timeline, and budget. Your discovery notes live on the same inquiry the request arrived on.",
      },
      {
        icon: FileText,
        title: "Write scope the client can sign off on",
        body: "Line items spell out deliverables, phases, and fees. When the client asks for changes, revision requests come back with per-item comments and the proposal goes out as a new version.",
      },
      {
        icon: Link2,
        title: "Send a proposal they can act on",
        body: "Every proposal goes out as a secure link. Clients review it on any device and accept, decline, or request changes — and you see the moment it's viewed.",
      },
      {
        icon: BellRing,
        title: "Follow up before the trail cools",
        body: "Open proposals stay visible with follow-up tasks, due dates, and reminders. Eligible plans add automatic nudge emails for proposals waiting on a decision.",
      },
      {
        icon: Users,
        title: "Remember every client",
        body: "Past inquiries and proposals from the same client group into a history view by email — so the next engagement starts with context, not a blank page.",
      },
      {
        icon: ReceiptText,
        title: "Bill from the approved scope",
        body: "An accepted proposal becomes an invoice without retyping the engagement. Record manual payments as they arrive and watch the status move from unpaid to paid.",
      },
    ],
    customerView: {
      cardTitle: "Growth Strategy · $8,500",
      cardSubtitle: "Sent by your consultant",
      fields: [
        { label: "Scope", value: "12-week engagement" },
        { label: "Deliverables", value: "Workshop · Analysis · Plan" },
      ],
      quoteLabel: "Total",
      quoteValue: "$8,500",
      statusLabel: "Client activity",
      statusValue: "Viewed 2h ago",
      note: "The client opens a secure link — no account needed. Accept, decline, or request changes, with comments on individual items.",
      quoteStatus: "sent",
    },
    faqs: [
      {
        question: "Can I keep client requirements with a proposal?",
        answer:
          "Yes. The inquiry holds the original request, attached files, and your discovery notes. The proposal is built from that same record, and every version stays on it — so the reasoning behind the scope is never lost.",
      },
      {
        question: "Can Requo handle custom service quotes?",
        answer:
          "Yes. There are no fixed packages to squeeze into: proposals are built from custom line items, so phased engagements, workshops, retainers-style scopes, and one-off advisory work are all priced the way you actually sell them.",
      },
      {
        question: "How does the client respond to a proposal?",
        answer:
          "Through a secure link — no account needed. They can accept, decline, or request changes, including comments on individual line items. You see when the proposal is viewed and every response as it happens.",
      },
      {
        question: "Can I track proposal follow-ups?",
        answer:
          "Yes. Follow-up tasks with due dates and reminders keep open proposals visible, view tracking shows when a client has seen the proposal, and eligible plans can send automatic follow-up emails while you wait on a decision.",
      },
      {
        question: "How does approved work move into invoicing?",
        answer:
          "An accepted proposal converts into an invoice without retyping the scope. Record each manual payment — cash, bank transfer, GCash, Maya, check, or other — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    related: [
      {
        slug: "creative-marketing",
        blurb:
          "Briefs, deliverables, and revisions quoted as one connected project.",
      },
      {
        slug: "events-rentals",
        blurb:
          "Dates, venues, and guest counts quoted in a single workflow.",
      },
    ],
    ctaHeadline: "Give the next client inquiry a clear path forward.",
    ctaSub:
      "Scope it once, propose it clearly, and follow it through to paid.",
    seoTitle: "Proposal Software for Professional & IT Services | Requo",
    seoDescription:
      "Turn client inquiries into scoped proposals: capture requirements, spell out deliverables, share secure links, follow up, and invoice from the approved scope.",
  },
  "creative-marketing": {
    slug: "creative-marketing",
    shortTitle: "Creative",
    headline: "From creative brief to approved project.",
    description:
      "Keep briefs, deliverables, scope, attachments, quotes, approvals, follow-ups, and billing connected from the first client message.",
    definition:
      "Quote software for creative businesses runs the brief-to-approval loop on one record: objectives, timeline, and reference assets arrive as a structured brief, each deliverable is priced on its own line, revision requests carry per-item comments, and the approved version becomes the invoice.",
    secondaryCtaLabel: "See the creative workflow",
    heroCard: {
      cardTitle: "Northstar Studio",
      cardSubtitle: "Brand Identity · $4,800",
      fields: [
        { label: "Deliverables", value: "Logo · Identity · Guidelines" },
        { label: "Timeline", value: "6 weeks" },
        { label: "Attachments", value: "4 files" },
      ],
      quoteLabel: "Quote",
      quoteValue: "$4,800",
      statusLabel: "Status",
      statusValue: "Awaiting approval",
      note: "Secure link — the client responds in one tap",
      quoteStatus: "sent",
    },
    workflow: [
      "Creative inquiry",
      "Brief",
      "Scope",
      "Quote",
      "Follow-up",
      "Approval",
      "Invoice",
      "Payment",
    ],
    demoHeadline: "One brand project. Brief to paid.",
    demoIntro:
      "One brand identity project, from brief to paid — nothing retyped.",
    demoTabs: [
      {
        id: "brief",
        label: "Brief",
        stageHeadline: "The brief arrives complete.",
        stageBody:
          "Objectives, timeline, and references land on one inquiry — the context behind the price stays attached.",
        cardTitle: "Northstar Studio",
        cardSubtitle: "Brand identity inquiry",
        fields: [
          { label: "Needs", value: "Logo · Identity · Guidelines" },
          { label: "Timeline", value: "6 weeks" },
          { label: "References", value: "4 files attached" },
        ],
        quoteLabel: "Budget signal",
        quoteValue: "$4,800",
        statusLabel: "Brief",
        statusValue: "Objectives + references in one place",
        note: "Brief, assets, and notes stay on the inquiry",
        quoteStatus: "draft",
      },
      {
        id: "quote",
        label: "Quote",
        stageHeadline: "Price it without starting over.",
        stageBody:
          "Deliverables sit on the same project — brief and assets already there. The client opens a link.",
        cardTitle: "Northstar Studio",
        cardSubtitle: "Brand Identity · $4,800",
        fields: [
          { label: "Deliverables", value: "Logo · Identity · Guidelines" },
          { label: "Timeline", value: "6 weeks · 2 revisions" },
          { label: "Terms", value: "Valid 30 days" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$4,800",
        statusLabel: "Status",
        statusValue: "Viewed · reminder set",
        note: "Secure link · per-item comments on revision requests",
        quoteStatus: "sent",
      },
      {
        id: "approval",
        label: "Approval",
        stageHeadline: "Approval locks the version.",
        stageBody:
          "Per-item comments resolve into a new version — then the client approves the exact scope, ready to invoice.",
        cardTitle: "Northstar Studio",
        cardSubtitle: "Brand Identity · $4,800",
        fields: [
          { label: "Feedback", value: "Per-item comments" },
          { label: "Revision", value: "New version sent" },
          { label: "Decision", value: "Approved" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$4,800",
        statusLabel: "Status",
        statusValue: "Approved",
        note: "Approval snapshots the exact version — then invoices",
        quoteStatus: "accepted",
      },
      {
        id: "paid",
        label: "Paid",
        stageHeadline: "Approval becomes an invoice.",
        stageBody:
          "The same deliverables become the invoice. The manual payment is recorded by hand — balance $0.",
        cardTitle: "Northstar Studio",
        cardSubtitle: "Brand Identity · paid",
        fields: [
          { label: "Quote", value: "$4,800 · approved" },
          { label: "Invoice", value: "Sent from the quote" },
          { label: "Payment", value: "Bank transfer · recorded by hand" },
        ],
        quoteLabel: "Balance due",
        quoteValue: "$0",
        statusLabel: "Payment status",
        statusValue: "Paid",
        note: "One invoice per quote · manual payments only, no pay page",
        quoteStatus: "accepted",
        invoiceStatus: "paid",
      },
    ],
    featuresHeading: "Everything around the brief.",
    featuresIntro:
      "The pieces that keep a creative project quotable — without pretending to be project-management software.",
    features: [
      {
        icon: ClipboardList,
        title: "Let clients submit a real brief",
        body: "Inquiry forms with custom fields ask for objectives, deliverables, timeline, and budget — so fewer projects start with a three-message brief and a prayer.",
      },
      {
        icon: Camera,
        title: "Keep assets with the opportunity",
        body: "Reference files, logos, and brand assets attach to the inquiry itself. When you quote, the context that justifies the price is right there.",
      },
      {
        icon: FileText,
        title: "Quote deliverables, not hours of mystery",
        body: "Each deliverable gets its own line. When the client asks for changes, revision requests arrive with per-item comments and the quote goes out as a clean new version.",
      },
      {
        icon: BellRing,
        title: "Chase approvals without the awkward",
        body: "View tracking tells you the proposal landed. Follow-up tasks and reminders — plus automatic nudges on eligible plans — keep the decision moving.",
      },
      {
        icon: Users,
        title: "Remember every client",
        body: "Past briefs and quotes from the same client group into a history view by email — so the next project starts with context instead of a blank page.",
      },
      {
        icon: ReceiptText,
        title: "Bill the approved scope",
        body: "An accepted quote becomes an invoice without retyping deliverables. Record manual payments as they arrive; the status follows from unpaid to paid.",
      },
    ],
    customerView: {
      cardTitle: "Brand Identity · $4,800",
      cardSubtitle: "Sent by your studio",
      fields: [
        { label: "Deliverables", value: "Logo · Identity · Guidelines" },
        { label: "Timeline", value: "6 weeks" },
      ],
      quoteLabel: "Total",
      quoteValue: "$4,800",
      statusLabel: "Status",
      statusValue: "Awaiting approval",
      note: "The client opens a secure link on their phone. They accept, decline, or request changes — with comments on the exact deliverable.",
      quoteStatus: "sent",
    },
    faqs: [
      {
        question: "Can clients submit creative briefs?",
        answer:
          "Yes. Public inquiry forms support custom fields for objectives, deliverables, timeline, and budget — so the brief arrives structured instead of as a few scattered messages.",
      },
      {
        question: "Can I attach project files to an inquiry?",
        answer:
          "Yes. Customers can attach reference files, logos, and brand assets to the inquiry itself, and they stay with the opportunity through quoting, revisions, and approval.",
      },
      {
        question: "Can I keep deliverables with the quote?",
        answer:
          "Yes. Each deliverable is quoted on its own line item, and every send or revision is saved as a version — so the client always sees exactly what the price covers.",
      },
      {
        question: "Can I track approval and follow-up?",
        answer:
          "Yes. View tracking shows when the proposal lands, change requests arrive with per-item comments, and follow-up tasks with reminders — plus automatic nudges on eligible plans — keep the decision from stalling.",
      },
      {
        question: "How does billing work after approval?",
        answer:
          "An accepted quote converts into an invoice without retyping the deliverables. You record each manual payment — cash, bank transfer, GCash, Maya, check, or other — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    related: [
      {
        slug: "professional-it-services",
        blurb:
          "Discovery inquiries turned into scoped, priced proposals.",
      },
      {
        slug: "photo-video",
        blurb:
          "Shoots, coverage, and deliverables quoted in one connected flow.",
      },
    ],
    ctaHeadline: "Give every project brief a clearer path to approval.",
    ctaSub:
      "Keep the brief, the assets, and the quote in one place.",
    seoTitle: "Quote Software for Creative Businesses | Requo",
    seoDescription:
      "From brief to approval: collect objectives and assets, quote deliverables line by line, handle revisions with per-item comments, and invoice the approved scope.",
  },
  "photo-video": {
    slug: "photo-video",
    shortTitle: "Photo & Video",
    headline: "Quote shoots from the facts every booking depends on.",
    description:
      "Capture shoot dates, venues, coverage hours, and deliverables on one inquiry, approve the package with the client, and follow it from first message to paid.",
    definition:
      "Photo and video quote software prices shoots from coverage, not guesswork: date, venue, hours, and deliverables land on one inquiry, line items build the package, the client approves the exact version through a secure link, and the accepted quote becomes the invoice.",
    secondaryCtaLabel: "See the shoot workflow",
    heroCard: {
      cardTitle: "Harper Wedding",
      cardSubtitle: "Full-day coverage · $3,800",
      fields: [
        { label: "Date", value: "June 14" },
        { label: "Coverage", value: "8 hours · 2 shooters" },
        { label: "Deliverables", value: "400+ edited photos" },
      ],
      quoteLabel: "Quote",
      quoteValue: "$3,800",
      statusLabel: "Status",
      statusValue: "Approved",
      note: "Package and date approved",
      quoteStatus: "accepted",
    },
    workflow: [
      "Shoot inquiry",
      "Date & coverage",
      "Package",
      "Quote",
      "Follow-up",
      "Approval",
      "Invoice",
      "Payment",
    ],
    demoHeadline: "One shoot. Inquiry to paid.",
    demoIntro:
      "One wedding booking, from inquiry to paid — nothing retyped.",
    demoTabs: [
      {
        id: "inquiry",
        label: "Shoot inquiry",
        stageHeadline: "The date arrives first.",
        stageBody:
          "Date, venue, coverage hours, and deliverables land on one inquiry — the facts every shoot quote depends on.",
        cardTitle: "Harper Wedding",
        cardSubtitle: "June 14 inquiry",
        fields: [
          { label: "Date", value: "June 14" },
          { label: "Venue", value: "Rosewood Barn" },
          { label: "Coverage", value: "8 hours · 2 shooters" },
        ],
        quoteLabel: "Deliverables asked",
        quoteValue: "400+ edited photos + album",
        statusLabel: "Requirements",
        statusValue: "Date + venue + hours upfront",
        note: "Reference photos stay on the inquiry",
        quoteStatus: "draft",
      },
      {
        id: "quote",
        label: "Quote",
        stageHeadline: "Price the package without starting over.",
        stageBody:
          "Coverage and deliverables sit on the same inquiry. The client opens a link, approves the package, and the date is theirs.",
        cardTitle: "Harper Wedding",
        cardSubtitle: "Full-day coverage · $3,800",
        fields: [
          { label: "Package", value: "Full-day coverage" },
          { label: "Rights", value: "Personal use spelled out" },
          { label: "Terms", value: "Valid 30 days" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$3,800",
        statusLabel: "Status",
        statusValue: "Viewed",
        note: "Secure link · package approval · version 1",
        quoteStatus: "sent",
      },
      {
        id: "paid",
        label: "Paid",
        stageHeadline: "Approval becomes an invoice.",
        stageBody:
          "The retainer-plus-balance schedule prefills the draft invoice. The manual payment is recorded by hand — balance $0.",
        cardTitle: "Harper Wedding",
        cardSubtitle: "Full-day coverage · paid",
        fields: [
          { label: "Quote", value: "$3,800 · approved" },
          { label: "Invoice", value: "Prefilled from the schedule" },
          { label: "Payment", value: "Bank transfer · recorded by hand" },
        ],
        quoteLabel: "Balance due",
        quoteValue: "$0",
        statusLabel: "Payment status",
        statusValue: "Paid",
        note: "One invoice per quote · manual payments only, no pay page",
        quoteStatus: "accepted",
        invoiceStatus: "paid",
      },
    ],
    featuresHeading: "Everything around the shoot inquiry.",
    featuresIntro:
      "The pieces that turn a date and a rough idea into a booked, billable shoot.",
    features: [
      {
        icon: Camera,
        title: "Collect coverage facts upfront",
        body: "Custom inquiry fields capture the shoot date, venue, coverage hours, and deliverables — plus usage rights, so the license is explicit before final files ship.",
      },
      {
        icon: CheckCircle2,
        title: "Approve the package, not a thread",
        body: "The client approves the exact package version through a secure link — or requests changes with a comment. Re-uploads become new versions, never silent edits.",
      },
      {
        icon: BellRing,
        title: "Never lose an unbooked date",
        body: "View tracking shows the quote landed. Follow-up tasks with due dates keep every pending shoot warm until the client decides.",
      },
      {
        icon: ReceiptText,
        title: "Invoice the approved shoot",
        body: "The accepted quote becomes an invoice without retyping the package, prefilled from the retainer-and-balance schedule. Record each payment by hand as it arrives. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    customerView: {
      cardTitle: "Harper Wedding · $3,800",
      cardSubtitle: "Full-day coverage package",
      fields: [
        { label: "Date", value: "June 14 · 8 hours" },
        { label: "Deliverables", value: "400+ edited photos + album" },
      ],
      quoteLabel: "Total",
      quoteValue: "$3,800",
      statusLabel: "Status",
      statusValue: "Quote viewed",
      note: "The client opens a secure link — no account needed. They approve, or request changes with a comment.",
      quoteStatus: "sent",
    },
    faqs: [
      {
        question: "How do clients approve a shoot package?",
        answer:
          "Through a secure link: they approve the exact package version, or request changes with a comment. Re-uploads and resubmissions become new versions, so the approved record never changes silently.",
      },
      {
        question: "Can I split payment into a retainer and balance?",
        answer:
          "Yes. Commercial schedules on the quote split the total into retainer, milestone, or balance items, and the accepted schedule prefills the draft invoice. Payments themselves are recorded by hand — Requo never moves money.",
      },
      {
        question: "How do payments work for shoots?",
        answer:
          "The approved quote converts into an invoice without retyping the package. Record each payment by hand as it arrives — including partial ones — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    related: [
      {
        slug: "events-rentals",
        blurb:
          "Dates, venues, and guest counts quoted in a single workflow.",
      },
      {
        slug: "creative-marketing",
        blurb:
          "Briefs, deliverables, and revisions quoted as one connected project.",
      },
    ],
    ctaHeadline: "Book the next shoot with confidence.",
    ctaSub:
      "Pin the coverage facts early, approve the package, follow it to paid.",
    seoTitle: "Photo & Video Quote Software | Requo",
    seoDescription:
      "Quote photo and video shoots with confidence: capture date, venue, and coverage, approve the exact package version, and invoice to paid.",
  },
  "events-rentals": {
    slug: "events-rentals",
    shortTitle: "Events & Rentals",
    headline: "Quote events from the date, the venue, and the count.",
    description:
      "Capture event dates, venues, and guest counts on one inquiry, confirm the final count with the organizer, and follow every event from first message to paid.",
    definition:
      "Event quote software prices the occasion from the facts every event depends on: date, venue, and guest count land on one inquiry, line items build the services, the organizer confirms the final count through a secure link, and the accepted quote becomes the invoice.",
    secondaryCtaLabel: "See the event workflow",
    heroCard: {
      cardTitle: "Corporate Event",
      cardSubtitle: "Full Production · $12,500",
      fields: [
        { label: "Date", value: "October 24" },
        { label: "Guests", value: "180" },
        { label: "Package", value: "Full Production" },
      ],
      quoteLabel: "Quote",
      quoteValue: "$12,500",
      statusLabel: "Status",
      statusValue: "Quote viewed",
      note: "Follow up before the date books out",
      quoteStatus: "sent",
    },
    workflow: [
      "Event inquiry",
      "Date & requirements",
      "Services",
      "Quote",
      "Follow-up",
      "Approval",
      "Invoice",
      "Payment",
    ],
    demoHeadline: "One event. Inquiry to paid.",
    demoIntro:
      "One corporate event, from inquiry to paid — nothing retyped.",
    demoTabs: [
      {
        id: "inquiry",
        label: "Event inquiry",
        stageHeadline: "The date arrives first.",
        stageBody:
          "Date, venue, and guest count land on one inquiry — the facts every event quote depends on.",
        cardTitle: "Corporate Event",
        cardSubtitle: "October 24 · 180 guests inquiry",
        fields: [
          { label: "Date", value: "October 24" },
          { label: "Venue", value: "Grand Hall, Riverside" },
          { label: "Guests", value: "180" },
        ],
        quoteLabel: "Services asked",
        quoteValue: "AV · Lighting · Stage",
        statusLabel: "Requirements",
        statusValue: "Date + venue + count upfront",
        note: "Setup + teardown notes stay on the inquiry",
        quoteStatus: "draft",
      },
      {
        id: "quote",
        label: "Quote",
        stageHeadline: "Price the services without starting over.",
        stageBody:
          "Services sit on the same event — date and venue already there. The organizer opens a link and confirms the final count.",
        cardTitle: "Corporate Event",
        cardSubtitle: "Full Production · $12,500",
        fields: [
          { label: "Services", value: "AV · Lighting · Stage · Setup" },
          { label: "Count", value: "180 · final-count approval" },
          { label: "Terms", value: "Valid 30 days" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$12,500",
        statusLabel: "Status",
        statusValue: "Viewed",
        note: "Secure link · count confirmation · version 1",
        quoteStatus: "sent",
      },
      {
        id: "paid",
        label: "Paid",
        stageHeadline: "Approval becomes an invoice.",
        stageBody:
          "The same services become the invoice. The manual payment is recorded by hand — balance $0.",
        cardTitle: "Corporate Event",
        cardSubtitle: "Full Production · paid",
        fields: [
          { label: "Quote", value: "$12,500 · approved" },
          { label: "Invoice", value: "Sent from the quote" },
          { label: "Payment", value: "Bank transfer · recorded by hand" },
        ],
        quoteLabel: "Balance due",
        quoteValue: "$0",
        statusLabel: "Payment status",
        statusValue: "Paid",
        note: "One invoice per quote · manual payments only, no pay page",
        quoteStatus: "accepted",
        invoiceStatus: "paid",
      },
    ],
    featuresHeading: "Everything around the event inquiry.",
    featuresIntro:
      "The pieces that turn a date and a rough idea into a priced, approved, billable event.",
    features: [
      {
        icon: CalendarDays,
        title: "Collect the date before anything else",
        body: "Custom inquiry fields capture the event date, venue, guest count, and services requested — the facts every event quote depends on.",
      },
      {
        icon: Users,
        title: "Confirm the final count, not a thread",
        body: "The organizer confirms the headcount through a secure approval link. A recount creates a new version — the confirmed count is never edited in place. Counts drive readiness and approvals, never inventory.",
      },
      {
        icon: BellRing,
        title: "Never lose an unbooked date",
        body: "View tracking shows the quote landed. Follow-up tasks with due dates keep every pending event warm until the organizer decides.",
      },
      {
        icon: ReceiptText,
        title: "Invoice the approved event",
        body: "The approved quote becomes an invoice without retyping the services. Record each payment by hand as it arrives — including partial ones — and the status follows from unpaid to paid. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    customerView: {
      cardTitle: "Corporate Event · $12,500",
      cardSubtitle: "Full Production services",
      fields: [
        { label: "Date", value: "October 24 · 180 guests" },
        { label: "Services", value: "AV · Lighting · Stage · Setup" },
      ],
      quoteLabel: "Total",
      quoteValue: "$12,500",
      statusLabel: "Status",
      statusValue: "Quote viewed",
      note: "The organizer opens a secure link — no account needed. They confirm the count, accept, decline, or request changes.",
      quoteStatus: "sent",
    },
    faqs: [
      {
        question: "How do final headcounts work?",
        answer:
          "The organizer confirms the count through a secure approval link. If the number changes, the recount creates a new approval version — history is preserved and the balance recalculates from the confirmed count. Counts never touch inventory.",
      },
      {
        question: "What happens when event details change after approval?",
        answer:
          "Changes go through change orders: the business proposes added, removed, or adjusted services, the organizer approves the delta through the same secure link family, and only approved changes join the commercial state.",
      },
      {
        question: "How do payments work for events?",
        answer:
          "The approved quote converts into an invoice without retyping the services. Record each payment by hand as it arrives — including partial ones — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    related: [
      {
        slug: "photo-video",
        blurb:
          "Shoots, coverage, and deliverables quoted in one connected flow.",
      },
      {
        slug: "contractors-home-services",
        blurb:
          "On-site work quoted from property details and photos.",
      },
    ],
    ctaHeadline: "Keep the next event opportunity moving.",
    ctaSub:
      "Pin the details early, confirm the count, follow it to paid.",
    seoTitle: "Event Quote Software | Requo",
    seoDescription:
      "Quote events with confidence: capture the date, venue, and guest count, confirm the final count, and invoice to paid.",
  },
  "custom-fabrication-signage": {
    slug: "custom-fabrication-signage",
    shortTitle: "Fabrication & Signage",
    headline: "Keep custom orders clear from request to payment.",
    description:
      "Collect the specifications, quantities, files, and details you need to quote custom fabrication and signage work — without losing the context behind the order.",
    definition:
      "Custom fabrication and signage quote software prices made-to-order work from specs, not guesswork: quantities, dimensions, materials, deadlines, and artwork files arrive on one order, options are priced line by line, the exact approved version is snapshotted, and it converts into the invoice without retyping.",
    secondaryCtaLabel: "See the custom-order workflow",
    heroCard: {
      cardTitle: "Brightline Retail",
      cardSubtitle: "Custom Signage · $1,850",
      fields: [
        { label: "Quantity", value: "24 · 24 × 36 in" },
        { label: "Material", value: "Acrylic · Matte" },
        { label: "Artwork", value: "4 files on the order" },
      ],
      quoteLabel: "Quote",
      quoteValue: "$1,850",
      statusLabel: "Status",
      statusValue: "Approved",
      note: "Specs locked — ready to invoice",
      quoteStatus: "accepted",
    },
    workflow: [
      "Order inquiry",
      "Specifications",
      "Files",
      "Quote",
      "Follow-up",
      "Approval",
      "Invoice",
      "Payment",
    ],
    demoHeadline: "One custom order. Inquiry to paid.",
    demoIntro:
      "One custom signage order, from inquiry to paid — nothing retyped.",
    demoTabs: [
      {
        id: "inquiry",
        label: "Order inquiry",
        stageHeadline: "The specs arrive complete.",
        stageBody:
          "Quantity, material, artwork, and deadline land on one order — the five facts every custom quote depends on.",
        cardTitle: "Brightline Retail",
        cardSubtitle: "Custom signage inquiry",
        fields: [
          { label: "Specs", value: "24 · 24 × 36 in · Acrylic Matte" },
          { label: "Artwork", value: "4 files attached" },
          { label: "Deadline", value: "Needed in 3 weeks" },
        ],
        quoteLabel: "Estimate basis",
        quoteValue: "$1,850",
        statusLabel: "Order",
        statusValue: "Specs + files in one place",
        note: "Quantity, size, material, and artwork stay together",
        quoteStatus: "draft",
      },
      {
        id: "quote",
        label: "Quote",
        stageHeadline: "Price it without starting over.",
        stageBody:
          "Options sit on the same order — specs and artwork already there. The buyer opens a link.",
        cardTitle: "Brightline Retail",
        cardSubtitle: "Custom Signage · $1,850",
        fields: [
          { label: "Quantity", value: "24 · 24 × 36 in" },
          { label: "Material", value: "Acrylic · Matte" },
          { label: "Terms", value: "Valid 30 days" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$1,850",
        statusLabel: "Status",
        statusValue: "Viewed",
        note: "Secure link · proof sent with the quote · version 1",
        quoteStatus: "sent",
      },
      {
        id: "approval",
        label: "Approval",
        stageHeadline: "Approval locks the specs.",
        stageBody:
          "Finish changes go out as a new version — then the buyer approves the exact specs, ready to invoice.",
        cardTitle: "Brightline Retail",
        cardSubtitle: "Custom Signage · $1,850",
        fields: [
          { label: "Revision", value: "Finish changed · v2 sent" },
          { label: "Decision", value: "Approved" },
          { label: "Specs locked", value: "Qty 24 · Acrylic · Matte" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$1,850",
        statusLabel: "Status",
        statusValue: "Approved",
        note: "Approval snapshots the exact specs — then invoices",
        quoteStatus: "accepted",
      },
      {
        id: "paid",
        label: "Paid",
        stageHeadline: "Approval becomes an invoice.",
        stageBody:
          "The same specs become the invoice. The manual payment is recorded by hand — balance $0.",
        cardTitle: "Brightline Retail",
        cardSubtitle: "Custom Signage · paid",
        fields: [
          { label: "Quote", value: "$1,850 · approved" },
          { label: "Invoice", value: "Sent from the quote" },
          { label: "Payment", value: "Bank transfer · recorded by hand" },
        ],
        quoteLabel: "Balance due",
        quoteValue: "$0",
        statusLabel: "Payment status",
        statusValue: "Paid",
        note: "One invoice per quote · manual payments only, no pay page",
        quoteStatus: "accepted",
        invoiceStatus: "paid",
      },
    ],
    featuresHeading: "Everything around the custom order.",
    featuresIntro:
      "The pieces that keep made-to-order work quotable — specs, files, and versions, together.",
    features: [
      {
        icon: Ruler,
        title: "Ask for the specs that set the price",
        body: "Custom inquiry fields collect quantity, dimensions, material, finish, and deadline — the five facts every custom quote depends on.",
      },
      {
        icon: FileText,
        title: "Keep artwork on the order",
        body: "Customers attach design files to the inquiry itself. Specs, quantities, and artwork stay together from the first message to approval.",
      },
      {
        icon: Package,
        title: "Price options as line items",
        body: "Different quantities, materials, or finishes each get their own line. When the customer changes the spec, adjust the lines and resend as a new version.",
      },
      {
        icon: CheckCircle2,
        title: "Approve the exact thing",
        body: "Change requests arrive with per-item comments. The approved version snapshots the final specs — so what gets made matches what was quoted.",
      },
      {
        icon: BellRing,
        title: "Never lose a waiting order",
        body: "View tracking shows the quote landed, and follow-up tasks with due dates keep every unapproved order warm until the buyer decides.",
      },
      {
        icon: ReceiptText,
        title: "Invoice the approved order",
        body: "The accepted quote becomes an invoice without retyping specs or quantities. Record manual payments as they arrive; the status follows to paid.",
      },
    ],
    customerView: {
      cardTitle: "Custom Signage · $1,850",
      cardSubtitle: "Qty 24 · Acrylic · Matte",
      fields: [
        { label: "Quantity", value: "24 · 24 × 36 in" },
        { label: "Material", value: "Acrylic · Matte finish" },
      ],
      quoteLabel: "Total",
      quoteValue: "$1,850",
      statusLabel: "Status",
      statusValue: "Quote viewed",
      note: "The buyer opens a secure link — no account needed. They accept, decline, or request changes on individual lines.",
      quoteStatus: "sent",
    },
    faqs: [
      {
        question: "Can customers submit artwork?",
        answer:
          "Yes. Customers can attach design files to the inquiry itself, and the files stay on the order next to the quantities, materials, and notes they belong to.",
      },
      {
        question: "Can I collect custom specifications?",
        answer:
          "Yes. Inquiry forms support custom fields for quantity, dimensions, material, finish, deadline, and anything else your quoting depends on — collected before you price, not after.",
      },
      {
        question: "Can I quote different quantities and line items?",
        answer:
          "Yes. Quotes are built from line items with quantity and unit price, so material, production, and finishing options are each priced on their own line. Spec changes go out as new versions.",
      },
      {
        question: "Can I keep artwork and order details together?",
        answer:
          "Yes. Files, specifications, quantities, and your notes live on one inquiry through quoting, revision, and approval — and past orders from the same customer group into a history view by email.",
      },
      {
        question: "How do payments work for custom orders?",
        answer:
          "An accepted quote converts into an invoice without retyping the specs. Record each manual payment — cash, bank transfer, GCash, Maya, check, or other — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    related: [
      {
        slug: "contractors-home-services",
        blurb:
          "Project inquiries with scopes, photos, and estimates that stick.",
      },
      {
        slug: "creative-marketing",
        blurb:
          "Briefs and deliverables quoted as one connected project.",
      },
    ],
    ctaHeadline: "Turn the next custom request into a clear quote.",
    ctaSub:
      "Collect the specs and files first — the price writes itself from there.",
    seoTitle: "Custom Fabrication & Signage Quotes | Requo",
    seoDescription:
      "Quote custom fabrication and signage without the guesswork: gather specs and artwork, price options line by line, approve the exact version, and track each order to payment.",
  },
};

export function getSolutionDetail(slug: string): SolutionDetail | undefined {
  return solutionDetails[slug];
}

export function getSolutionRelated(detail: SolutionDetail): readonly {
  link: SolutionLink;
  blurb: string;
}[] {
  return detail.related
    .map((item) => {
      const link = solutionLinks.find((entry) => entry.slug === item.slug);
      return link ? { link, blurb: item.blurb } : null;
    })
    .filter((entry): entry is { link: SolutionLink; blurb: string } => entry !== null);
}
