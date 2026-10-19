import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatDuration,
  formatMoney,
  formatNumber,
  formatPercent,
} from "@/features/analytics/lib/format";
import { getFollowUpsListHref, getInquiriesListHref } from "@/features/analytics/lib/links";
import type { AnalyticsWindow } from "@/features/analytics/lib/window";
import type { TeamData, TeamMemberRole, TeamMemberRow } from "@/features/analytics/types";
import { cn } from "@/lib/utils";

import { AnalyticsChartCard, ChartDataTable } from "../chart-card";
import { BenchmarkBars } from "../charts/benchmark-bar";
import { CohortGrid } from "../charts/cohort-grid";
import { LazyTeamActivityChart } from "../charts/lazy-charts";
import { RankedBarList } from "../charts/ranked-bar-list";
import { AnalyticsMetricTile as MetricTile } from "../metric-tile";
import { AnalyticsRangeEmpty } from "../states/analytics-empty";

/**
 * Team tab sections (Business).
 *
 * Every export is a Suspense boundary over the shared `getTeamData` promise.
 * Attribution rules live in the query layer (quotes go to the member who
 * first sent them, views to `firstViewedBy`); sections only format.
 */

export type TeamSectionProps = {
  dataPromise: Promise<TeamData>;
  businessSlug: string;
  window: AnalyticsWindow;
};

const roleLabels: Record<TeamMemberRole, string> = {
  owner: "Owner",
  manager: "Manager",
  staff: "Staff",
};

function formatPercentOrDash(value: number | null) {
  return value === null ? "—" : formatPercent(value);
}

function hasTeamActivity(data: TeamData) {
  return (
    data.members.some(
      (member) =>
        member.quotesSent > 0 ||
        member.inquiriesViewed > 0 ||
        member.followUpsCompleted > 0 ||
        member.valueWonInCents > 0,
    ) ||
    data.workload.openInquiries > 0 ||
    data.workload.pendingFollowUps > 0 ||
    data.sla.breachedInquiries > 0 ||
    data.cohorts.some((cohort) => cohort.size > 0)
  );
}

/** Renders the quiet-range state; every other section skips its card. */
export async function TeamEmptyGuard(props: TeamSectionProps) {
  const data = await props.dataPromise;
  if (hasTeamActivity(data)) return null;

  return <AnalyticsRangeEmpty />;
}

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

