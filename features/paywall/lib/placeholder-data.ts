/**
 * Static placeholder data for premium content previews.
 *
 * Used by PremiumContentBlur to render blurred previews of locked features.
 * All data is hardcoded and clearly fake — no real user, business, or account
 * records are referenced.
 *
 * @see Requirements 7.2, 7.3
 */

import type { PlanFeature } from "@/lib/plans/entitlements";

// ── AI Suggestions ───────────────────────────────────────────────────────────

export type PlaceholderAiSuggestion = {
  id: string;
  title: string;
  preview: string;
};

export type PlaceholderAiQuoteDraft = {
  title: string;
  notes: string;
  items: Array<{
    description: string;
    quantity: number;
    unitPriceInCents: number;
  }>;
};

export type PlaceholderAiData = {
  suggestions: PlaceholderAiSuggestion[];
  quoteDraft: PlaceholderAiQuoteDraft;
};

export const placeholderAiData: PlaceholderAiData = {
  suggestions: [
    {
      id: "placeholder-ai-1",
      title: "Suggested reply for Acme Corp inquiry",
      preview:
        "Hi Jordan, thanks for reaching out about the kitchen renovation. Based on your timeline and budget range, I'd recommend starting with a site visit next week to…",
    },
    {
      id: "placeholder-ai-2",
      title: "Follow-up recommendation",
      preview:
        "It's been 3 days since you sent the quote to Maple & Co. Consider a friendly check-in to see if they have questions about the scope or pricing.",
    },
    {
      id: "placeholder-ai-3",
      title: "Quote pricing insight",
      preview:
        "Based on your recent accepted quotes, similar projects average $4,200. The current quote is 15% below that — consider adjusting if scope allows.",
    },
  ],
  quoteDraft: {
    title: "Website Redesign — Acme Corp",
    notes: "Includes responsive design, CMS integration, and two rounds of revisions. Timeline: 4–6 weeks from approval.",
    items: [
      { description: "Discovery & wireframes", quantity: 1, unitPriceInCents: 150_000 },
      { description: "Visual design (up to 8 pages)", quantity: 1, unitPriceInCents: 350_000 },
      { description: "Development & CMS setup", quantity: 1, unitPriceInCents: 450_000 },
      { description: "QA & launch support", quantity: 1, unitPriceInCents: 100_000 },
    ],
  },
};

// ── Reports / Exports ────────────────────────────────────────────────────────

export type PlaceholderReportRow = {
  customerName: string;
  quoteTitle: string;
  status: string;
  totalInCents: number;
  sentAt: string;
};

export type PlaceholderReportData = {
  rows: PlaceholderReportRow[];
  generatedAt: string;
};

export const placeholderReportData: PlaceholderReportData = {
  rows: [
    { customerName: "Acme Corp", quoteTitle: "Office Renovation Phase 1", status: "Accepted", totalInCents: 875_000, sentAt: "2024-10-15" },
    { customerName: "Maple & Co", quoteTitle: "Brand Identity Package", status: "Viewed", totalInCents: 420_000, sentAt: "2024-10-18" },
    { customerName: "Northwind Traders", quoteTitle: "Monthly Retainer — Q4", status: "Sent", totalInCents: 650_000, sentAt: "2024-10-22" },
    { customerName: "Contoso Ltd", quoteTitle: "Event Photography Bundle", status: "Accepted", totalInCents: 310_000, sentAt: "2024-10-25" },
    { customerName: "Fabrikam Inc", quoteTitle: "SEO Audit & Strategy", status: "Rejected", totalInCents: 280_000, sentAt: "2024-10-28" },
  ],
  generatedAt: "2024-11-01",
};

// ── Feature-scoped lookup ────────────────────────────────────────────────────

/**
 * Maps PlanFeature identifiers to their corresponding placeholder data.
 * Only features that use PremiumContentBlur have placeholder data defined.
 * Returns `null` for features that don't have blurred preview content.
 */
export type PlaceholderDataMap = {
  aiQuoteDrafting: PlaceholderAiData;
  exports: PlaceholderReportData;
};

export type PlaceholderFeature = keyof PlaceholderDataMap;

const placeholderDataMap: Record<PlaceholderFeature, PlaceholderDataMap[PlaceholderFeature]> = {
  aiQuoteDrafting: placeholderAiData,
  exports: placeholderReportData,
};

/**
 * Returns placeholder data for a given feature, or `null` if the feature
 * does not have blurred preview content.
 */
export function getPlaceholderData<F extends PlaceholderFeature>(
  feature: F,
): PlaceholderDataMap[F] {
  return placeholderDataMap[feature] as PlaceholderDataMap[F];
}

/**
 * Checks whether a feature has placeholder data available for blurred previews.
 */
export function hasPlaceholderData(feature: PlanFeature): feature is PlaceholderFeature {
  return feature in placeholderDataMap;
}
