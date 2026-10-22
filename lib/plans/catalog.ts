/**
 * Public-safe plan catalog and pricing comparison data.
 *
 * This module contains only customer-facing metadata. Numeric limits and
 * prices are derived from the canonical plan helpers (`lib/plans/usage-limits.ts`
 * and `lib/billing/plans.ts`) so the public pricing page, the in-app plan
 * selection sheet, and the upgrade-success UI all agree exactly.
 *
 * Client-safe: no server-only imports.
 */

import type { PlanTier } from "@/lib/plans/plans";
import {
  formatUsageLimitValue,
  getUsageLimit,
  type UsageLimitKey,
} from "@/lib/plans/usage-limits";

export type PlanCatalogEntry = {
  id: PlanTier;
  label: string;
  audience: string;
  description: string;
  highlights: readonly string[];
};

export const planCatalog: Record<PlanTier, PlanCatalogEntry> = {
  free: {
    id: "free",
    label: "Free",
    audience: "Solo owners",
    description: "Run your inquiry and quote workflow for one service business.",
    highlights: [
      "Complete inquiry-to-quote workflow",
      "Unlimited inquiries, quotes, and manual sharing",
      "About 10 AI quote drafts per month",
      "15 Requo email sends per month",
      "One live service",
      "Inquiry and quote CSV exports",
    ],
  },
  pro: {
    id: "pro",
    label: "Pro",
    audience: "Solo owners who want more time back",
    description:
      "Save time with automatic follow-ups, more AI drafting, custom emails, and advanced insights.",
    highlights: [
      "Automatic follow-ups",
      "Custom email templates and Requo branding removal",
      "About 50 AI quote drafts per month",
      "200 Requo email sends per month",
      "5 live services",
      "Advanced analytics and scheduled reports",
    ],
  },
  business: {
    id: "business",
    label: "Business",
    audience: "Small teams",
    description: "Give a small team shared access, roles, and higher limits.",
    highlights: [
      "Up to 5 members with roles",
      "Audit log access",
      "About 165 AI quote drafts per month",
      "500 Requo email sends per month",
      "10 live services",
      "Unlimited pricing library",
    ],
  },
};

/** "Two months free" annual-billing promo copy. */
export const annualBillingPromoCopy = "Two months free";
/**
 * Customer-facing AI drafting allowance labels. Values correspond to
 * `aiWeightedCreditsPerMonth` divided by the `quote_draft` weight (3).
 */
export const aiDraftAllowanceLabels: Record<PlanTier, string> = {
  free: "About 10 AI quote drafts per month",
  pro: "About 50 AI quote drafts per month",
  business: "About 165 AI quote drafts per month",
};

/** Short clarification shown near the pricing comparison table. */
export const aiDraftingClarification =
  "AI drafting includes new drafts and revisions, so actual usage varies by the action performed.";

/** Extractable pricing FAQs shared by the pricing page UI and its FAQ schema. */
export const pricingFaqs = [
  {
    question: "What does a Requo subscription cost?",
    answer:
      "Free is $0. Pro is $9 per month or $90 per year. Business is $24 per month or $240 per year. Annual billing includes two months free, and paid subscriptions are billed per business.",
  },
  {
    question: "Which currency am I billed in?",
    answer:
      "Subscriptions are billed in USD through Polar. This page may show approximate local pricing for reference, but checkout and invoices use USD.",
  },
  {
    question: "Can I start free and upgrade later?",
    answer:
      "Yes. Start free with the core inquiry-to-quote workflow, then upgrade a business when you need automatic follow-ups, more live services, more AI drafting, advanced analytics, or team access.",
  },
  {
    question: "What is included in the free plan?",
    answer:
      "The core inquiry-to-quote workflow with unlimited inquiries and quotes, manual follow-up reminders, CSV exports, one live inquiry form, and about 10 AI quote drafts per month.",
  },
  {
    question: "What happens after a customer accepts a quote?",
    answer:
      "The accepted quote converts into an invoice without retyping. You send it by email and record each manual payment until the invoice shows paid. Requo tracks payment status; it does not process cards.",
  },
] as const;

/* ── Pricing comparison ───────────────────────────────────────────────────── */

export type PricingComparisonCell = string | boolean | number;

export type PricingComparisonRow = {
  label: string;
  free: PricingComparisonCell;
  pro: PricingComparisonCell;
  business: PricingComparisonCell;
};