function TeamMemberMobileRow({
  member,
  currency,
}: {
  member: TeamMemberRow;
  currency: string;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-border/70 bg-background px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {member.name}
        </span>
        <Badge variant="secondary">{roleLabels[member.role]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{member.email}</p>
      <p className="text-xs text-muted-foreground">
        {formatNumber(member.quotesSent)} quotes sent · {formatPercentOrDash(member.winRate)} win
        rate · {formatMoney(member.valueWonInCents, currency)} won
      </p>
      <p className="text-xs text-muted-foreground">
        {formatNumber(member.followUpsCompleted)} follow-ups ·{" "}
        {formatDuration(member.averageResponseHours)} avg response
        {member.slaBreaches > 0 ? (
          <span className="text-destructive">
            {" "}
            · {formatNumber(member.slaBreaches)} SLA{" "}
            {member.slaBreaches === 1 ? "breach" : "breaches"}
          </span>
        ) : null}
      </p>
    </div>
  );
}

export async function TeamMembersCard(props: TeamSectionProps) {
  const data = await props.dataPromise;
  if (data.members.length === 0) return null;

  const hasActivity = data.members.some(
    (member) =>
      member.quotesSent + member.inquiriesViewed + member.followUpsCompleted > 0,
  );
  if (!hasActivity && data.workload.openInquiries === 0) return null;

  return (
    <AnalyticsChartCard
      title="Member performance"
      description="Quotes are attributed to the member who first sent them; value won counts accepted quotes in the selected period."
      contentClassName="gap-0"
    >
      <div className="flex flex-col gap-2.5 lg:hidden">
        {data.members.map((member) => (
          <TeamMemberMobileRow
            key={member.userId}
            member={member}
            currency={data.currency}
          />
        ))}
      </div>

      <div className="hidden overflow-x-auto no-scrollbar lg:block">
        <Table className="min-w-[48rem]">
          <TableHeader>
            <TableRow>
              <TableHead>Member</TableHead>
              <TableHead className="text-right">Quotes sent</TableHead>
              <TableHead className="text-right">Win rate</TableHead>
              <TableHead className="text-right">Value won</TableHead>
              <TableHead className="text-right">Follow-ups</TableHead>
              <TableHead className="text-right">Avg response</TableHead>
              <TableHead className="text-right">SLA breaches</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.members.map((member) => (
              <TableRow key={member.userId}>
                <TableCell>
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-foreground">
                        {member.name}
                      </span>
                      <Badge variant="outline">{roleLabels[member.role]}</Badge>
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {member.email}
                    </span>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(member.quotesSent)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatPercentOrDash(member.winRate)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(member.valueWonInCents, data.currency)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatNumber(member.followUpsCompleted)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(member.averageResponseHours)}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right tabular-nums",
                    member.slaBreaches > 0 ? "text-destructive" : undefined,
                  )}
                >
                  {formatNumber(member.slaBreaches)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Workload & SLA
// ---------------------------------------------------------------------------

export async function TeamWorkloadCard(props: TeamSectionProps) {
  const data = await props.dataPromise;
  const { workload } = data;
  if (
    workload.openInquiries === 0 &&
    workload.unviewedInquiries === 0 &&
    workload.pendingFollowUps === 0
  ) {
    return null;
  }

  return (
    <AnalyticsChartCard
      title="Workload right now"
      description="Live counts across all time — the queues waiting on your team today."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricTile
          label="Open inquiries"
          value={formatNumber(workload.openInquiries)}
          caption="Not yet won, lost, or archived"
          href={getInquiriesListHref(props.businessSlug)}
        />
        <MetricTile
          label="Unviewed"
          value={formatNumber(workload.unviewedInquiries)}
          caption="Nobody has opened these yet"
          tone={workload.unviewedInquiries > 0 ? "warning" : "default"}
        />
        <MetricTile
          label="Oldest unviewed"
          value={formatDuration(workload.oldestUnviewedHours)}
          caption="Age of the longest-waiting inquiry"
          tone={workload.oldestUnviewedHours && workload.oldestUnviewedHours > 24 ? "warning" : "default"}
        />
        <MetricTile
          label="Pending follow-ups"
          value={formatNumber(workload.pendingFollowUps)}
          caption="Scheduled and not yet sent"
          href={getFollowUpsListHref(props.businessSlug, { status: "pending" })}
        />
      </div>
    </AnalyticsChartCard>
  );
}

export async function TeamSlaCard(props: TeamSectionProps) {
  const data = await props.dataPromise;
  const { sla } = data;
  if (sla.byMember.length === 0) return null;

  return (
    <AnalyticsChartCard
      title="Response-time SLA"
      description={`Inquiries submitted in this period that waited more than ${sla.targetHours}h before a first view or the first quote.`}
    >
      <div className="flex flex-col gap-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <MetricTile
            label="Breached inquiries"
            value={formatNumber(sla.breachedInquiries)}
            caption={`More than ${sla.targetHours}h to a first look`}
            tone={sla.breachedInquiries > 0 ? "warning" : "positive"}
          />
          <MetricTile
            label="Breach rate"
            value={formatPercent(sla.breachRate)}
            caption="Breaches ÷ inquiries submitted"
            tone={sla.breachRate > 0.2 ? "negative" : "default"}
          />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <h3 className="text-sm font-medium text-foreground">Breaches by member</h3>
          <RankedBarList
            items={sla.byMember}
            emptyLabel="No breaches — every inquiry got a timely look."
          />
        </div>
      </div>
    </AnalyticsChartCard>
  );
}

// ---------------------------------------------------------------------------
// Cohorts, benchmarks, activity
// ---------------------------------------------------------------------------

export async function TeamCohortsCard(props: TeamSectionProps) {
  const data = await props.dataPromise;
  if (!data.cohorts.some((cohort) => cohort.size > 0)) return null;

  return (
    <AnalyticsChartCard
      title="Inquiry cohorts"
      description="Each month's inquiries tracked through quoting to a win — the last six months, regardless of the selected range."
    >
      <CohortGrid cohorts={data.cohorts} />
    </AnalyticsChartCard>
  );
}

export async function TeamBenchmarksCard(props: TeamSectionProps) {
  const data = await props.dataPromise;
  if (data.benchmarks.length === 0) return null;

  return (
    <AnalyticsChartCard
      title="How your team compares"
      description="Your numbers against the median for similar businesses, matched by size tier. Benchmarks publish once at least 10 businesses share data."
    >
      <BenchmarkBars rows={data.benchmarks} />
    </AnalyticsChartCard>
  );
}

export async function TeamActivityCard(props: TeamSectionProps) {
  const data = await props.dataPromise;
  const { activitySeries } = data;
  if (!activitySeries.members.some((member) => member.counts.some((count) => count > 0))) {
    return null;
  }

  const totals = activitySeries.members.map((member) => ({
    member,
    total: member.counts.reduce((sum, count) => sum + count, 0),
  }));
  const ranked = [...totals].sort((a, b) => b.total - a.total);

  return (
    <AnalyticsChartCard
      title="Team activity"
      description="Quotes sent and follow-ups completed per member over the last six months. Members beyond the top five roll into Others."
    >
      <div className="flex flex-col gap-4">
        <LazyTeamActivityChart
          activity={activitySeries}
          ariaLabel="Monthly quotes sent and follow-ups completed per team member"
        />
        <ChartDataTable
          columns={[
            { key: "member", header: "Member" },
            ...activitySeries.bucketLabels.map((label) => ({
              key: label,
              header: label,
              align: "end" as const,
            })),
            { key: "total", header: "Total", align: "end" as const },
          ]}
          rows={ranked.map(({ member, total }) => {
            const row: Record<string, string> = { member: member.name };
            activitySeries.bucketLabels.forEach((label, index) => {
              row[label] = formatNumber(member.counts[index] ?? 0);
            });
            row.total = formatNumber(total);
            return row;
          })}
        />
      </div>
    </AnalyticsChartCard>
  );
}
