/**
 * Central feature entitlements for the Requo pricing system.
 *
 * Each feature that varies by plan is declared here. Access checks go through
 * `hasFeatureAccess` and `getRequiredPlan`; feature code should not use raw
 * plan comparisons.
 *
 * Entitlements are evaluated at the business level.
 */

import type { PlanTier } from "@/lib/plans/plans";

export const planFeatures = [
  "analyticsPerformance",
  "analyticsOperations",
  "analyticsTeam",
  "multipleServices",
  "servicePageCustomization",
  "emailTemplates",
  "aiQuoteDrafting",
  "quoteLibrary",
  "knowledgeBase",
  "exports",
  "removeWatermark",
  "followUps",
  "autoFollowUps",
  "members",
  "auditLogs",
  "agent",
  "customWorkflowRecipes",
] as const;

export type PlanFeature = (typeof planFeatures)[number];

const planEntitlements: Record<PlanTier, ReadonlySet<PlanFeature>> = {
  free: new Set<PlanFeature>([
    "followUps",
    "aiQuoteDrafting",
    "quoteLibrary",
    "knowledgeBase",
    "exports",
  ]),
  pro: new Set<PlanFeature>([
    "analyticsPerformance",
    "analyticsOperations",
    "multipleServices",
    "servicePageCustomization",
    "emailTemplates",
    "aiQuoteDrafting",
    "quoteLibrary",
    "knowledgeBase",
    "exports",
    "removeWatermark",
    "followUps",
    "autoFollowUps",
    "agent",
    "customWorkflowRecipes",
  ]),
  business: new Set<PlanFeature>([
    "analyticsPerformance",
    "analyticsOperations",
    "analyticsTeam",
    "multipleServices",
    "servicePageCustomization",
    "emailTemplates",
    "aiQuoteDrafting",
    "quoteLibrary",
    "knowledgeBase",
    "exports",
    "removeWatermark",
    "followUps",
    "autoFollowUps",
    "members",
    "auditLogs",
    "agent",
    "customWorkflowRecipes",
  ]),
};

/**
 * Checks whether a business plan grants access to a given feature.
 */
export function hasFeatureAccess(
  plan: PlanTier,
  feature: PlanFeature,
): boolean {
  return planEntitlements[plan]?.has(feature) ?? false;
}

/**
 * Returns the minimum plan required to unlock a feature, or `null` if the
 * feature is available on all plans.
 */
export function getRequiredPlan(feature: PlanFeature): PlanTier | null {
  if (planEntitlements.free.has(feature)) {
    return null;
  }

  if (planEntitlements.pro.has(feature)) {
    return "pro";
  }

  if (planEntitlements.business.has(feature)) {
    return "business";
  }

  return "business";
}

/** Human-readable label for a feature, used in upgrade UI. */
export const planFeatureLabels: Record<PlanFeature, string> = {
  analyticsPerformance: "Performance analytics",
  analyticsOperations: "Operations analytics",
  analyticsTeam: "Team analytics",
  multipleServices: "Multiple services",
  servicePageCustomization: "Service page customization",
  emailTemplates: "Email templates",
  aiQuoteDrafting: "AI quote drafting",
  quoteLibrary: "Quote library",
  knowledgeBase: "Knowledge base",
  exports: "Data exports",
  removeWatermark: "Remove Requo watermark",
  followUps: "Follow-ups",
  autoFollowUps: "Auto follow-ups",
  members: "Team members",
  auditLogs: "Audit logs",
  agent: "Agent",
  customWorkflowRecipes: "Workflow recipes",
};

/** Short value description for use in locked states. */
export const planFeatureDescriptions: Record<PlanFeature, string> = {
  analyticsPerformance:
    "Date ranges, trend comparisons, service and source breakdowns, revenue and collections, and industry benchmarks.",
  analyticsOperations:
    "Follow-up effectiveness, automation health, AI impact, agent funnels, and vertical workflow metrics.",
  analyticsTeam:
    "Per-member performance, workload balance, SLA breaches, cohorts, and team report distribution.",
  multipleServices:
    "Create additional services for different offerings or audiences.",
  servicePageCustomization:
    "Customize your public service page layout, showcase image, and supporting cards.",
  emailTemplates:
    "Customize the email message used when sending quotes through Requo.",
  aiQuoteDrafting:
    "Get AI-generated quote drafts and improvements for your inquiries.",
  quoteLibrary:
    "Build a library of reusable pricing entries and quote templates.",
  knowledgeBase:
    "Save business knowledge and files so AI quote drafts stay grounded in how you work.",
  exports:
    "Export inquiries, quotes, and invoices as CSV from your dashboard.",
  removeWatermark:
    "Remove the Requo watermark from public inquiry and quote pages.",
  followUps:
    "Create follow-up reminders to stay on top of inquiries and quotes.",
  autoFollowUps:
    "Automatically send follow-up emails when customers haven't responded to a quote.",
  members:
    "Invite team members and assign roles.",
  auditLogs:
    "Review meaningful admin, lifecycle, and security actions for this business.",
  agent:
    "Answer customer questions and collect inquiries automatically on your public site.",
  customWorkflowRecipes:
    "Customize behavior-pack recipes: intake bindings, scope requirements, approval cadences, and schedule structures.",
};