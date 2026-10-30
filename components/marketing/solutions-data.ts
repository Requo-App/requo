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
    description: "Remodels, repairs, and installs quoted from site facts.",
    icon: House,
  },
  {
    slug: "creative-marketing",
    title: "Creative & Marketing",
    description: "Briefs, references, and deliverables priced as one project.",
    icon: Palette,
  },
  {
    slug: "professional-it-services",
    title: "Professional & IT Services",
    description: "Discovery turned into a scoped, phased proposal.",
    icon: BriefcaseBusiness,
  },
  {
    slug: "photo-video",
    title: "Photo & Video",
    description: "Dates, coverage, and deliverables approved as one package.",
    icon: Camera,
  },
  {
    slug: "events-rentals",
    title: "Events & Rentals",
    description: "Guest counts, services, and change orders on one record.",
    icon: CalendarDays,
  },
  {
    slug: "custom-fabrication-signage",
    title: "Custom Fabrication & Signage",
    description: "Specs, artwork, and finishing options quoted line by line.",
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

export type SolutionLandingLineItem = SolutionExampleField & {
  /** Optional quantity or specification shown under a quote line item. */
  spec?: string;
};

export type SolutionLandingAttachmentImage = {
  src: string;
  width: number;
  height: number;
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

export type SolutionCustomerView = SolutionCardData;

export type SolutionLandingLinkCard = {
  icon: LucideIcon;
  title: string;
  body: string;
  href: string;
  linkLabel: string;
};

export type SolutionLandingWorkflowMock =
  | "inquiry"
  | "quote"
  | "send"
  | "follow-up"
  | "payment";

export type SolutionLandingInlineLink = {
  text: string;
  href: string;
};

export type SolutionLandingWorkflowStep = {
  id: string;
  title: string;
  body: string;
  /** Optional inline link inside `body`, e.g. "AI draft" → /features/ai. */
  inlineLink?: SolutionLandingInlineLink;
  points: readonly string[];
  /** Primary text link under the step, pointing at the matching feature page. */
  href: string;
  linkLabel: string;
  mock: SolutionLandingWorkflowMock;
};

export type SolutionLandingProofFact = {
  value: string;
  label: string;
  description: string;
};

export type SolutionTestimonial = {
  quote: string;
  name: string;
  role: string;
};

/**
 * One illustrative record shared by the hero and every workflow mock on a
 * landing page. Values are sample data, never a customer claim.
 */
export type SolutionLandingSample = {
  customer: string;
  initials: string;
  project: string;
  quoteNumber: string;
  invoiceNumber: string;
  total: string;
  lineItems: readonly SolutionLandingLineItem[];
  inquiryFields: readonly SolutionExampleField[];
  attachmentLabel: string;
  attachmentCount: string;
  attachmentTiles: readonly string[];
  /** Real sample photos for the hero inquiry, when the solution has them. */
  attachmentImages?: readonly SolutionLandingAttachmentImage[];
  attachmentSummary: string;
  quoteFooter: string;
  followUpTitle: string;
  followUpMessage: string;
  paymentMethod: string;
};

/**
 * Optional landing treatment layered over the shared solution page. Only a
 * solution with this content renders the longer page; the other solution
 * pages keep the concise shared template.
 */
export type SolutionLandingContent = {
  subhead: string;
  linkCardsHeading: string;
  linkCardsIntro: string;
  linkCards: readonly SolutionLandingLinkCard[];
  workflowHeading: string;
  workflowIntro: string;
  workflowSteps: readonly SolutionLandingWorkflowStep[];
  proofHeading: string;
  proofIntro: string;
  proofFacts: readonly SolutionLandingProofFact[];
  sample: SolutionLandingSample;
  /**
   * Data-driven on purpose. The testimonial section renders nothing until a
   * real, attributable quote exists.
   */
  testimonial?: SolutionTestimonial;
};

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
  ctaHeadline: string;
  ctaSub: string;
  seoTitle: string;
  seoDescription: string;
  /** Present only for solutions with the longer landing-page treatment. */
  landing?: SolutionLandingContent;
};

export function solutionHref(slug: string) {
  return `/solutions/${slug}`;
}

export const solutionDetails: Record<string, SolutionDetail> = {
  "contractors-home-services": {
    slug: "contractors-home-services",
    shortTitle: "Contractors",
    headline: "Requo for contractors & home services",
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
          "Each view updates the timestamp, and a due task keeps the quote visible until Sarah decides.",
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
        note: "One active invoice per accepted quote · manual payments only, no pay page",
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
        body: "Build the estimate from your quote library or custom lines. Every revision is snapshotted as a version, and expiry dates keep old prices from lingering.",
      },
      {
        icon: BellRing,
        title: "See which quotes are waiting",
        body: "Each view updates the timestamp and notifies you. Follow-up tasks with due dates and reminders keep open estimates visible until the homeowner decides.",
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
          "Yes. The contractor starter form asks for the project details, budget range, target completion, and photos or plans, and adds custom fields for service location, location type, preferred visit or start date, and access notes. Free supports 3 custom fields per service, so the fourth starter field is a Pro or Business addition. Customers can attach photos and files to the inquiry itself.",
      },
      {
        question: "Can I create quotes from project requests?",
        answer:
          "Yes. Build the quote from line items using your quote library or custom lines. AI can draft a starting point from the inquiry that you review and adjust before it goes out. When you revise a quote, the previous version is archived and the next version goes out with its own version number. You can also set an expiry date.",
      },
      {
        question: "Can I keep customer and project information together?",
        answer:
          "Yes. The inquiry holds the project details, attached photos and files, and your notes in one place. Past inquiries and quotes from the same customer are grouped into a history view by email or contact handle, so repeat work starts with context.",
      },
      {
        question: "Can I track quotes that need follow-up?",
        answer:
          "Yes. Each time a customer views a quote the timestamp updates and you are notified. Follow-up tasks with due dates and reminders keep open estimates visible, and Pro and Business plans can send automatic follow-up emails for quotes that go quiet.",
      },
      {
        question: "How do payments work for a finished job?",
        answer:
          "An accepted quote converts into an invoice without retyping. You send it from Requo and record each payment by hand — cash, bank transfer, GCash, Maya, check, or other. The invoice then shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    ctaHeadline: "Ready for the next project inquiry?",
    ctaSub:
      "Capture the request, send a clear quote, and know what needs your attention.",
    seoTitle: "Contractor Quote & Inquiry Software",
    seoDescription:
      "Turn scattered project inquiries into confident quotes: property details, photos, line-item pricing, follow-ups, invoices, and payment status in one workflow.",
    landing: {
      subhead:
        "Take the job details and site photos on one inquiry, price the work line by line, track every view, and turn the approved quote into an invoice.",
      linkCardsHeading: "Everything around the quote.",
      linkCardsIntro:
        "The pieces a contractor actually touches, from the first call to the final payment.",
      linkCards: [
        {
          icon: ClipboardList,
          title: "Inquiries",
          body: "Custom forms collect the property, scope, budget, and timeline. Photos and files stay attached to the request.",
          href: "/features/inquiries",
          linkLabel: "Learn more",
        },
        {
          icon: FileText,
          title: "Quotes",
          body: "Build from your quote library or an AI draft, adjust every price, and keep a version of every revision.",
          href: "/features/quotes",
          linkLabel: "Learn more",
        },
        {
          icon: ReceiptText,
          title: "Invoices",
          body: "Invoice the approved job, record cash, transfer, check, or e-wallet payments, and keep the balance visible on every job.",
          href: "/features/invoices",
          linkLabel: "Learn more",
        },
      ],
      workflowHeading: "One record from first call to final payment.",
      workflowIntro:
        "The same job carries through every step — nothing retyped. Sarah Jenkins' $21,400 kitchen renovation is the record in every visual below.",
      workflowSteps: [
        {
          id: "inquiry",
          title: "Get the details before you drive out",
          body: "Inquiry forms collect the property, scope, budget, and timeline. Customers attach photos and files to the same request, so measurements and images arrive with it. Pro and Business include all four starter custom fields; Free keeps the first three.",
          points: [
            "Structured project details",
            "Site, budget, and timing",
            "Photos or plans attached",
          ],
          href: "/features/inquiries",
          linkLabel: "Explore inquiries",
          mock: "inquiry",
        },
        {
          id: "quote",
          title: "Price from line items, not memory",
          body: "Build estimates from your quote library or custom lines, or start from an AI draft and adjust every price yourself. Each revision is saved as a version, and expiry dates keep old prices from lingering. Free includes about 10 AI drafts a month.",
          inlineLink: { text: "AI draft", href: "/features/ai" },
          points: [
            "Five line items total $21,400",
            "Quote library or custom lines",
            "Expiry date you control",
          ],
          href: "/features/quotes",
          linkLabel: "Explore quotes",
          mock: "quote",
        },
        {
          id: "send",
          title: "Customers respond from a link",
          body: "Email the quote or paste its secure link into WhatsApp, SMS, or Messenger. Customers open it on their phone, with no account and no app, and accept, decline, or request changes.",
          points: [
            "No account or app",
            "Per-item change requests",
            "Viewed timestamp",
          ],
          href: "/features/quotes",
          linkLabel: "Explore the customer link",
          mock: "send",
        },
        {
          id: "follow-up",
          title: "Know which quotes are waiting",
          body: "Each view updates the timestamp and notifies you. Follow-up tasks with due dates and reminders keep open quotes visible until the homeowner decides.",
          points: [
            "View timestamp and alert",
            "Tasks with due dates",
            "Automatic nudges on Pro and Business",
          ],
          href: "/features/follow-ups",
          linkLabel: "Explore follow-ups",
          mock: "follow-up",
        },
        {
          id: "payment",
          title: "Turn the approval into an invoice",
          body: "An accepted quote becomes an invoice without retyping the job. Record manual payments — cash, bank transfer, GCash, Maya, check — and the status follows: unpaid, partially paid, paid, or overdue.",
          points: [
            "One active invoice per accepted quote",
            "Manual payments only, no card processing",
            "Unpaid, partially paid, paid, overdue",
          ],
          href: "/features/invoices",
          linkLabel: "Explore invoices",
          mock: "payment",
        },
      ],
      proofHeading: "Built for the jobsite, not the inbox.",
      proofIntro:
        "The details that decide a contractor's quote — scope, photos, and the customer's decision — stay on the same record.",
      proofFacts: [
        {
          value: "3 fields",
          label: "On Free, per service",
          description:
            "The contractor starter form includes service location, location type, and preferred visit. Pro and Business add more.",
        },
        {
          value: "No account",
          label: "For the homeowner to review",
          description:
            "They open a secure link, then accept, decline, or request changes line by line — no app to install.",
        },
        {
          value: "Every version",
          label: "Of the estimate stays on record",
          description:
            "Revising archives the previous version, so the approved scope is the scope you invoice.",
        },
      ],
      sample: {
        customer: "Sarah Jenkins",
        initials: "SJ",
        project: "Kitchen Renovation",
        quoteNumber: "Q-1048",
        invoiceNumber: "INV-1048",
        total: "$21,400",
        lineItems: [
          {
            label: "Shaker cabinets + hardware",
            value: "$8,400",
            spec: "14 boxes, soft-close",
          },
          {
            label: "Quartz countertops",
            value: "$4,200",
            spec: "42 sq ft, eased edge",
          },
          {
            label: "Labor and installation",
            value: "$6,300",
            spec: "2-person crew, 6 days",
          },
          {
            label: "Plumbing and electrical",
            value: "$1,800",
            spec: "Sink, disposal, 4 circuits",
          },
          {
            label: "Debris removal",
            value: "$700",
            spec: "One 20-yard dumpster",
          },
        ],
        inquiryFields: [
          { label: "Property", value: "Single-family home" },
          { label: "Preferred start", value: "Apr 8" },
          { label: "Budget range", value: "$18–25k" },
          { label: "Target completion", value: "6 weeks" },
        ],
        attachmentLabel: "Site photos",
        attachmentCount: "3 photos",
        attachmentTiles: ["Kitchen demo", "Floor layout", "Cabinets"],
        attachmentImages: [
          {
            src: "/marketing/solutions/contractors/kitchen-demo.jpg",
            width: 320,
            height: 240,
          },
          {
            src: "/marketing/solutions/contractors/step-stool.jpg",
            width: 320,
            height: 240,
          },
          {
            src: "/marketing/solutions/contractors/cabinet-hardware.jpg",
            width: 320,
            height: 240,
          },
        ],
        attachmentSummary: "Budget range $18–25k · 3 photos",
        quoteFooter: "Secure link · expiry date you control",
        followUpTitle: "Follow up on kitchen quote",
        followUpMessage:
          "Hi Sarah — just checking in on the kitchen quote. Happy to walk through any of the line items.",
        paymentMethod: "Bank transfer",
      },
      // No testimonial is rendered until a real, attributable quote exists.
    },
  },
  "professional-it-services": {
    slug: "professional-it-services",
    shortTitle: "Professional & IT",
    headline: "Requo for professional & IT services",
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
          "Each view updates the timestamp, and a due task keeps the proposal visible until Acme decides.",
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
          "Yes. There are no fixed packages to squeeze into: proposals are built from custom line items, so phased engagements, workshops, and one-off advisory work are all priced the way you actually sell them.",
      },
      {
        question: "How does the client respond to a proposal?",
        answer:
          "Through a secure link — no account needed. They can accept, decline, or request changes, including comments on individual line items. You see when the proposal is viewed and every response on the record.",
      },
      {
        question: "Can I track proposal follow-ups?",
        answer:
          "Yes. Follow-up tasks with due dates and reminders keep open proposals visible, view tracking shows when a client has seen the proposal, and Pro and Business can send automatic follow-up emails while you wait on a decision.",
      },
      {
        question: "How does approved work move into invoicing?",
        answer:
          "An accepted proposal converts into an invoice without retyping the scope. Record each manual payment — cash, bank transfer, GCash, Maya, check, or other — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    ctaHeadline: "Give the next client inquiry a clear path forward.",
    ctaSub:
      "Scope it once, propose it clearly, and follow it through to paid.",
    seoTitle: "Proposal Software for Professional & IT Services",
    seoDescription:
      "Turn client inquiries into scoped proposals: capture requirements, spell out deliverables, share secure links, follow up, and invoice from the approved scope.",
    landing: {
      subhead:
        "Turn discovery notes into a scoped, phased proposal, keep the client's context attached, and carry the approved scope through to payment.",
      linkCardsHeading: "Everything around the proposal.",
      linkCardsIntro:
        "The pieces a client-facing team actually touches, from discovery call to final payment.",
      linkCards: [
        {
          icon: ClipboardList,
          title: "Inquiries",
          body: "Custom forms collect the challenge, format, participant count, desired start, budget, and reference files, so discovery starts with context.",
          href: "/features/inquiries",
          linkLabel: "Learn more",
        },
        {
          icon: FileText,
          title: "Proposals",
          body: "Build from your quote library or an AI draft, adjust every fee, and send a secure link the client can accept or comment on.",
          href: "/features/quotes",
          linkLabel: "Learn more",
        },
        {
          icon: ReceiptText,
          title: "Invoices",
          body: "Invoice the approved engagement, record the client's transfer, and track retainers or milestone payments.",
          href: "/features/invoices",
          linkLabel: "Learn more",
        },
      ],
      workflowHeading: "One engagement, discovery to payment.",
      workflowIntro:
        "Acme Consulting's $8,500 growth strategy stays on one record from discovery to the final manual payment. Every stage below uses the same engagement — nothing is retyped.",
      workflowSteps: [
        {
          id: "inquiry",
          title: "Start with the client's context",
          body: "The inquiry collects the challenge, preferred format, participant count, desired start, budget, and reference files. Discovery begins with the client's own words instead of a blank page.",
          points: [
            "Challenge and constraints",
            "Budget and timing",
            "Reference files attached",
          ],
          href: "/features/inquiries",
          linkLabel: "Explore inquiries",
          mock: "inquiry",
        },
        {
          id: "quote",
          title: "Price the scope line by line",
          body: "Turn the inquiry into an $8,500 proposal: discovery, analysis, workshop, roadmap, and presentation each on its own line. Start from an AI draft and adjust every fee yourself. Free includes about 10 AI drafts a month.",
          inlineLink: { text: "AI draft", href: "/features/ai" },
          points: [
            "Five deliverables, one total",
            "AI draft or custom lines",
            "Expiry date you control",
          ],
          href: "/features/quotes",
          linkLabel: "Explore proposals",
          mock: "quote",
        },
        {
          id: "send",
          title: "The client responds from a link",
          body: "Send the proposal by email or paste its secure link into chat. The client opens it on any device, with no account, and can accept, decline, or request changes.",
          points: [
            "No account or app",
            "Per-item change requests",
            "Viewed timestamp",
          ],
          href: "/features/quotes",
          linkLabel: "Explore the client link",
          mock: "send",
        },
        {
          id: "follow-up",
          title: "Know which proposals are waiting",
          body: "Each view updates the timestamp and notifies you. Follow-up tasks with due dates and reminders keep the decision visible; Pro and Business can send automatic follow-up emails.",
          points: [
            "View timestamp and alert",
            "Tasks with due dates",
            "Automatic nudges on Pro and Business",
          ],
          href: "/features/follow-ups",
          linkLabel: "Explore follow-ups",
          mock: "follow-up",
        },
        {
          id: "payment",
          title: "Turn the approval into an invoice",
          body: "The accepted scope becomes an invoice without retyping the five lines. Record the client's bank transfer by hand and the balance drops to $0.",
          points: [
            "One active invoice per accepted proposal",
            "Manual payments, including partial",
            "Unpaid, partially paid, paid, overdue",
          ],
          href: "/features/invoices",
          linkLabel: "Explore invoices",
          mock: "payment",
        },
      ],
      proofHeading: "Built for scoped engagements.",
      proofIntro:
        "Discovery, proposal, and approval stay on one record, so the scope you priced is the scope you invoice.",
      proofFacts: [
        {
          value: "6 fields",
          label: "On the consultant starter form",
          description:
            "The challenge, format, participant count, start date, budget, and reference files arrive together.",
        },
        {
          value: "10 AI drafts",
          label: "A month on Free",
          description:
            "Draft the proposal from the inquiry, then adjust every fee before it goes out.",
        },
        {
          value: "Per-line comments",
          label: "On individual deliverables",
          description:
            "The client marks up the exact line, and the revision goes out as a new version.",
        },
      ],
      sample: {
        customer: "Acme Consulting",
        initials: "AC",
        project: "Growth Strategy",
        quoteNumber: "Q-3102",
        invoiceNumber: "INV-3102",
        total: "$8,500",
        lineItems: [
          { label: "Discovery & interviews", value: "$1,500" },
          { label: "Market analysis", value: "$2,200" },
          { label: "Workshop facilitation", value: "$1,800" },
          { label: "Growth plan & roadmap", value: "$2,400" },
          { label: "Final presentation", value: "$600" },
        ],
        inquiryFields: [
          { label: "Goal", value: "Market analysis + growth plan" },
          { label: "Format", value: "Online" },
          { label: "Participants", value: "6" },
          { label: "Start", value: "Next quarter" },
        ],
        attachmentLabel: "Reference files",
        attachmentCount: "3 attached",
        attachmentTiles: ["Brief", "Data", "Notes"],
        attachmentSummary: "Budget $8–10k · 3 files",
        quoteFooter: "Secure link · valid 30 days",
        followUpTitle: "Follow up on growth strategy proposal",
        followUpMessage:
          "Hi Acme team — just checking in on the proposal. Happy to walk through the scope.",
        paymentMethod: "Bank transfer",
      },
    },
  },
  "creative-marketing": {
    slug: "creative-marketing",
    shortTitle: "Creative",
    headline: "Requo for creative & marketing studios",
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
        note: "One active invoice per accepted quote · manual payments only, no pay page",
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
        body: "View tracking tells you the proposal landed. Follow-up tasks and reminders — plus automatic nudges on Pro and Business — keep the decision moving.",
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
          "Yes. Public inquiry forms can collect the project brief, target date, where the work will be used, budget, and reference files — so the brief arrives before the first call instead of as scattered messages.",
      },
      {
        question: "Can I attach project files to an inquiry?",
        answer:
          "Yes. Customers can attach reference files, logos, and brand assets to the inquiry itself, and they stay with the opportunity through quoting, revisions, and approval.",
      },
      {
        question: "Can I keep deliverables with the quote?",
        answer:
          "Yes. Each deliverable is quoted on its own line item, and every revision is saved as a version — so the client always sees exactly what the price covers.",
      },
      {
        question: "Can I track approval and follow-up?",
        answer:
          "Yes. View tracking shows when the proposal lands, change requests arrive with per-item comments, and follow-up tasks with reminders — plus automatic nudges on Pro and Business — keep the decision from stalling.",
      },
      {
        question: "How does billing work after approval?",
        answer:
          "An accepted quote converts into an invoice without retyping the deliverables. You record each manual payment — cash, bank transfer, GCash, Maya, check, or other — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    ctaHeadline: "Give every project brief a clearer path to approval.",
    ctaSub:
      "Keep the brief, the assets, and the quote in one place.",
    seoTitle: "Quote Software for Creative & Marketing Studios",
    seoDescription:
      "From brief to approval: collect the project brief and reference files, quote each deliverable, handle revisions with comments, and invoice the approved scope.",
    landing: {
      subhead:
        "Take the brief and references on one inquiry, price each deliverable, keep every revision, and invoice the approved scope.",
      linkCardsHeading: "Everything around the brief.",
      linkCardsIntro:
        "The pieces a studio actually touches, from the first client message to the final payment.",
      linkCards: [
        {
          icon: ClipboardList,
          title: "Inquiries",
          body: "Custom forms collect the project brief, target date, where the work will be used, budget, and reference files, so the brief arrives before the first call.",
          href: "/features/inquiries",
          linkLabel: "Learn more",
        },
        {
          icon: FileText,
          title: "Quotes",
          body: "Price each deliverable on its own line, send a secure link, and keep every revision on the record.",
          href: "/features/quotes",
          linkLabel: "Learn more",
        },
        {
          icon: ReceiptText,
          title: "Invoices",
          body: "Invoice the approved scope, record the deposit and final payment, and keep the balance visible.",
          href: "/features/invoices",
          linkLabel: "Learn more",
        },
      ],
      workflowHeading: "From brief to approved, paid work.",
      workflowIntro:
        "Northstar Studio's $4,800 brand identity project stays on one record from brief to final payment. Every stage below uses the same project — nothing is retyped.",
      workflowSteps: [
        {
          id: "inquiry",
          title: "The brief arrives complete",
          body: "The inquiry captures the goal, target date, where the work will be used, budget, and reference files. The context behind the price stays attached.",
          points: [
            "Goal and audience",
            "Timing and placement",
            "Reference files attached",
          ],
          href: "/features/inquiries",
          linkLabel: "Explore inquiries",
          mock: "inquiry",
        },
        {
          id: "quote",
          title: "Price deliverables, not hours of mystery",
          body: "Build the $4,800 quote from four lines: strategy, logo, identity system, and guidelines. Start from an AI draft or your quote library and adjust every price. Free includes about 10 AI drafts a month.",
          inlineLink: { text: "AI draft", href: "/features/ai" },
          points: [
            "Four deliverables, one total",
            "Quote library or custom lines",
            "Expiry date you control",
          ],
          href: "/features/quotes",
          linkLabel: "Explore quotes",
          mock: "quote",
        },
        {
          id: "send",
          title: "The client responds from a link",
          body: "Email the quote or paste its secure link into chat. The client opens it on their phone, with no account, and can accept, decline, or request changes on individual deliverables.",
          points: [
            "No account or app",
            "Comments on individual lines",
            "Viewed timestamp",
          ],
          href: "/features/quotes",
          linkLabel: "Explore the client link",
          mock: "send",
        },
        {
          id: "follow-up",
          title: "Keep the decision moving",
          body: "Each view updates the timestamp and notifies you. Follow-up tasks with due dates keep the quote visible; Pro and Business can send automatic follow-up emails.",
          points: [
            "View timestamp and alert",
            "Tasks with due dates",
            "Automatic nudges on Pro and Business",
          ],
          href: "/features/follow-ups",
          linkLabel: "Explore follow-ups",
          mock: "follow-up",
        },
        {
          id: "payment",
          title: "Approval becomes an invoice",
          body: "The accepted quote becomes an invoice without retyping the deliverables. Record the client's bank transfer by hand and the balance drops to $0.",
          points: [
            "One active invoice per accepted quote",
            "Manual payments, including partial",
            "Unpaid, partially paid, paid, overdue",
          ],
          href: "/features/invoices",
          linkLabel: "Explore invoices",
          mock: "payment",
        },
      ],
      proofHeading: "Built for the brief.",
      proofIntro:
        "References, deliverables, and revisions stay attached to the project — not scattered across email and drive links.",
      proofFacts: [
        {
          value: "References",
          label: "Attached to the brief",
          description:
            "Moodboards, logo references, and guidelines arrive with the inquiry, not after the first call.",
        },
        {
          value: "Per deliverable",
          label: "Feedback on the exact line",
          description:
            "The client comments on a specific deliverable, and the revision goes out as a new version.",
        },
        {
          value: "No account",
          label: "For the client to approve",
          description:
            "A secure link works on any device, so approval does not wait on a login.",
        },
      ],
      sample: {
        customer: "Northstar Studio",
        initials: "NS",
        project: "Brand Identity",
        quoteNumber: "Q-2071",
        invoiceNumber: "INV-2071",
        total: "$4,800",
        lineItems: [
          { label: "Brand strategy", value: "$1,200" },
          { label: "Logo design", value: "$1,800" },
          { label: "Identity system", value: "$1,400" },
          { label: "Brand guidelines", value: "$400" },
        ],
        inquiryFields: [
          { label: "Project", value: "Brand identity" },
          { label: "Target date", value: "6 weeks" },
          { label: "Use", value: "Web · Social · Print" },
          { label: "Budget", value: "$4–6k" },
        ],
        attachmentLabel: "Reference files",
        attachmentCount: "3 attached",
        attachmentTiles: ["Moodboard", "Logo refs", "Guidelines"],
        attachmentSummary: "Budget $4–6k · 3 files",
        quoteFooter: "Secure link · revisions sent as a new version",
        followUpTitle: "Follow up on brand identity quote",
        followUpMessage:
          "Hi Northstar team — just checking in on the brand identity quote. Happy to walk through the deliverables.",
        paymentMethod: "Bank transfer",
      },
    },
  },
  "photo-video": {
    slug: "photo-video",
    shortTitle: "Photo & Video",
    headline: "Requo for photo & video studios",
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
        note: "One active invoice per accepted quote · manual payments only, no pay page",
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
        body: "The client approves the exact package version through a secure link — or requests changes with a comment. Revisions become new versions, never silent edits.",
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
          "Through a secure link: they approve the exact package version, or request changes with a comment. Revisions become new versions, so the approved record never changes silently.",
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
    ctaHeadline: "Book the next shoot with confidence.",
    ctaSub:
      "Pin the coverage facts early, approve the package, follow it to paid.",
    seoTitle: "Photo & Video Quote Software",
    seoDescription:
      "Quote photo and video shoots with confidence: capture date, venue, and coverage, approve the package through a secure link, and invoice to paid.",
    landing: {
      subhead:
        "Capture the date, venue, coverage, and deliverables up front, send a package the client can approve, and keep the booking moving to payment.",
      linkCardsHeading: "Everything around the shoot.",
      linkCardsIntro:
        "The pieces a photographer or videographer actually touches, from the first inquiry to the final payment.",
      linkCards: [
        {
          icon: ClipboardList,
          title: "Inquiries",
          body: "Custom forms collect the shoot date, venue, duration, budget, and reference files before you quote.",
          href: "/features/inquiries",
          linkLabel: "Learn more",
        },
        {
          icon: FileText,
          title: "Quotes",
          body: "Price coverage and deliverables on their own lines, send a secure link, and keep every revision on record.",
          href: "/features/quotes",
          linkLabel: "Learn more",
        },
        {
          icon: ReceiptText,
          title: "Invoices",
          body: "Invoice the booked package, record the retainer and balance, and see what's still due before the shoot.",
          href: "/features/invoices",
          linkLabel: "Learn more",
        },
      ],
      workflowHeading: "From date hold to final payment.",
      workflowIntro:
        "Harper's $3,800 full-day coverage stays on one record from inquiry to final payment. Every stage below uses the same booking — nothing is retyped.",
      workflowSteps: [
        {
          id: "inquiry",
          title: "The date arrives first",
          body: "The inquiry captures the shoot date, venue, duration, budget, and reference files. The facts every coverage quote depends on arrive together.",
          points: [
            "Date and venue",
            "Coverage length",
            "Reference files attached",
          ],
          href: "/features/inquiries",
          linkLabel: "Explore inquiries",
          mock: "inquiry",
        },
        {
          id: "quote",
          title: "Price the package from the facts",
          body: "Build the $3,800 package from coverage, edited photos, and the album. Start from an AI draft or your quote library and adjust every line. Free includes about 10 AI drafts a month.",
          inlineLink: { text: "AI draft", href: "/features/ai" },
          points: [
            "Coverage and deliverables",
            "Quote library or custom lines",
            "Expiry date you control",
          ],
          href: "/features/quotes",
          linkLabel: "Explore quotes",
          mock: "quote",
        },
        {
          id: "send",
          title: "The client approves the package",
          body: "Send the quote by email or paste its secure link into chat. The client opens it on any device, with no account, and can approve or request changes.",
          points: [
            "No account or app",
            "Comments on individual lines",
            "Viewed timestamp",
          ],
          href: "/features/quotes",
          linkLabel: "Explore the client link",
          mock: "send",
        },
        {
          id: "follow-up",
          title: "Never lose an unbooked date",
          body: "Each view updates the timestamp and notifies you. Follow-up tasks with due dates keep the date warm; Pro and Business can send automatic follow-up emails.",
          points: [
            "View timestamp and alert",
            "Tasks with due dates",
            "Automatic nudges on Pro and Business",
          ],
          href: "/features/follow-ups",
          linkLabel: "Explore follow-ups",
          mock: "follow-up",
        },
        {
          id: "payment",
          title: "The booking becomes an invoice",
          body: "The accepted quote becomes an invoice without retyping the package. Record each payment by hand — retainer, balance, or partial — and the status follows.",
          points: [
            "One active invoice per accepted quote",
            "Retainer and balance, recorded by hand",
            "Unpaid, partially paid, paid, overdue",
          ],
          href: "/features/invoices",
          linkLabel: "Explore invoices",
          mock: "payment",
        },
      ],
      proofHeading: "Built for the booking.",
      proofIntro:
        "The date, venue, coverage, and package stay on one record from inquiry to final payment.",
      proofFacts: [
        {
          value: "Date + venue",
          label: "Required on the shoot inquiry",
          description:
            "Coverage, duration, and references arrive with the request, before you price the package.",
        },
        {
          value: "Retainer or balance",
          label: "Recorded by hand",
          description:
            "Record each payment as it arrives; the invoice shows partially paid, paid, or overdue.",
        },
        {
          value: "Every revision",
          label: "Saved as a new version",
          description:
            "Changing the package archives the last version, so the booking matches the approved quote.",
        },
      ],
      sample: {
        customer: "Harper Wedding",
        initials: "HW",
        project: "Full-Day Coverage",
        quoteNumber: "Q-4188",
        invoiceNumber: "INV-4188",
        total: "$3,800",
        lineItems: [
          { label: "8 hours, 2 shooters", value: "$2,400" },
          { label: "400+ edited photos", value: "$900" },
          { label: "Album design", value: "$500" },
        ],
        inquiryFields: [
          { label: "Date", value: "June 14" },
          { label: "Venue", value: "Rosewood Barn" },
          { label: "Coverage", value: "8 hours" },
          { label: "Deliverables", value: "400+ photos + album" },
        ],
        attachmentLabel: "Reference files",
        attachmentCount: "3 attached",
        attachmentTiles: ["Venue", "Mood", "Shot list"],
        attachmentSummary: "Budget $3–5k · 3 files",
        quoteFooter: "Secure link · package approval",
        followUpTitle: "Follow up on wedding quote",
        followUpMessage:
          "Hi Harper — just checking in on the coverage quote. Happy to adjust the package.",
        paymentMethod: "Bank transfer",
      },
    },
  },
  "events-rentals": {
    slug: "events-rentals",
    shortTitle: "Events & Rentals",
    headline: "Requo for event & rental businesses",
    description:
      "Capture event dates, venues, guest counts, and budgets on one inquiry, and follow every event from first message to paid.",
    definition:
      "Event quote software prices the occasion from the facts every event depends on: date, venue, and guest count land on one inquiry, line items build the services, the organizer reviews them through a secure link, and the accepted quote becomes the invoice.",
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
          "Services sit on the same event — date and venue already there. The organizer opens a link to review the priced services and respond.",
        cardTitle: "Corporate Event",
        cardSubtitle: "Full Production · $12,500",
        fields: [
          { label: "Services", value: "AV · Lighting · Stage · Setup" },
          { label: "Guests", value: "180" },
          { label: "Terms", value: "Valid 30 days" },
        ],
        quoteLabel: "Quote",
        quoteValue: "$12,500",
        statusLabel: "Status",
        statusValue: "Viewed",
        note: "Secure link · version 1",
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
        note: "One active invoice per accepted quote · manual payments only, no pay page",
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
        title: "Keep the event details on the record",
        body: "The inquiry keeps the date, venue, duration, and guest count together. When the scope changes, the business proposes a change order and the organizer approves the delta through a secure link.",
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
      note: "The organizer opens a secure link — no account needed. They review the services, accept, decline, or request changes.",
      quoteStatus: "sent",
    },
    faqs: [
      {
        question: "How is the guest count handled?",
        answer:
          "Guest count is collected on the inquiry with the date and venue; it is the fourth starter custom field, so Free leaves it off. If it changes after approval, the business proposes updated services in a change order, and the organizer approves the delta through a secure link.",
      },
      {
        question: "What happens when event details change after approval?",
        answer:
          "Changes go through change orders: the business proposes added, removed, or adjusted services, the organizer approves the delta through a secure link, and only approved changes update the current scope and total.",
      },
      {
        question: "How do payments work for events?",
        answer:
          "The approved quote converts into an invoice without retyping the services. Record each payment by hand as it arrives — including partial ones — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    ctaHeadline: "Keep the next event opportunity moving.",
    ctaSub:
      "Pin the details early, price the services, follow it to paid.",
    seoTitle: "Event & Rental Quote Software",
    seoDescription:
      "Quote events and rentals from the date, venue, and guest count. Price services line by line, approve change orders, and track the invoice to paid.",
    landing: {
      subhead:
        "Take the date, venue, duration, and budget on one inquiry, price services and rentals line by line, and carry the approved event through to payment.",
      linkCardsHeading: "Everything around the event.",
      linkCardsIntro:
        "The pieces an event team actually touches, from the first inquiry to the final payment.",
      linkCards: [
        {
          icon: ClipboardList,
          title: "Inquiries",
          body: "Custom forms collect the date, venue, duration, budget, and reference files before you price. Guest count is a Pro and Business field.",
          href: "/features/inquiries",
          linkLabel: "Learn more",
        },
        {
          icon: FileText,
          title: "Quotes",
          body: "Price AV, lighting, rentals, and setup on their own lines, send a secure link, and keep every revision on record.",
          href: "/features/quotes",
          linkLabel: "Learn more",
        },
        {
          icon: ReceiptText,
          title: "Invoices",
          body: "Invoice the approved event, record deposits and final payments, and track what's still outstanding.",
          href: "/features/invoices",
          linkLabel: "Learn more",
        },
      ],
      workflowHeading: "From venue brief to final payment.",
      workflowIntro:
        "A $12,500 full-production event stays on one record from inquiry to final payment. Every stage below uses the same event — nothing is retyped.",
      workflowSteps: [
        {
          id: "inquiry",
          title: "The date arrives first",
          body: "The inquiry captures the event date, venue, duration, guest count, budget, and reference files. Guest count is the fourth starter custom field, so Free's three-field limit leaves it off.",
          points: [
            "Date, venue, and duration",
            "Guest count is field four",
            "Free keeps three custom fields",
          ],
          href: "/features/inquiries",
          linkLabel: "Explore inquiries",
          mock: "inquiry",
        },
        {
          id: "quote",
          title: "Price the services from the facts",
          body: "Build the $12,500 quote from stage, AV, rentals, setup, and coordination. Start from an AI draft or your quote library and adjust every line. Free includes about 10 AI drafts a month.",
          inlineLink: { text: "AI draft", href: "/features/ai" },
          points: [
            "Services and quantities",
            "Quote library or custom lines",
            "Expiry date you control",
          ],
          href: "/features/quotes",
          linkLabel: "Explore quotes",
          mock: "quote",
        },
        {
          id: "send",
          title: "The organizer responds from a link",
          body: "Email the quote or paste its secure link into chat. The organizer opens it on any device, with no account, and can accept, decline, or request changes.",
          points: [
            "No account or app",
            "Comments on individual lines",
            "Viewed timestamp",
          ],
          href: "/features/quotes",
          linkLabel: "Explore the client link",
          mock: "send",
        },
        {
          id: "follow-up",
          title: "Never lose an unbooked date",
          body: "Each view updates the timestamp and notifies you. Follow-up tasks with due dates keep the event visible; Pro and Business can send automatic follow-up emails.",
          points: [
            "View timestamp and alert",
            "Tasks with due dates",
            "Automatic nudges on Pro and Business",
          ],
          href: "/features/follow-ups",
          linkLabel: "Explore follow-ups",
          mock: "follow-up",
        },
        {
          id: "payment",
          title: "The approved event becomes an invoice",
          body: "The accepted quote becomes an invoice without retyping the services. Record each payment by hand as it arrives and the status follows.",
          points: [
            "One active invoice per accepted quote",
            "Manual payments, including partial",
            "Unpaid, partially paid, paid, overdue",
          ],
          href: "/features/invoices",
          linkLabel: "Explore invoices",
          mock: "payment",
        },
      ],
      proofHeading: "Built for the run sheet.",
      proofIntro:
        "Guest counts, services, and change orders stay on the event record from first inquiry to final payment.",
      proofFacts: [
        {
          value: "4 fields",
          label: "On the event starter form",
          description:
            "Date, venue, duration, and guest count. Free covers three custom fields per service, so guest count needs Pro.",
        },
        {
          value: "Deposits",
          label: "Recorded as manual payments",
          description:
            "Log each payment by hand and the invoice shows the remaining balance.",
        },
        {
          value: "One record",
          label: "From inquiry to settlement",
          description:
            "Services, change requests, and approvals stay on the same event.",
        },
      ],
      sample: {
        customer: "Corporate Event",
        initials: "CE",
        project: "Full Production",
        quoteNumber: "Q-5210",
        invoiceNumber: "INV-5210",
        total: "$12,500",
        lineItems: [
          { label: "Stage & backdrop", value: "$4,500" },
          { label: "AV & lighting", value: "$3,800" },
          { label: "Furniture rental", value: "$2,200" },
          { label: "Setup & teardown", value: "$1,200" },
          { label: "On-site coordination", value: "$800" },
        ],
        inquiryFields: [
          { label: "Date", value: "October 24" },
          { label: "Venue", value: "Grand Hall" },
          { label: "Duration", value: "Full day" },
          { label: "Guests", value: "180" },
        ],
        attachmentLabel: "Reference files",
        attachmentCount: "3 attached",
        attachmentTiles: ["Floorplan", "Run sheet", "Layout"],
        attachmentSummary: "Budget $10–15k · 3 files",
        quoteFooter: "Secure link · services and terms",
        followUpTitle: "Follow up on event quote",
        followUpMessage:
          "Hi team — just checking in on the event quote. Happy to walk through the services.",
        paymentMethod: "Bank transfer",
      },
    },
  },
  "custom-fabrication-signage": {
    slug: "custom-fabrication-signage",
    shortTitle: "Fabrication & Signage",
    headline: "Requo for custom fabrication & signage",
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
        note: "Secure link · specs and artwork stay on the order · version 1",
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
        note: "One active invoice per accepted quote · manual payments only, no pay page",
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
          "Yes. Inquiry forms can collect quantity, dimensions, material, finish, and deadline through custom fields, so the specs arrive before you price.",
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
          "An accepted quote converts into an invoice without retyping the quoted lines. Record each manual payment — cash, bank transfer, GCash, Maya, check, or other — and the invoice shows as unpaid, partially paid, paid, or overdue. Requo tracks payment status; it does not process cards or online payments.",
      },
    ],
    ctaHeadline: "Turn the next custom request into a clear quote.",
    ctaSub:
      "Collect the specs and files first, then price the work line by line.",
    seoTitle: "Custom Fabrication & Signage Quote Software",
    seoDescription:
      "Quote custom fabrication and signage without guesswork: gather specs and artwork, price options line by line, approve the exact version, and invoice the order.",
    landing: {
      subhead:
        "Take the specs, quantities, and artwork on one inquiry, price every material and finish option, and invoice the approved order.",
      linkCardsHeading: "Everything around the order.",
      linkCardsIntro:
        "The pieces a fabricator actually touches, from the first request to the final payment.",
      linkCards: [
        {
          icon: ClipboardList,
          title: "Inquiries",
          body: "Custom forms can collect quantity, dimensions, material, finish, deadline, and artwork files before you quote.",
          href: "/features/inquiries",
          linkLabel: "Learn more",
        },
        {
          icon: FileText,
          title: "Quotes",
          body: "Price quantities, materials, and finishing on their own lines, send a secure link, and keep every revision on record.",
          href: "/features/quotes",
          linkLabel: "Learn more",
        },
        {
          icon: ReceiptText,
          title: "Invoices",
          body: "Invoice the approved order, record the deposit and balance, and see what's still due before production.",
          href: "/features/invoices",
          linkLabel: "Learn more",
        },
      ],
      workflowHeading: "From artwork to final payment.",
      workflowIntro:
        "Brightline Retail's $1,850 signage order stays on one record from inquiry to final payment. Every stage below uses the same order — nothing is retyped.",
      workflowSteps: [
        {
          id: "inquiry",
          title: "The specs arrive complete",
          body: "Use custom fields for the specs that set the price — quantity, size, material, finish — and attach artwork to the same request. Free covers three custom fields per service; Pro and Business add more.",
          points: [
            "Quantity and dimensions",
            "Material and finish",
            "Artwork files attached",
          ],
          href: "/features/inquiries",
          linkLabel: "Explore inquiries",
          mock: "inquiry",
        },
        {
          id: "quote",
          title: "Price every option",
          body: "Build the $1,850 order from panels, print and mounting, artwork prep, and delivery. Start from an AI draft or your quote library and adjust every line. Free includes about 10 AI drafts a month.",
          inlineLink: { text: "AI draft", href: "/features/ai" },
          points: [
            "Options and quantities",
            "Quote library or custom lines",
            "Expiry date you control",
          ],
          href: "/features/quotes",
          linkLabel: "Explore quotes",
          mock: "quote",
        },
        {
          id: "send",
          title: "The buyer approves the exact quote version",
          body: "Email the quote or paste its secure link into chat. The buyer opens it on any device, with no account, and can accept, decline, or request changes.",
          points: [
            "No account or app",
            "Comments on individual lines",
            "Viewed timestamp",
          ],
          href: "/features/quotes",
          linkLabel: "Explore the client link",
          mock: "send",
        },
        {
          id: "follow-up",
          title: "Never lose a waiting order",
          body: "Each view updates the timestamp and notifies you. Follow-up tasks with due dates keep the order visible; Pro and Business can send automatic follow-up emails.",
          points: [
            "View timestamp and alert",
            "Tasks with due dates",
            "Automatic nudges on Pro and Business",
          ],
          href: "/features/follow-ups",
          linkLabel: "Explore follow-ups",
          mock: "follow-up",
        },
        {
          id: "payment",
          title: "The approved order becomes an invoice",
          body: "The accepted quote becomes an invoice without retyping the line items. Record each payment by hand as it arrives and the status follows.",
          points: [
            "One active invoice per accepted quote",
            "Manual payments, including partial",
            "Unpaid, partially paid, paid, overdue",
          ],
          href: "/features/invoices",
          linkLabel: "Explore invoices",
          mock: "payment",
        },
      ],
      proofHeading: "Built for made-to-order.",
      proofIntro:
        "Specs, artwork, and finishing options stay attached to the order from first request to final payment.",
      proofFacts: [
        {
          value: "Artwork",
          label: "Attached to the inquiry",
          description:
            "Logo files, proofs, and spec sheets arrive with the request instead of in a separate email.",
        },
        {
          value: "Per-line options",
          label: "Materials, print, and finishing",
          description:
            "Each option keeps its own quantity and price, so the approved version is the version you build.",
        },
        {
          value: "Every version",
          label: "Of the quote stays on record",
          description:
            "Revising archives the previous version, so the approved spec is the spec you invoice.",
        },
      ],
      sample: {
        customer: "Brightline Retail",
        initials: "BR",
        project: "Custom Signage",
        quoteNumber: "Q-6314",
        invoiceNumber: "INV-6314",
        total: "$1,850",
        lineItems: [
          { label: "24 acrylic panels", value: "$1,200" },
          { label: "Print & mounting", value: "$350" },
          { label: "Artwork prep", value: "$200" },
          { label: "Packaging & delivery", value: "$100" },
        ],
        inquiryFields: [
          { label: "Quantity", value: "24" },
          { label: "Size", value: "24 × 36 in" },
          { label: "Material", value: "Acrylic" },
          { label: "Finish", value: "Matte" },
        ],
        attachmentLabel: "Artwork files",
        attachmentCount: "3 attached",
        attachmentTiles: ["Logo", "Proof", "Spec sheet"],
        attachmentSummary: "Qty 24 · 3 files",
        quoteFooter: "Secure link · specs stay on the order",
        followUpTitle: "Follow up on signage quote",
        followUpMessage:
          "Hi team — just checking in on the signage quote. Happy to review the proof.",
        paymentMethod: "Bank transfer",
      },
    },
  },
};

export function getSolutionDetail(slug: string): SolutionDetail | undefined {
  return solutionDetails[slug];
}
