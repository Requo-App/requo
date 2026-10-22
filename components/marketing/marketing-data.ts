import type { LucideIcon } from "lucide-react";
import { FileText, Inbox, Upload, Search, FileSignature, Send } from "lucide-react";

export const navItems = [
  { pathname: "/", hash: "why-requo", label: "Why Requo" },
  { pathname: "/", hash: "workflow", label: "How it works" },
  { pathname: "/", hash: "features", label: "Features" },
  { pathname: "/", hash: "faq", label: "FAQ" },
  { pathname: "/pricing", label: "Pricing" },
] as const;

export type MarketingNavItem = (typeof navItems)[number];

export function getMarketingNavHref(item: MarketingNavItem) {
  return "hash" in item
    ? {
        pathname: item.pathname,
        hash: item.hash,
      }
    : item.pathname;
}

export function getMarketingNavKey(item: MarketingNavItem) {
  return "hash" in item ? `${item.pathname}#${item.hash}` : item.pathname;
}

export const resourceLinks = [
  { label: "About", href: "/about" },
  { label: "Security", href: "/security" },
  { label: "Privacy Policy", href: "/privacy" },
  { label: "Terms of Service", href: "/terms" },
  { label: "Refund Policy", href: "/refund-policy" },
] as const;

export type ResourceLink = (typeof resourceLinks)[number];

export const whyPoints: readonly {
  icon: LucideIcon;
  title: string;
  description: string;
}[] = [
  {
    icon: Upload,
    title: "Details split fast",
    description:
      "A lead starts in email, phone, DMs, or a form. Scope, files, timing, and budget end up in different places.",
  },
  {
    icon: FileText,
    title: "Quotes slow down",
    description:
      "Before pricing, you rebuild the job story. That delay gives ready customers time to cool off or go elsewhere.",
  },
  {
    icon: Inbox,
    title: "After acceptance, nothing connects",
    description:
      "Accepted, rejected, and expired outcomes end up scattered or untracked. Context drops the moment the customer responds.",
  },
] as const;

export const workflowSteps: readonly {
  title: string;
  description: string;
  icon: LucideIcon;
}[] = [
  {
    title: "Capture",
    description: "Every inquiry in one place, nothing lost.",
    icon: Inbox,
  },
  {
    title: "Quote",
    description: "Draft and send a clear quote while the request is still warm.",
    icon: FileSignature,
  },
  {
    title: "Follow up",
    description: "Reminders and automatic follow-ups keep good opportunities moving.",
    icon: Search,
  },
  {
    title: "Win",
    description: "See what was accepted, rejected, or expired and keep every outcome organized.",
    icon: Send,
  },
] as const;

export type LandingFeatureId =
  | "inquiries"
  | "quotes"
  | "ai"
  | "invoices"
  | "followUps"
  | "analytics";

export const landingFeatureItems: readonly {
  id: LandingFeatureId;
  title: string;
  description: string;
}[] = [
  {
    id: "inquiries",
    title: "Every customer request captured.",
    description:
      "Forms, phone calls, text messages, referrals — log them all in seconds. Filter by status, search by name, and move the best ones to quote instantly.",
  },
  {
    id: "quotes",
    title: "Send quotes in minutes, not days.",
    description:
      "AI matches line items from your pricing library and past quotes. You review the draft, make adjustments, and send. Professional quotes done faster.",
  },
  {
    id: "followUps",
    title: "Follow-ups run on schedule, automatically.",
    description:
      "Create reminders for any inquiry or quote, or let Requo send automatic follow-up emails when a quote goes quiet. The system handles repetitive tasks so you can focus on closing deals.",
  },
  {
    id: "ai",
    title: "AI drafts grounded in how you work.",
    description:
      "Use your pricing library, quote templates, past quotes, and business knowledge to create a draft you can review, edit, and send. Requo keeps you in control of scope and pricing.",
  },
  {
    id: "invoices",
    title: "Turn accepted quotes into invoices.",
    description:
      "Convert an accepted quote into an invoice in one step, send it by email, and track manual payments through to paid.",
  },
  {
    id: "analytics",
    title: "See what moves from inquiry to accepted quote.",
    description:
      "Track inquiry sources, quote activity, conversion trends, response timing, and follow-up performance so you know where opportunities are getting stuck.",
  },
] as const;

