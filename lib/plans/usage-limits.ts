/**
 * Central usage-limit definitions for the Requo pricing system.
 *
 * Limits are defined per business plan. A `null` limit means unlimited.
 * Usage enforcement uses the helpers in `./usage.ts`.
 *
 * Usage is counted at the business scope. Core records (inquiries, quotes,
 * customers, accepted quotes) and manual follow-ups are intentionally not
 * capped. Automatic (unattended) follow-up emails are capped — see
 * `autoFollowUpEmailsPerDay` / `autoFollowUpEmailsPerMonth` (sending budget)
 * and `activeAutoFollowUpsPerBusiness` (how many sequences may be in flight).
 * The only account-scoped limit is `freeBusinessesPerOwner`, which
 * is enforced by `features/businesses/quota.ts`.
 */

import type { PlanTier } from "@/lib/plans/plans";

export const usageLimitKeys = [
  "aiWeightedCreditsPerMonth",
  "assistantMessagesPerDay",
  "assistantFileUploadsPerDay",
  "agentSessionsPerMonth",
  "agentFileUploadsPerDay",
  "requoDocumentEmailsPerDay",
  "requoDocumentEmailsPerMonth",
  "autoFollowUpEmailsPerDay",
  "autoFollowUpEmailsPerMonth",
  "activeAutoFollowUpsPerBusiness",
  "freeBusinessesPerOwner",
  "membersPerBusiness",
  "liveServicesPerBusiness",
  "quoteLibraryEntriesPerBusiness",
  "knowledgeSourcesPerBusiness",
  "customFieldsPerService",
  "publicInquiryAttachmentMaxBytes",
] as const;

export type UsageLimitKey = (typeof usageLimitKeys)[number];

type PlanUsageLimits = Record<UsageLimitKey, number | null>;

const planUsageLimits: Record<PlanTier, PlanUsageLimits> = {
  free: {
    aiWeightedCreditsPerMonth: 30,
    assistantMessagesPerDay: 25,
    assistantFileUploadsPerDay: 5,
    agentSessionsPerMonth: 0,
    agentFileUploadsPerDay: 5,
    requoDocumentEmailsPerDay: 3,
    requoDocumentEmailsPerMonth: 20,
    // Automatic follow-ups are a Pro+ feature, so Free never sends them.
    autoFollowUpEmailsPerDay: 0,
    autoFollowUpEmailsPerMonth: 0,
    activeAutoFollowUpsPerBusiness: 0,
    freeBusinessesPerOwner: 1,
    membersPerBusiness: 1,
    // Free supports two live services: enough to validate a second offering
    // without giving away the larger Pro portfolio.
    liveServicesPerBusiness: 2,
    quoteLibraryEntriesPerBusiness: 10,
    knowledgeSourcesPerBusiness: 5,
    customFieldsPerService: 3,
    publicInquiryAttachmentMaxBytes: 5 * 1024 * 1024,
  },
  pro: {
    aiWeightedCreditsPerMonth: 150,
    assistantMessagesPerDay: 250,
    assistantFileUploadsPerDay: 20,
    agentSessionsPerMonth: 100,
    agentFileUploadsPerDay: 20,
    requoDocumentEmailsPerDay: 20,
    requoDocumentEmailsPerMonth: 200,
    autoFollowUpEmailsPerDay: 5,
    autoFollowUpEmailsPerMonth: 50,
    activeAutoFollowUpsPerBusiness: 15,
    freeBusinessesPerOwner: null,
    membersPerBusiness: 1,
    liveServicesPerBusiness: 10,
    quoteLibraryEntriesPerBusiness: 50,
    knowledgeSourcesPerBusiness: 25,
    customFieldsPerService: 10,
    publicInquiryAttachmentMaxBytes: 25 * 1024 * 1024,
  },
  business: {
    aiWeightedCreditsPerMonth: 500,
    assistantMessagesPerDay: 1000,
    assistantFileUploadsPerDay: 50,
    agentSessionsPerMonth: 500,
    agentFileUploadsPerDay: 50,
    requoDocumentEmailsPerDay: 50,
    requoDocumentEmailsPerMonth: 500,
    autoFollowUpEmailsPerDay: 15,
    autoFollowUpEmailsPerMonth: 100,
    activeAutoFollowUpsPerBusiness: 25,
    freeBusinessesPerOwner: null,
    membersPerBusiness: 5,
    liveServicesPerBusiness: null,
    quoteLibraryEntriesPerBusiness: null,
    knowledgeSourcesPerBusiness: 50,
    customFieldsPerService: 24,
    publicInquiryAttachmentMaxBytes: 50 * 1024 * 1024,
  },
};

/**
 * Returns the usage limit for a plan and key, or `null` if unlimited.
 */
export function getUsageLimit(
  plan: PlanTier,
  key: UsageLimitKey,
): number | null {
  return planUsageLimits[plan][key];
}

/**
 * Returns `true` if the plan has a finite limit for the given key.
 */
export function isUsageLimited(
  plan: PlanTier,
  key: UsageLimitKey,
): boolean {
  return planUsageLimits[plan][key] !== null;
}

/** Human-readable labels for usage limit keys. */
export const usageLimitLabels: Record<UsageLimitKey, string> = {
  aiWeightedCreditsPerMonth: "Weighted AI credits per month",
  assistantMessagesPerDay: "Assistant messages per day",
  assistantFileUploadsPerDay: "Assistant file uploads per day",
  agentSessionsPerMonth: "Agent sessions per month",
  agentFileUploadsPerDay: "Agent file uploads per day",
  requoDocumentEmailsPerDay: "Requo email sends per day",
  requoDocumentEmailsPerMonth: "Requo email sends per month",
  autoFollowUpEmailsPerDay: "Auto follow-up emails per day",
  autoFollowUpEmailsPerMonth: "Auto follow-up emails per month",
  activeAutoFollowUpsPerBusiness: "Active auto follow-ups per business",
  freeBusinessesPerOwner: "Free businesses per owner",
  membersPerBusiness: "Members per business",
  liveServicesPerBusiness: "Live services",
  quoteLibraryEntriesPerBusiness: "Quote library entries per business",
  knowledgeSourcesPerBusiness: "Knowledge sources per business",
  customFieldsPerService: "Custom fields per service",
  publicInquiryAttachmentMaxBytes: "Public inquiry upload size",
};

export function formatUsageLimitValue(
  key: UsageLimitKey,
  value: number | null,
): string {
  if (value === null) {
    return "Unlimited";
  }

  if (key === "publicInquiryAttachmentMaxBytes") {
    const megabytes = value / (1024 * 1024);
    return `${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(1)} MB`;
  }

  return `${value}`;
}
