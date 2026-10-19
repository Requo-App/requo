import Link from "next/link";

import { chartSeries } from "@/features/analytics/lib/chart-theme";
import {
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/features/analytics/lib/format";
import { getFollowUpsListHref } from "@/features/analytics/lib/links";
import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import type {
  AnalyticsFunnelStep,
  AnalyticsRankedItem,
  AnalyticsUsageMeter,
  FollowUpEffectivenessData,
  OperationsData,
} from "@/features/analytics/types";
import {
  getBusinessAiSettingsPath,
  getBusinessAssistantPath,
} from "@/features/businesses/routes";

import { AnalyticsChartCard, ChartDataTable } from "../chart-card";
import { FunnelBars } from "../charts/funnel-bars";
import { LazyFollowUpComparisonChart } from "../charts/lazy-charts";
import { RankedBarList } from "../charts/ranked-bar-list";
import { AnalyticsMetricTile as MetricTile } from "../metric-tile";
import { UsageMeter } from "../meters/usage-meter";
import { AnalyticsRangeEmpty } from "../states/analytics-empty";

/**
 * Operations tab sections (Pro).
 *
 * Each export is an independent Suspense boundary over the shared
 * `getOperationsData` promise. Sections that can be individually empty
 * (automation, AI, agent, email, vertical workflows) hide their card rather
 * than render zeroes; the `OperationsEmptyGuard` covers a fully quiet range.
 */

export type OperationsSectionProps = {
  dataPromise: Promise<OperationsData>;
  businessSlug: string;
  window: AnalyticsWindow;
};

/** Renders the quiet-range state; every other section skips its card. */
export async function OperationsEmptyGuard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  if (data.hasData) return null;

  return <AnalyticsRangeEmpty />;
}

// ---------------------------------------------------------------------------
// Follow-up health
// ---------------------------------------------------------------------------

export async function OperationsFollowUpHealthCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { followUp } = data;
  const backlog = followUp.pending + followUp.completed + followUp.skipped;
  if (backlog === 0 && followUp.overdue === 0) return null;

  return (
    <AnalyticsChartCard
      title="Follow-up health"
      description="Current backlog plus everything completed or skipped in the selected period."
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Pending"
            value={formatNumber(followUp.pending)}
            caption="Still waiting to be sent"
            href={getFollowUpsListHref(props.businessSlug, { status: "pending" })}
          />
          <MetricTile
            label="Overdue"
            value={formatNumber(followUp.overdue)}
            caption="Past their scheduled date"
            tone={followUp.overdue > 0 ? "warning" : "default"}
            href={getFollowUpsListHref(props.businessSlug, {
              status: "pending",
              due: "overdue",
            })}
          />
          <MetricTile
            label="Completed"
            value={formatNumber(followUp.completed)}
            caption="Sent in this period"
            tone="positive"
            href={getFollowUpsListHref(props.businessSlug, { status: "completed" })}
          />
          <MetricTile
            label="Skipped"
            value={formatNumber(followUp.skipped)}
            caption="Ignored in this period"
            href={getFollowUpsListHref(props.businessSlug, { status: "skipped" })}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Completion rate"
            value={formatPercent(followUp.completionRate)}
            caption="Completed ÷ completed + skipped"
          />
          <MetricTile
            label="On-time rate"
            value={formatPercent(followUp.onTimeRate)}
            caption="Completed by the scheduled date"
            tone={followUp.onTimeRate >= 0.9 ? "positive" : "default"}
          />
          <MetricTile
            label="Avg time to complete"
            value={formatDuration(followUp.averageCompletionHours)}
            caption="Created → sent"
          />
        </div>
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Effectiveness
// ---------------------------------------------------------------------------

function effectivenessHeadline(data: FollowUpEffectivenessData): string {
  const { withFollowUp, withoutFollowUp } = data;

  if (withFollowUp.sent === 0 || withoutFollowUp.sent === 0) {
    return "Not enough quotes in each cohort yet to compare — effectiveness needs quotes sent both with and without a follow-up.";
  }

  if (withoutFollowUp.responseRate === 0) {
    return withFollowUp.responseRate > 0
      ? "Quotes with a follow-up are getting responses; none without one have yet in this period."
      : "Neither cohort has recorded a response yet in this period.";
  }

  const ratio = withFollowUp.responseRate / withoutFollowUp.responseRate;
  if (ratio >= 1.1) {
    return `Quotes with a follow-up get responses ${Math.round(ratio * 10) / 10}× as often in this period.`;
  }
  if (ratio <= 0.9) {
    return "Follow-up quotes are responding less often than untouched quotes in this period — worth reviewing the sequence copy and timing.";
  }
  return "Response rates are close with and without follow-ups in this period.";
}

export async function OperationsEffectivenessCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { withFollowUp, withoutFollowUp } = data.effectiveness;
  if (withFollowUp.sent + withoutFollowUp.sent === 0) return null;

  return (
    <AnalyticsChartCard
      title="Follow-up effectiveness"
      description="Quotes sent in this period, split by whether the quote or its inquiry had at least one follow-up."
    >
      <p className="text-sm text-foreground">{effectivenessHeadline(data.effectiveness)}</p>
      <div className="mt-4 flex flex-col gap-4">
        <LazyFollowUpComparisonChart
          effectiveness={data.effectiveness}
          ariaLabel="Response and acceptance rates with and without follow-ups"
        />
        <ChartDataTable
          columns={[
            { key: "cohort", header: "Cohort" },
            { key: "sent", header: "Sent", align: "end" },
            { key: "responded", header: "Responded", align: "end" },
            { key: "responseRate", header: "Response rate", align: "end" },
            { key: "accepted", header: "Accepted", align: "end" },
            { key: "acceptanceRate", header: "Acceptance", align: "end" },
          ]}
          rows={[
            {
              cohort: "With follow-up",
              sent: formatNumber(withFollowUp.sent),
              responded: formatNumber(withFollowUp.responded),
              responseRate: formatPercent(withFollowUp.responseRate),
              accepted: formatNumber(withFollowUp.accepted),
              acceptanceRate: formatPercent(withFollowUp.acceptanceRate),
            },
            {
              cohort: "Without follow-up",
              sent: formatNumber(withoutFollowUp.sent),
              responded: formatNumber(withoutFollowUp.responded),
              responseRate: formatPercent(withoutFollowUp.responseRate),
              accepted: formatNumber(withoutFollowUp.accepted),
              acceptanceRate: formatPercent(withoutFollowUp.acceptanceRate),
            },
          ]}
        />
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Automation
// ---------------------------------------------------------------------------

export async function OperationsAutomationCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { automation } = data;
  const hasAutomation =
    automation.activeSequences > 0 ||
    automation.emailsSent > 0 ||
    automation.quotesWithAttempts > 0 ||
    automation.stopped.length > 0;
  if (!hasAutomation) return null;

  return (
    <AnalyticsChartCard
      title="Automated follow-ups"
      description="Sequences that chase sent quotes until the customer responds. Attempts shown across all automated quotes."
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Active sequences"
            value={formatNumber(automation.activeSequences)}
            caption={
              automation.activeLimit === null
                ? "Unlimited on your plan"
                : `of ${formatNumber(automation.activeLimit)} allowed by your plan`
            }
          />
          <MetricTile
            label="Emails sent"
            value={formatNumber(automation.emailsSent)}
            caption={`In ${props.window.label.toLowerCase()}`}
          />
          <MetricTile
            label="Quotes with attempts"
            value={formatNumber(automation.quotesWithAttempts)}
            caption="Automated quotes with at least one send"
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">Attempts per automated quote</h3>
            <RankedBarList
              items={automation.attempts}
              barColor={chartSeries(0)}
              emptyLabel="No automated quotes yet."
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">Why sequences stopped</h3>
            <RankedBarList
              items={automation.stopped}
              barColor={chartSeries(3)}
              emptyLabel="No sequences stopped in this period."
            />
          </div>
        </div>
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// AI impact
// ---------------------------------------------------------------------------

export async function OperationsAiImpactCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { ai } = data;
  if (ai.drafted === 0 && ai.aiSent === 0 && ai.manualSent === 0) return null;

  const comparison: AnalyticsRankedItem[] = [
    {
      label: "AI-drafted quotes",
      count: Math.round(ai.aiWinRate * 100),
      share: ai.aiWinRate,
      detail: `${formatNumber(ai.aiAccepted)} won of ${formatNumber(ai.aiSent)} sent`,
      href: null,
    },
    {
      label: "Manually written quotes",
      count: Math.round(ai.manualWinRate * 100),
      share: ai.manualWinRate,
      detail: `${formatNumber(ai.manualAccepted)} won of ${formatNumber(ai.manualSent)} sent`,
      href: null,
    },
  ];

  return (
    <AnalyticsChartCard
      title="AI impact"
      description="Drafted here means the quote started from an AI draft. Win rate is accepted ÷ decided among quotes sent in this period."
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="AI drafts started"
            value={formatNumber(ai.drafted)}
            caption="Quotes created from an AI draft"
          />
          <MetricTile
            label="Draft → sent"
            value={formatPercent(ai.draftToSentRate)}
            caption="Drafts that made it out the door"
          />
          <MetricTile
            label="AI share of quotes"
            value={formatPercent(ai.aiShare)}
            caption="AI-drafted ÷ all quotes sent"
          />
          <MetricTile
            label="Missing-info flags"
            value={formatNumber(ai.missingInfoDetected)}
            caption={`${formatNumber(ai.acknowledged)} acknowledged by your team`}
            tone={ai.missingInfoDetected > 0 ? "warning" : "default"}
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">Win rate: AI vs manual</h3>
            <RankedBarList
              items={comparison}
              formatValue={(item) => formatPercent(item.share)}
              barColor={chartSeries(1)}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <h3 className="text-sm font-medium text-foreground">AI draft readiness</h3>
            <RankedBarList
              items={ai.readiness}
              barColor={chartSeries(2)}
              emptyLabel="No AI drafts in this period."
            />
          </div>
        </div>
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Assistant
// ---------------------------------------------------------------------------

export async function OperationsAgentCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { agent } = data;
  if (agent.sessions === 0) return null;

  const steps: AnalyticsFunnelStep[] = [
    { key: "sessions", label: "Conversations started", count: agent.sessions, href: null },
    { key: "captured", label: "Became inquiries", count: agent.captured, href: null },
  ];

  return (
    <AnalyticsChartCard
      title="Public assistant"
      description="Conversations the public assistant handled in this period."
      action={
        <Link
          href={getBusinessAssistantPath(props.businessSlug)}
          className="text-sm font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Open assistant
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <FunnelBars
          steps={steps}
          ariaLabel={`Assistant funnel for ${props.window.label}`}
        />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="Capture rate"
            value={formatPercent(agent.captureRate)}
            caption="Conversations that became inquiries"
          />
          <MetricTile
            label="Handed to a person"
            value={formatNumber(agent.handoffs)}
            caption="Handed off mid-conversation"
          />
          <MetricTile
            label="Abandoned"
            value={formatNumber(agent.abandoned)}
            caption="Left before an inquiry was captured"
          />
          <MetricTile
            label="Active now"
            value={formatNumber(agent.active)}
            caption="Still in progress"
          />
        </div>
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Knowledge & email
// ---------------------------------------------------------------------------

export async function OperationsKnowledgeCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { knowledge } = data;
  if (!data.hasData && knowledge.sources === 0) return null;

  const meter: AnalyticsUsageMeter = {
    key: "knowledge",
    label: "Knowledge sources",
    used: knowledge.sources,
    limit: knowledge.limit,
    unit: "sources",
    hint: "Files and memories the assistant can cite when drafting.",
    href: null,
    upgradeFeature: null,
  };

  return (
    <AnalyticsChartCard
      title="Knowledge & readiness"
      description="What the assistant knows, and how often drafts were blocked until a person confirmed details."
      action={
        <Link
          href={getBusinessAiSettingsPath(props.businessSlug)}
          className="text-sm font-medium text-primary outline-none transition-colors hover:text-primary/80 focus-visible:ring-2 focus-visible:ring-ring"
        >
          Manage knowledge
        </Link>
      }
    >
      <div className="flex flex-col gap-5">
        <UsageMeter meter={meter} />
        <div className="grid gap-3 sm:grid-cols-3">
          <MetricTile
            label="Missing info detected"
            value={formatNumber(knowledge.missingInfoDetected)}
            caption="Drafts flagged with gaps"
            tone={knowledge.missingInfoDetected > 0 ? "warning" : "default"}
          />
          <MetricTile
            label="Readiness blocks"
            value={formatNumber(knowledge.readinessBlocked)}
            caption="Awaiting confirmation before sending"
            tone={knowledge.readinessBlocked > 0 ? "warning" : "default"}
          />
          <MetricTile
            label="Confirmed"
            value={formatNumber(knowledge.readinessCompleted)}
            caption="Acknowledgements in this period"
            tone="positive"
          />
        </div>
      </div>
    </AnalyticsChartCard>
  );
}

export async function OperationsEmailCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { email } = data;
  if (email.sent + email.failed + email.pending === 0) return null;

  return (
    <AnalyticsChartCard
      title="Email delivery"
      description="Outbound emails for this period, including quote sends and automated follow-ups."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Sent"
          value={formatNumber(email.sent)}
          caption="Accepted by the mail provider"
          tone="positive"
        />
        <MetricTile
          label="Failed"
          value={formatNumber(email.failed)}
          caption="Needs a resend"
          tone={email.failed > 0 ? "negative" : "default"}
        />
        <MetricTile
          label="Pending"
          value={formatNumber(email.pending)}
          caption="Queued or in flight"
        />
        <MetricTile
          label="Delivery rate"
          value={formatPercent(email.deliveredRate)}
          caption="Sent ÷ sent + failed"
        />
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Vertical workflows
// ---------------------------------------------------------------------------

function VerticalBlock({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{ label: string; value: string; tone?: "default" | "warning" | "positive" }>;
}) {
  return (
    <div className="soft-panel flex flex-col gap-3 rounded-xl border border-border/60">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-border/60 py-2 text-sm last:border-0"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd
              className={
                row.tone === "warning"
                  ? "font-medium tabular-nums text-warning"
                  : row.tone === "positive"
                    ? "font-medium tabular-nums text-success"
                    : "font-medium tabular-nums text-foreground"
              }
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export async function OperationsVerticalsCard(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { verticals, currency } = data;
  const hasAny =
    verticals.approvals.requested > 0 ||
    verticals.changeOrders.created > 0 ||
    verticals.schedules.created > 0 ||
    verticals.scope.blocksAdded > 0 ||
    verticals.scope.requiredMissing > 0;
  if (!hasAny) return null;

  return (
    <AnalyticsChartCard
      title="Workflow packs"
      description="Approvals, change orders, payment schedules, and scope checklists — shown when your workspace uses them."
      contentClassName="gap-4"
    >
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <VerticalBlock
          title="Approvals"
          description="Customer sign-off on quotes."
          rows={[
            {
              label: "Requested",
              value: formatNumber(verticals.approvals.requested),
            },
            {
              label: "Approved",
              value: formatNumber(verticals.approvals.approved),
              tone: "positive",
            },
            {
              label: "Changes requested",
              value: formatNumber(verticals.approvals.changesRequested),
            },
            { label: "Expired", value: formatNumber(verticals.approvals.expired) },
            {
              label: "Approval rate",
              value: formatPercent(verticals.approvals.approvalRate),
            },
            {
              label: "Avg decision time",
              value: formatDuration(verticals.approvals.averageDecisionHours),
            },
          ]}
        />
        <VerticalBlock
          title="Change orders"
          description="Scope and price changes after acceptance."
          rows={[
            { label: "Created", value: formatNumber(verticals.changeOrders.created) },
            {
              label: "Approved",
              value: formatNumber(verticals.changeOrders.approved),
              tone: "positive",
            },
            { label: "Rejected", value: formatNumber(verticals.changeOrders.rejected) },
            { label: "Withdrawn", value: formatNumber(verticals.changeOrders.withdrawn) },
            {
              label: "Approved value",
              value: formatMoney(verticals.changeOrders.approvedValueInCents, currency),
            },
          ]}
        />
        <VerticalBlock
          title="Payment schedules"
          description="Milestone-based payment plans on quotes."
          rows={[
            { label: "Created", value: formatNumber(verticals.schedules.created) },
            {
              label: "Accepted",
              value: formatNumber(verticals.schedules.accepted),
              tone: "positive",
            },
            {
              label: "Adoption rate",
              value: formatPercent(verticals.schedules.adoptionRate),
            },
            {
              label: "Upcoming value",
              value: formatMoney(verticals.schedules.upcomingValueInCents, currency),
            },
          ]}
        />
        <VerticalBlock
          title="Scope checklists"
          description="Required blocks the assistant tracks per quote."
          rows={[
            { label: "Blocks added", value: formatNumber(verticals.scope.blocksAdded) },
            {
              label: "Required missing",
              value: formatNumber(verticals.scope.requiredMissing),
              tone: verticals.scope.requiredMissing > 0 ? "warning" : "default",
            },
            { label: "Waivers", value: formatNumber(verticals.scope.waivers) },
            {
              label: "Readiness blocked",
              value: formatNumber(verticals.scope.readinessBlocked),
              tone: verticals.scope.readinessBlocked > 0 ? "warning" : "default",
            },
            {
              label: "Readiness completed",
              value: formatNumber(verticals.scope.readinessCompleted),
              tone: "positive",
            },
          ]}
        />
      </div>
    </AnalyticsChartCard>
  );
}
