/**
 * Analytics read models.
 *
 * Every query in `features/analytics/queries.ts` returns one of these shapes.
 * Sections render them directly; formatting and delta semantics live in
 * `features/analytics/lib/format.ts` so the same number reads identically in a
 * KPI card, a chart tooltip, and an export.
 */

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

export type AnalyticsTone = "positive" | "negative" | "warning" | "neutral" | "info";

/** One point on a bucketed trend series (day, week, or month). */
export type AnalyticsSeriesPoint = {
  /** Bucket start (YYYY-MM-DD in UTC). */
  key: string;
  /** Axis label ("May 4" or "May 26"). */
  label: string;
  visitors: number;
  formViews: number;
  inquiries: number;
  quotesSent: number;
  quotesAccepted: number;
  quotesRejected: number;
  revenueInCents: number;
  /** Comparison series, aligned by position; null when comparison is off. */
  priorVisitors: number | null;
  priorInquiries: number | null;
  priorQuotesSent: number | null;
  priorRevenueInCents: number | null;
};

export type AnalyticsFunnelStep = {
  key: string;
  label: string;
  count: number;
  /** Drill-down target, or null when there is no matching list filter. */
  href: string | null;
};

export type AnalyticsOutcomeKey = "accepted" | "rejected" | "expired" | "open" | "voided";

export type AnalyticsOutcomeSlice = {
  key: AnalyticsOutcomeKey;
  label: string;
  count: number;
  /** Share of all quotes represented in the slice list (0–1). */
  share: number;
  /** Value behind the slice, in cents; omitted when the slice has no value. */
  valueInCents?: number;
};

export type AnalyticsRankedItem = {
  label: string;
  count: number;
  /** Optional secondary value shown under the count (e.g. accepted value). */
  detail?: string;
  /** Money behind the row, in cents, when the row ranks by value. */
  valueInCents?: number;
  /** Share of the list total (0–1). */
  share: number;
  href: string | null;
};

/** The domain an attention row belongs to; picks the row's icon. */
export type AnalyticsAttentionIcon = "inquiry" | "quote" | "follow-up";

export type AnalyticsAttentionItem = {
  key: string;
  label: string;
  description: string;
  count: number;
  href: string;
  tone: AnalyticsTone;
  /** The kind of work the row points at, so the list can icon it. */
  icon: AnalyticsAttentionIcon;
};

export type AnalyticsUsageMeter = {
  key: string;
  label: string;
  used: number;
  /** null means unlimited. */
  limit: number | null;
  unit: string;
  hint: string;
  href: string | null;
  /** Feature gate that unlocks more headroom, when the plan caps at zero. */
  upgradeFeature: "autoFollowUps" | "aiAgent" | null;
};

/** A "lower is better" timing metric with an optional prior-period value. */
export type AnalyticsTimingMetric = {
  key: string;
  label: string;
  description: string;
  hours: number | null;
  priorHours: number | null;
};

export type AnalyticsAgingBucket = {
  label: string;
  count: number;
  valueInCents: number;
};

export type AnalyticsBenchmarkRow = {
  key: string;
  label: string;
  yours: number | null;
  median: number | null;
  businessCount: number | null;
  format: "percent" | "hours";
  lowerIsBetter: boolean;
};

export type AnalyticsGoalRow = {
  metricKey: string;
  label: string;
  target: number;
  current: number;
  format: "percent" | "currency" | "number";
  lowerIsBetter: boolean;
};

export type AnalyticsAnnotation = {
  id: string;
  date: string;
  label: string;
  color: string | null;
};

export type AnalyticsScheduledReport = {
  id: string;
  recipientEmails: string[];
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastSentAt: string | null;
};

export type AnalyticsCohortRow = {
  monthKey: string;
  label: string;
  size: number;
  quoted: number;
  won: number;
  conversionRate: number;
};

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

