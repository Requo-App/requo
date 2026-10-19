import Link from "next/link";

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
  AnalyticsUsageMeter,
  FollowUpEffectivenessData,
  OperationsData,
} from "@/features/analytics/types";
import {
  getBusinessAiSettingsPath,
  getBusinessAssistantPath,
} from "@/features/businesses/routes";

import { AnalyticsCard } from "../primitives/analytics-card";
import { AnalyticsChartCard } from "../primitives/analytics-chart-card";
import {
  AnalyticsRow,
  analyticsCol,
} from "../primitives/analytics-section";
import { BarList, type BarListItem } from "../primitives/bar-list";
import { DataTable } from "../primitives/data-table";
import { Funnel } from "../primitives/funnel";
import { Stat, StatGrid } from "../primitives/stat";
import { UsageMeter } from "../primitives/usage-meter";
import { LazyFollowUpComparisonChart } from "../charts/lazy-charts";
import { AnalyticsRangeEmpty } from "../states/analytics-empty";

/**
 * Operations tab sections (Pro).
 *
 * Each export is an independent Suspense boundary over the shared
 * `getOperationsData` promise. Sections that can be individually empty
 * (automation, AI, agent, email, vertical workflows) hide their card rather
 * than render zeroes; the `OperationsEmptyGuard` covers a fully quiet range.
 *
 * Rows are symmetric: two cards of six columns each.
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
// Follow-up health and effectiveness
// ---------------------------------------------------------------------------

export async function OperationsFollowUpRow(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { followUp } = data;
  const backlog = followUp.pending + followUp.completed + followUp.skipped;
  const hasHealth = backlog > 0 || followUp.overdue > 0;
  const { withFollowUp, withoutFollowUp } = data.effectiveness;
  const hasEffectiveness = withFollowUp.sent + withoutFollowUp.sent > 0;

  if (!hasHealth && !hasEffectiveness) return null;

  return (
    <AnalyticsRow>
      {hasHealth ? (
        <AnalyticsCard
          className={analyticsCol(hasEffectiveness ? 6 : 12)}
          title="Follow-up health"
          description="Current backlog plus everything completed or skipped in the selected period."
        >
          <StatGrid columns={2}>
            <Stat
              label="Pending"
              value={formatNumber(followUp.pending)}
              caption="Still waiting to be sent"
              href={getFollowUpsListHref(props.businessSlug, { status: "pending" })}
            />
            <Stat
              label="Overdue"
              value={formatNumber(followUp.overdue)}
              caption="Past their scheduled date"
              valueClassName={followUp.overdue > 0 ? "text-warning" : undefined}
              href={getFollowUpsListHref(props.businessSlug, {
                status: "pending",
                due: "overdue",
              })}
            />
            <Stat
              label="Completed"
              value={formatNumber(followUp.completed)}
              caption="Sent in this period"
              valueClassName="text-success"
              href={getFollowUpsListHref(props.businessSlug, { status: "completed" })}
            />
            <Stat
              label="Skipped"
              value={formatNumber(followUp.skipped)}
              caption="Ignored in this period"
              href={getFollowUpsListHref(props.businessSlug, { status: "skipped" })}
            />
          </StatGrid>

          <StatGrid columns={3}>
            <Stat
              label="Completion rate"
              value={formatPercent(followUp.completionRate)}
              caption="Completed ÷ completed + skipped"
            />
            <Stat
              label="On-time rate"
              value={formatPercent(followUp.onTimeRate)}
              caption="Completed by the scheduled date"
              valueClassName={
                followUp.onTimeRate >= 0.9 ? "text-success" : undefined
              }
            />
            <Stat
              label="Avg time to complete"
              value={formatDuration(followUp.averageCompletionHours)}
              caption="Created → sent"
            />
          </StatGrid>
        </AnalyticsCard>
      ) : null}

      {hasEffectiveness ? (
        <AnalyticsChartCard
          className={analyticsCol(hasHealth ? 6 : 12)}
          title="Follow-up effectiveness"
          description="Quotes sent in this period, split by whether the quote or its inquiry had at least one follow-up."
          chart={
            <div className="flex flex-col gap-4">
              <p className="text-sm text-foreground">
                {effectivenessHeadline(data.effectiveness)}
              </p>
              <LazyFollowUpComparisonChart
                effectiveness={data.effectiveness}
                ariaLabel="Response and acceptance rates with and without follow-ups"
              />
            </div>
          }
          table={
            <DataTable
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
          }
        />
      ) : null}
    </AnalyticsRow>
  );
}

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

// ---------------------------------------------------------------------------
// Automation and AI impact
// ---------------------------------------------------------------------------

export async function OperationsAutomationRow(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { automation, ai } = data;
  const hasAutomation =
    automation.activeSequences > 0 ||
    automation.emailsSent > 0 ||
    automation.quotesWithAttempts > 0 ||
    automation.stopped.length > 0;
  const hasAi = ai.drafted > 0 || ai.aiSent > 0 || ai.manualSent > 0;

  if (!hasAutomation && !hasAi) return null;

  const attemptItems: BarListItem[] = automation.attempts.map((item) => ({
    key: `attempts-${item.label}`,
    label: item.label,
    value: formatNumber(item.count),
    share: item.share,
    meta: item.detail,
  }));

  const stoppedItems: BarListItem[] = automation.stopped.map((item) => ({
    key: `stopped-${item.label}`,
    label: item.label,
    value: formatNumber(item.count),
    share: item.share,
    meta: item.detail,
  }));

  const aiComparison: BarListItem[] = [
    {
      key: "ai-drafted",
      label: "AI-drafted quotes",
      value: formatPercent(ai.aiWinRate),
      share: ai.aiWinRate,
      meta: `${formatNumber(ai.aiAccepted)} won of ${formatNumber(ai.aiSent)} sent`,
    },
    {
      key: "manual",
      label: "Manually written quotes",
      value: formatPercent(ai.manualWinRate),
      share: ai.manualWinRate,
      meta: `${formatNumber(ai.manualAccepted)} won of ${formatNumber(ai.manualSent)} sent`,
    },
  ];

  const readinessItems: BarListItem[] = ai.readiness.map((item) => ({
    key: `readiness-${item.label}`,
    label: item.label,
    value: formatNumber(item.count),
    share: item.share,
    meta: item.detail,
  }));

  return (
    <AnalyticsRow>
      {hasAutomation ? (
        <AnalyticsCard
          className={analyticsCol(hasAi ? 6 : 12)}
          title="Automated follow-ups"
          description="Sequences that chase sent quotes until the customer responds. Attempts shown across all automated quotes."
        >
          <StatGrid columns={3}>
            <Stat
              label="Active sequences"
              value={formatNumber(automation.activeSequences)}
              caption={
                automation.activeLimit === null
                  ? "Unlimited on your plan"
                  : `of ${formatNumber(automation.activeLimit)} allowed by your plan`
              }
            />
            <Stat
              label="Emails sent"
              value={formatNumber(automation.emailsSent)}
              caption={`In ${props.window.label.toLowerCase()}`}
            />
            <Stat
              label="Quotes with attempts"
              value={formatNumber(automation.quotesWithAttempts)}
              caption="Automated quotes with at least one send"
            />
          </StatGrid>

          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="meta-label">Attempts per automated quote</span>
              <BarList
                items={attemptItems}
                emptyLabel="No automated quotes yet."
              />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="meta-label">Why sequences stopped</span>
              <BarList
                items={stoppedItems}
                emptyLabel="No sequences stopped in this period."
              />
            </div>
          </div>
        </AnalyticsCard>
      ) : null}

      {hasAi ? (
        <AnalyticsCard
          className={analyticsCol(hasAutomation ? 6 : 12)}
          title="AI impact"
          description="Drafted here means the quote started from an AI draft. Win rate is accepted ÷ decided among quotes sent in this period."
        >
          <StatGrid columns={2}>
            <Stat
              label="AI drafts started"
              value={formatNumber(ai.drafted)}
              caption="Quotes created from an AI draft"
            />
            <Stat
              label="Draft → sent"
              value={formatPercent(ai.draftToSentRate)}
              caption="Drafts that made it out the door"
            />
            <Stat
              label="AI share of quotes"
              value={formatPercent(ai.aiShare)}
              caption="AI-drafted ÷ all quotes sent"
            />
            <Stat
              label="Missing-info flags"
              value={formatNumber(ai.missingInfoDetected)}
              caption={`${formatNumber(ai.acknowledged)} acknowledged by your team`}
              valueClassName={
                ai.missingInfoDetected > 0 ? "text-warning" : undefined
              }
            />
          </StatGrid>

          <div className="flex min-w-0 flex-col gap-5">
            <div className="flex min-w-0 flex-col gap-2">
              <span className="meta-label">Win rate: AI vs manual</span>
              <BarList items={aiComparison} />
            </div>
            <div className="flex min-w-0 flex-col gap-2">
              <span className="meta-label">AI draft readiness</span>
              <BarList
                items={readinessItems}
                emptyLabel="No AI drafts in this period."
              />
            </div>
          </div>
        </AnalyticsCard>
      ) : null}
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Assistant, knowledge, email, workflows
// ---------------------------------------------------------------------------

export async function OperationsAssistantRow(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { agent, knowledge } = data;
  const hasAgent = agent.sessions > 0;
  const hasKnowledge = data.hasData || knowledge.sources > 0;

  if (!hasAgent && !hasKnowledge) return null;

  const steps: AnalyticsFunnelStep[] = [
    {
      key: "sessions",
      label: "Conversations started",
      count: agent.sessions,
      href: null,
    },
    {
      key: "captured",
      label: "Became inquiries",
      count: agent.captured,
      href: null,
    },
  ];

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
    <AnalyticsRow>
      {hasAgent ? (
        <AnalyticsCard
          className={analyticsCol(hasKnowledge ? 6 : 12)}
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
          <Funnel
            steps={steps}
            ariaLabel={`Assistant funnel for ${props.window.label}`}
          />
          <StatGrid columns={2}>
            <Stat
              label="Capture rate"
              value={formatPercent(agent.captureRate)}
              caption="Conversations that became inquiries"
            />
            <Stat
              label="Handed to a person"
              value={formatNumber(agent.handoffs)}
              caption="Handed off mid-conversation"
            />
            <Stat
              label="Abandoned"
              value={formatNumber(agent.abandoned)}
              caption="Left before an inquiry was captured"
            />
            <Stat
              label="Active now"
              value={formatNumber(agent.active)}
              caption="Still in progress"
            />
          </StatGrid>
        </AnalyticsCard>
      ) : null}

      {hasKnowledge ? (
        <AnalyticsCard
          className={analyticsCol(hasAgent ? 6 : 12)}
          title="Knowledge and readiness"
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
          <UsageMeter meter={meter} />
          <StatGrid columns={3}>
            <Stat
              label="Missing info detected"
              value={formatNumber(knowledge.missingInfoDetected)}
              caption="Drafts flagged with gaps"
              valueClassName={
                knowledge.missingInfoDetected > 0 ? "text-warning" : undefined
              }
            />
            <Stat
              label="Readiness blocks"
              value={formatNumber(knowledge.readinessBlocked)}
              caption="Awaiting confirmation before sending"
              valueClassName={
                knowledge.readinessBlocked > 0 ? "text-warning" : undefined
              }
            />
            <Stat
              label="Confirmed"
              value={formatNumber(knowledge.readinessCompleted)}
              caption="Acknowledgements in this period"
              valueClassName="text-success"
            />
          </StatGrid>
        </AnalyticsCard>
      ) : null}
    </AnalyticsRow>
  );
}

export async function OperationsDeliveryRow(props: OperationsSectionProps) {
  const data = await props.dataPromise;
  const { email, verticals, currency } = data;
  const hasEmail = email.sent + email.failed + email.pending > 0;
  const hasVerticals =
    verticals.approvals.requested > 0 ||
    verticals.changeOrders.created > 0 ||
    verticals.schedules.created > 0 ||
    verticals.scope.blocksAdded > 0 ||
    verticals.scope.requiredMissing > 0;

  if (!hasEmail && !hasVerticals) return null;

  return (
    <AnalyticsRow>
      {hasEmail ? (
        <AnalyticsCard
          className={analyticsCol(hasVerticals ? 6 : 12)}
          title="Email delivery"
          description="Outbound emails for this period, including quote sends and automated follow-ups."
        >
          <StatGrid columns={2}>
            <Stat
              label="Sent"
              value={formatNumber(email.sent)}
              caption="Accepted by the mail provider"
              valueClassName="text-success"
            />
            <Stat
              label="Failed"
              value={formatNumber(email.failed)}
              caption="Needs a resend"
              valueClassName={email.failed > 0 ? "text-destructive" : undefined}
            />
            <Stat
              label="Pending"
              value={formatNumber(email.pending)}
              caption="Queued or in flight"
            />
            <Stat
              label="Delivery rate"
              value={formatPercent(email.deliveredRate)}
              caption="Sent ÷ sent + failed"
            />
          </StatGrid>
        </AnalyticsCard>
      ) : null}

      {hasVerticals ? (
        <AnalyticsCard
          className={analyticsCol(hasEmail ? 6 : 12)}
          title="Workflow packs"
          description="Approvals, change orders, payment schedules, and scope checklists — shown when your workspace uses them."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                {
                  label: "Expired",
                  value: formatNumber(verticals.approvals.expired),
                },
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
                {
                  label: "Created",
                  value: formatNumber(verticals.changeOrders.created),
                },
                {
                  label: "Approved",
                  value: formatNumber(verticals.changeOrders.approved),
                  tone: "positive",
                },
                {
                  label: "Rejected",
                  value: formatNumber(verticals.changeOrders.rejected),
                },
                {
                  label: "Withdrawn",
                  value: formatNumber(verticals.changeOrders.withdrawn),
                },
                {
                  label: "Approved value",
                  value: formatMoney(
                    verticals.changeOrders.approvedValueInCents,
                    currency,
                  ),
                },
              ]}
            />
            <VerticalBlock
              title="Payment schedules"
              description="Milestone-based payment plans on quotes."
              rows={[
                {
                  label: "Created",
                  value: formatNumber(verticals.schedules.created),
                },
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
                {
                  label: "Blocks added",
                  value: formatNumber(verticals.scope.blocksAdded),
                },
                {
                  label: "Required missing",
                  value: formatNumber(verticals.scope.requiredMissing),
                  tone:
                    verticals.scope.requiredMissing > 0 ? "warning" : "default",
                },
                {
                  label: "Waivers",
                  value: formatNumber(verticals.scope.waivers),
                },
                {
                  label: "Readiness blocked",
                  value: formatNumber(verticals.scope.readinessBlocked),
                  tone:
                    verticals.scope.readinessBlocked > 0 ? "warning" : "default",
                },
                {
                  label: "Readiness completed",
                  value: formatNumber(verticals.scope.readinessCompleted),
                  tone: "positive",
                },
              ]}
            />
          </div>
        </AnalyticsCard>
      ) : null}
    </AnalyticsRow>
  );
}

function VerticalBlock({
  title,
  description,
  rows,
}: {
  title: string;
  description: string;
  rows: Array<{
    label: string;
    value: string;
    tone?: "default" | "warning" | "positive";
  }>;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <dl className="flex flex-col">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-center justify-between gap-3 border-b border-border/50 py-2 text-sm last:border-0"
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