export type PricingComparisonCategory = {
  category: string;
  features: readonly PricingComparisonRow[];
};

function limitCell(
  plan: PlanTier,
  key: UsageLimitKey,
): PricingComparisonCell {
  const value = getUsageLimit(plan, key);
  if (value === null) return "Unlimited";
  return value;
}

function attachmentCell(plan: PlanTier): PricingComparisonCell {
  return formatUsageLimitValue(
    "publicInquiryAttachmentMaxBytes",
    getUsageLimit(plan, "publicInquiryAttachmentMaxBytes"),
  );
}

function aiDraftCell(plan: PlanTier): PricingComparisonCell {
  return aiDraftAllowanceLabels[plan];
}

/**
 * Single source of truth for the marketing pricing comparison table.
 * Four sections: Core workflow, Time savings, Presentation and insights, Team.
 */
export const pricingComparison: PricingComparisonCategory[] = [
  {
    category: "Core workflow",
    features: [
      { label: "Inquiries and quotes", free: "Unlimited", pro: "Unlimited", business: "Unlimited" },
      { label: "Public inquiry submissions", free: "Unlimited", pro: "Unlimited", business: "Unlimited" },
      { label: "Public quote pages and response tracking", free: true, pro: true, business: true },
      { label: "Manual link sharing", free: "Unlimited", pro: "Unlimited", business: "Unlimited" },
      { label: "Customer history", free: true, pro: true, business: true },
      { label: "Manual follow-ups", free: true, pro: true, business: true },
      { label: "Inquiry and quote CSV exports", free: true, pro: true, business: true },
      {
        label: "Live services",
        free: limitCell("free", "liveServicesPerBusiness"),
        pro: limitCell("pro", "liveServicesPerBusiness"),
        business: limitCell("business", "liveServicesPerBusiness"),
      },
      {
        label: "Custom fields per service",
        free: limitCell("free", "customFieldsPerService"),
        pro: limitCell("pro", "customFieldsPerService"),
        business: limitCell("business", "customFieldsPerService"),
      },
      {
        label: "File upload size",
        free: attachmentCell("free"),
        pro: attachmentCell("pro"),
        business: attachmentCell("business"),
      },
    ],
  },
  {
    category: "Time savings",
    features: [
      { label: "AI quote drafting", free: aiDraftCell("free"), pro: aiDraftCell("pro"), business: aiDraftCell("business") },
      {
        label: "Requo email sends per month",
        free: limitCell("free", "requoDocumentEmailsPerMonth"),
        pro: limitCell("pro", "requoDocumentEmailsPerMonth"),
        business: limitCell("business", "requoDocumentEmailsPerMonth"),
      },
      { label: "Automatic follow-ups", free: false, pro: true, business: true },
      {
        label: "Automatic follow-up emails per month",
        free: limitCell("free", "autoFollowUpEmailsPerMonth"),
        pro: limitCell("pro", "autoFollowUpEmailsPerMonth"),
        business: limitCell("business", "autoFollowUpEmailsPerMonth"),
      },
      {
        label: "Quote library entries",
        free: limitCell("free", "quoteLibraryEntriesPerBusiness"),
        pro: limitCell("pro", "quoteLibraryEntriesPerBusiness"),
        business: limitCell("business", "quoteLibraryEntriesPerBusiness"),
      },
      {
        label: "Knowledge sources",
        free: limitCell("free", "knowledgeSourcesPerBusiness"),
        pro: limitCell("pro", "knowledgeSourcesPerBusiness"),
        business: limitCell("business", "knowledgeSourcesPerBusiness"),
      },
    ],
  },
  {
    category: "Presentation and insights",
    features: [
      { label: "Remove Requo branding", free: false, pro: true, business: true },
      { label: "Custom quote email templates", free: false, pro: true, business: true },
      { label: "Service page customization", free: false, pro: true, business: true },
      { label: "Advanced analytics", free: false, pro: true, business: true },
      { label: "Scheduled analytics reports", free: false, pro: true, business: true },
    ],
  },
  {
    category: "Team",
    features: [
      {
        label: "Members",
        free: limitCell("free", "membersPerBusiness"),
        pro: limitCell("pro", "membersPerBusiness"),
        business: `Up to ${limitCell("business", "membersPerBusiness")}`,
      },
      { label: "Roles and permissions", free: false, pro: false, business: true },
      { label: "Audit log access", free: false, pro: false, business: true },
    ],
  },
];