/** Aggregate values for one period (current or comparison). */
export type OverviewPeriod = {
  visitors: number;
  formViews: number;
  inquiries: number;
  inquiriesWithQuote: number;
  quotesSent: number;
  quotesViewed: number;
  /** Sent quotes the customer has responded to (accepted or rejected). */
  quotesResponded: number;
  quotesAccepted: number;
  quotesRejected: number;
  quotesExpired: number;
  /** accepted ÷ (accepted + rejected + expired). */
  winRate: number;
  /** accepted ÷ quotes sent. */
  acceptanceRate: number;
  revenueWonInCents: number;
  quotedValueInCents: number;
  collectedInCents: number;
  invoicedInCents: number;
  /** Value behind the accepted quotes, in cents. */
  acceptedValueInCents: number;
  /** Value behind the rejected quotes, in cents. */
  rejectedValueInCents: number;
  /** Value behind the expired quotes, in cents. */
  expiredValueInCents: number;
};

/** Current receivables position (a snapshot, not window-scoped). */
export type OverviewReceivables = {
  outstandingInCents: number;
  outstandingCount: number;
  overdueInCents: number;
  overdueCount: number;
};

export type OverviewData = {
  currency: string;
  current: OverviewPeriod;
  /** null for Free and all-time (no comparable prior window). */
  prior: OverviewPeriod | null;
  /** Average hours from inquiry to the first team response; null when unknown. */
  firstResponseHours: number | null;
  /** The same measure for the comparison window. */
  priorFirstResponseHours: number | null;
  series: AnalyticsSeriesPoint[];
  funnel: AnalyticsFunnelStep[];
  outcomes: AnalyticsOutcomeSlice[];
  receivables: OverviewReceivables;
  /** Outstanding invoice balances by days past due (a live snapshot). */
  arAging: AnalyticsAgingBucket[];
  attention: AnalyticsAttentionItem[];
  usage: AnalyticsUsageMeter[];
  /** False when the workspace has never recorded an inquiry or quote. */
  hasAnyActivity: boolean;
};

// ---------------------------------------------------------------------------
// Performance (Pro)
// ---------------------------------------------------------------------------

export type ServicePerformanceRow = {
  /** Service-page slug, used for the inquiries drill-down (`?form=`). */
  formSlug: string;
  name: string;
  views: number;
  visitors: number;
  inquiries: number;
  conversionRate: number;
  quotesSent: number;
  accepted: number;
  winRate: number;
  acceptedValueInCents: number;
  avgAcceptedValueInCents: number;
};

export type PerformanceData = {
  currency: string;
  series: AnalyticsSeriesPoint[];
  sources: AnalyticsRankedItem[];
  campaigns: AnalyticsRankedItem[];
  services: ServicePerformanceRow[];
  timing: AnalyticsTimingMetric[];
  quoteFunnel: AnalyticsFunnelStep[];
  aging: AnalyticsAgingBucket[];
  expiring: { count: number; valueInCents: number };
  discounts: {
    quotedCount: number;
    discountedCount: number;
    totalDiscountInCents: number;
    averageDiscountPercent: number;
  };
  values: {
    quotedInCents: number;
    acceptedInCents: number;
    rejectedInCents: number;
    expiredInCents: number;
    averageAcceptedInCents: number;
    averageInvoiceInCents: number;
    taxInCents: number;
  };
  winRates: {
    byService: AnalyticsRankedItem[];
    bySource: AnalyticsRankedItem[];
  };
  arAging: AnalyticsAgingBucket[];
  collections: {
    averageDaysToPay: number | null;
    averageDaysLate: number | null;
    onTimeCount: number;
    lateCount: number;
    partialCount: number;
  };
  paymentMix: AnalyticsRankedItem[];
  repeat: {
    newInquiries: number;
    returningInquiries: number;
    newWinRate: number;
    returningWinRate: number;
    returningRevenueInCents: number;
    revenueInCents: number;
  };
  topCustomers: AnalyticsRankedItem[];
  benchmarks: AnalyticsBenchmarkRow[];
  annotations: AnalyticsAnnotation[];
  goals: AnalyticsGoalRow[];
  scheduledReports: AnalyticsScheduledReport[];
  hasData: boolean;
};