export const faqItems = [
  {
    question: "What exactly does Requo do?",
    answer:
      "Requo is quote and inquiry management software for service businesses. Capture requests, draft professional quotes, send them by email or public link, track viewed and accepted status, and follow up before opportunities go cold.",
  },
  {
    question: "Do my customers need to sign up to open a quote?",
    answer:
      "No. Every quote gets a public link. Your customers open it on their phone or computer, review the details, and accept or reject with one tap. No account needed.",
  },
  {
    question: "Can I add inquiries that came from calls, DMs, or referrals?",
    answer:
      "Yes. Share your public form for inbound requests, or manually add inquiries in seconds. Include the customer name, request details, and any files. AI automatically flags potential duplicates.",
  },
  {
    question: "How does the AI quote generation work?",
    answer:
      "When you create a quote, AI pulls line items from your pricing library, past quotes, and business knowledge. You review the draft, adjust pricing or scope, and send. Confidence labels show which items were matched versus estimated.",
  },
  {
    question: "How do I know when a quote is viewed or needs a follow-up?",
    answer:
      "Every quote tracks its status: draft, sent, viewed, accepted, rejected, expired, or voided. You can create follow-up reminders for inquiries and quotes, and Pro and Business plans can automatically send follow-up emails when customers have not responded.",
  },
  {
    question: "Does Requo send emails or do I share the link myself?",
    answer:
      "Both work. Send quotes through Requo's email system, or copy the link and share via WhatsApp, text message, Messenger, or whatever channel you already use with customers.",
  },
  {
    question: "What happens after a customer accepts?",
    answer:
      "The quote is marked accepted and stays connected to the inquiry and customer details. From there you can convert it into an invoice, send it by email, and track manual payments to paid. Requo does not include job scheduling or dispatch.",
  },
  {
    question: "Can my team work inside the same business?",
    answer:
      "Yes. The Business plan supports up to five members with roles and shared access to the business, including inquiries, quotes, services, follow-ups, and analytics. Free and Pro are designed for solo owners.",
  },
  {
    question: "Can I run more than one business from one account?",
    answer:
      "Yes. One login can manage multiple businesses, with separate inquiries, quotes, forms, pricing libraries, knowledge, and branding for each. The Free plan includes one free business; additional businesses require their own paid subscription.",
  },
  {
    question: "Who is Requo for?",
    answer:
      "Requo is built for service businesses that receive custom inquiries and prepare custom-scope quotes. If customers reach out to ask for pricing before committing, and you write up a quote specific to their request, Requo helps you respond faster and follow up before they choose someone else. Appointment-first businesses with fixed services aren't the primary fit.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "Yes. Free includes the core inquiry-to-quote workflow, unlimited inquiries and quotes, manual follow-up reminders, CSV exports, one live inquiry form, and about 10 AI quote drafts per month. Upgrade when you need automatic follow-ups, more forms, advanced analytics, or team access.",
  },
  {
    question: "What does a Requo subscription cost?",
    answer:
      "Requo has three business plans. Free is $0. Pro is $9 per month or $90 per year. Business is $24 per month or $240 per year. Annual billing includes two months free. Paid subscriptions are billed per business, and the pricing page shows the current plan limits and included features.",
  },
  {
    question: "Does Requo include an Assistant or customer chat?",
    answer:
      "Yes. The owner Assistant helps members search business data, create inquiries and quotes, and review metrics inside the dashboard. Pro and Business plans also include a public customer-facing Agent that can answer questions and collect qualified inquiries from your website. AI usage is subject to plan limits.",
  },
  {
    question: "Can I use my own pricing and business knowledge?",
    answer:
      "Yes. Add reusable products, pricing entries, quote templates, and business knowledge. AI quote drafts use that context to suggest relevant line items and wording, while you review and approve every draft before sending.",
  },
  {
    question: "Can I export my inquiries and quotes?",
    answer:
      "Yes. Requo includes CSV exports for inquiries and quotes, so you can keep a copy of your operational data or analyze it elsewhere.",
  },
] as const;
