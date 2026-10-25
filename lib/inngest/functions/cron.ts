import { inngest } from "@/lib/inngest/client";
import { processExpireAgentSessions } from "@/features/agent/jobs/expire-sessions";
import { computeAnalyticsBenchmarks } from "@/features/analytics/jobs/benchmarks";
import { sendAnalyticsDigestEmails } from "@/features/analytics/jobs/digest";
import { computeDailyRollups } from "@/features/analytics/jobs/rollup";
import { sendAnalyticsScheduledReports } from "@/features/analytics/jobs/scheduled-reports";
import { processFollowUpReminders } from "@/features/follow-ups/jobs/reminders";
import { processAutomaticFollowUpSends } from "@/features/follow-ups/jobs/auto-send";
import { processAutoArchiveStaleInquiries } from "@/features/inquiries/jobs/auto-archive";
import { processInvoiceOverdue } from "@/features/invoices/jobs/overdue";
import { backfillMissingEmbeddings } from "@/features/knowledge/jobs/embedding-backfill";
import { processQuoteAutoFollowUps } from "@/features/quotes/jobs/auto-follow-ups";
import { processQuoteExpiringSoon } from "@/features/quotes/jobs/expiring-soon";
import { processQuoteViewedFollowUps } from "@/features/quotes/jobs/viewed-follow-ups";

export const followUpRemindersCron = inngest.createFunction(
  {
    id: "cron-follow-up-reminders",
    name: "Send follow-up reminders",
    triggers: [{ cron: "0 8 * * *" }],
    retries: 2,
  },
  async ({ step }) =>
    step.run("process-follow-up-reminders", async () =>
      processFollowUpReminders(),
    ),
);

/**
 * `concurrency: { limit: 1 }` keeps hourly runs from overlapping. The job
 * marks each automatic follow-up completed inside a row-locked transaction,
 * so two concurrent runs could otherwise both send the same customer email.
 */
export const followUpAutoSendCron = inngest.createFunction(
  {
    id: "cron-follow-up-auto-send",
    name: "Send automatic follow-ups",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("process-auto-send", async () =>
      processAutomaticFollowUpSends(),
    ),
);

/**
 * `concurrency: { limit: 1 }` keeps hourly runs from overlapping. The job
 * enforces per-plan auto follow-up send budgets with a read-then-decrement
 * counter, so two concurrent runs could otherwise both read the same remaining
 * budget and overshoot the allowance.
 */
export const autoFollowUpsCron = inngest.createFunction(
  {
    id: "cron-auto-follow-ups",
    name: "Send quote auto follow-ups",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("process-auto-follow-ups", async () => processQuoteAutoFollowUps()),
);

export const quoteViewedFollowUpsCron = inngest.createFunction(
  {
    id: "cron-quote-viewed-follow-ups",
    name: "Create follow-ups for viewed quotes",
    triggers: [{ cron: "0 7 * * *" }],
    retries: 2,
  },
  async ({ step }) =>
    step.run("process-viewed-follow-ups", async () =>
      processQuoteViewedFollowUps(),
    ),
);

export const quoteExpiringSoonCron = inngest.createFunction(
  {
    id: "cron-quote-expiring-soon",
    name: "Notify owners about expiring quotes",
    triggers: [{ cron: "0 8 * * *" }],
    retries: 2,
  },
  async ({ step }) =>
    step.run("process-expiring-soon", async () => processQuoteExpiringSoon()),
);

export const autoArchiveStaleInquiriesCron = inngest.createFunction(
  {
    id: "cron-auto-archive-stale-inquiries",
    name: "Archive stale inquiries",
    triggers: [{ cron: "0 3 * * *" }],
    retries: 2,
  },
  async ({ step }) =>
    step.run("process-auto-archive", async () =>
      processAutoArchiveStaleInquiries(),
    ),
);

export const analyticsRollupCron = inngest.createFunction(
  {
    id: "cron-analytics-rollup",
    name: "Compute analytics daily rollups",
    triggers: [{ cron: "0 4 * * *" }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("compute-daily-rollups", async () => computeDailyRollups()),
);

export const analyticsDigestCron = inngest.createFunction(
  {
    id: "cron-analytics-digest",
    name: "Send analytics digest emails",
    triggers: [{ cron: "0 9 * * 1" }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("send-analytics-digest", async () => sendAnalyticsDigestEmails()),
);

export const analyticsScheduledReportsCron = inngest.createFunction(
  {
    id: "cron-analytics-scheduled-reports",
    name: "Send scheduled analytics reports",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("send-scheduled-reports", async () =>
      sendAnalyticsScheduledReports(),
    ),
);

export const analyticsBenchmarksCron = inngest.createFunction(
  {
    id: "cron-analytics-benchmarks",
    name: "Compute analytics benchmarks",
    triggers: [{ cron: "0 3 1 * *" }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("compute-benchmarks", async () => computeAnalyticsBenchmarks()),
);

export const invoiceOverdueCron = inngest.createFunction(
  {
    id: "cron-invoice-overdue",
    name: "Notify owners about overdue invoices",
    triggers: [{ cron: "0 8 * * *" }],
    retries: 2,
  },
  async ({ step }) =>
    step.run("process-invoice-overdue", async () => processInvoiceOverdue()),
);

export const expireAgentSessionsCron = inngest.createFunction(
  {
    id: "cron-expire-agent-sessions",
    name: "Expire abandoned Agent sessions",
    triggers: [{ cron: "0 * * * *" }], // Hourly
    retries: 2,
  },
  async ({ step }) =>
    step.run("expire-agent-sessions", async () =>
      processExpireAgentSessions(),
    ),
);

/**
 * Repairs knowledge rows whose embedding is `null`.
 *
 * Inngest rather than Vercel Cron: this makes outbound provider calls, is
 * rate-limit prone, and needs both per-step retries and a concurrency guard —
 * unlike the simple UPDATE-only crons that were migrated to `/api/cron/*`.
 * `concurrency: { limit: 1 }` stops an hourly run from overlapping a slow one.
 */
export const embeddingBackfillCron = inngest.createFunction(
  {
    id: "cron-embedding-backfill",
    name: "Backfill missing embeddings",
    triggers: [{ cron: "0 * * * *" }],
    retries: 2,
    concurrency: { limit: 1 },
  },
  async ({ step }) =>
    step.run("backfill-missing-embeddings", async () =>
      backfillMissingEmbeddings(),
    ),
);

export const cronFunctions = [
  followUpRemindersCron,
  followUpAutoSendCron,
  autoFollowUpsCron,
  quoteViewedFollowUpsCron,
  quoteExpiringSoonCron,
  autoArchiveStaleInquiriesCron,
  invoiceOverdueCron,
  expireAgentSessionsCron,
  embeddingBackfillCron,
  analyticsRollupCron,
  analyticsDigestCron,
  analyticsScheduledReportsCron,
  analyticsBenchmarksCron,
];