// ---------------------------------------------------------------------------
// Operations (Pro)
// ---------------------------------------------------------------------------

export type FollowUpHealthData = {
  pending: number;
  overdue: number;
  completed: number;
  skipped: number;
  completionRate: number;
  onTimeRate: number;
  averageCompletionHours: number | null;
};

export type FollowUpCohort = {
  sent: number;
  responded: number;
  responseRate: number;
  accepted: number;
  acceptanceRate: number;
};

export type FollowUpEffectivenessData = {
  withFollowUp: FollowUpCohort;
  withoutFollowUp: FollowUpCohort;
};

export type AutomationHealthData = {
  activeSequences: number;
  activeLimit: number | null;
  emailsSent: number;
  quotesWithAttempts: number;
  attempts: AnalyticsRankedItem[];
  stopped: AnalyticsRankedItem[];
};

export type AiImpactData = {
  drafted: number;
  aiSent: number;
  aiAccepted: number;
  aiWinRate: number;
  manualSent: number;
  manualAccepted: number;
  manualWinRate: number;
  aiShare: number;
  draftToSentRate: number;
  missingInfoDetected: number;
  acknowledged: number;
  readiness: AnalyticsRankedItem[];
};

export type AgentFunnelData = {
  sessions: number;
  captured: number;
  handoffs: number;
  abandoned: number;
  active: number;
  captureRate: number;
};

export type KnowledgeData = {
  sources: number;
  limit: number | null;
  missingInfoDetected: number;
  readinessBlocked: number;
  readinessCompleted: number;
};

export type EmailDeliveryData = {
  sent: number;
  failed: number;
  pending: number;
  deliveredRate: number;
};

export type VerticalWorkflowData = {
  approvals: {
    requested: number;
    approved: number;
    changesRequested: number;
    expired: number;
    approvalRate: number;
    averageDecisionHours: number | null;
  };
  changeOrders: {
    created: number;
    approved: number;
    rejected: number;
    withdrawn: number;
    approvedValueInCents: number;
  };
  schedules: {
    created: number;
    accepted: number;
    adoptionRate: number;
    upcomingValueInCents: number;
  };
  scope: {
    blocksAdded: number;
    requiredMissing: number;
    waivers: number;
    readinessBlocked: number;
    readinessCompleted: number;
  };
};

export type OperationsData = {
  currency: string;
  followUp: FollowUpHealthData;
  effectiveness: FollowUpEffectivenessData;
  automation: AutomationHealthData;
  ai: AiImpactData;
  agent: AgentFunnelData;
  knowledge: KnowledgeData;
  email: EmailDeliveryData;
  verticals: VerticalWorkflowData;
  hasData: boolean;
};

// ---------------------------------------------------------------------------
// Team (Business)
// ---------------------------------------------------------------------------

export type TeamMemberRole = "owner" | "manager" | "staff";

export type TeamMemberRow = {
  userId: string;
  name: string;
  email: string;
  role: TeamMemberRole;
  inquiriesViewed: number;
  quotesSent: number;
  valueWonInCents: number;
  followUpsCompleted: number;
  /** null when the member has no decided quotes in the window. */
  winRate: number | null;
  /** Average hours from inquiry submission to this member's first view. */
  averageResponseHours: number | null;
  /** Inquiries first viewed after the 24h response target. */
  slaBreaches: number;
};

export type TeamData = {
  currency: string;
  members: TeamMemberRow[];
  workload: {
    openInquiries: number;
    unviewedInquiries: number;
    oldestUnviewedHours: number | null;
    pendingFollowUps: number;
  };
  sla: {
    targetHours: number;
    breachedInquiries: number;
    breachRate: number;
    byMember: AnalyticsRankedItem[];
  };
  cohorts: AnalyticsCohortRow[];
  benchmarks: AnalyticsBenchmarkRow[];
  activitySeries: {
    bucketLabels: string[];
    members: Array<{ userId: string; name: string; counts: number[] }>;
  };
};
