import { Badge } from "@/components/ui/badge";
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

import { AnalyticsCard } from "../primitives/analytics-card";
import { AnalyticsChartCard } from "../primitives/analytics-chart-card";
import {
  AnalyticsRow,
  analyticsCol,
} from "../primitives/analytics-section";
import { BarList, type BarListItem } from "../primitives/bar-list";
import { DataTable } from "../primitives/data-table";
import { Stat, StatGrid } from "../primitives/stat";
import { BenchmarkBars } from "../charts/benchmark-bar";
import { CohortGrid } from "../charts/cohort-grid";
import { LazyTeamActivityChart } from "../charts/lazy-charts";
import { AnalyticsRangeEmpty } from "../states/analytics-empty";

/**
 * Team tab sections (Business).
 *
 * Every export is a Suspense boundary over the shared `getTeamData` promise.
 * Attribution rules live in the query layer (quotes go to the member who
 * first sent them, views to `firstViewedBy`); sections only format.
 *
 * Rows are symmetric: one twelve-column table, then pairs of six.
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
    <div className="flex flex-col gap-1 rounded-lg border border-border/60 px-3 py-3">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium text-foreground">
          {member.name}
        </span>
        <Badge variant="secondary">{roleLabels[member.role]}</Badge>
      </div>
      <p className="text-xs text-muted-foreground">{member.email}</p>
      <p className="text-xs text-muted-foreground">
        {formatNumber(member.quotesSent)} quotes sent ·{" "}
        {formatPercentOrDash(member.winRate)} win rate ·{" "}
        {formatMoney(member.valueWonInCents, currency)} won
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
    <AnalyticsRow>
      <AnalyticsCard
        className={analyticsCol(12)}
        title="Member performance"
        description="Quotes are attributed to the member who first sent them; value won counts accepted quotes in the selected period."
        bodyClassName="gap-0"
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

        <div className="hidden min-w-0 lg:block">
          <DataTable
            minWidthClassName="min-w-[48rem]"
            columns={[
              { key: "member", header: "Member" },
              { key: "quotesSent", header: "Quotes sent", align: "end" },
              { key: "winRate", header: "Win rate", align: "end" },
              { key: "valueWon", header: "Value won", align: "end" },
              { key: "followUps", header: "Follow-ups", align: "end" },
              { key: "response", header: "Avg response", align: "end" },
              { key: "sla", header: "SLA breaches", align: "end" },
            ]}
            rows={data.members.map((member) => ({
              member: (
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="flex items-center gap-2">
                    <span className="truncate font-medium text-foreground">
                      {member.name}
                    </span>
                    <Badge variant="outline">{roleLabels[member.role]}</Badge>
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    {member.email}
                  </span>
                </span>
              ),
              quotesSent: formatNumber(member.quotesSent),
              winRate: formatPercentOrDash(member.winRate),
              valueWon: formatMoney(member.valueWonInCents, data.currency),
              followUps: formatNumber(member.followUpsCompleted),
              response: formatDuration(member.averageResponseHours),
              sla: (
                <span
                  className={cn(
                    member.slaBreaches > 0 ? "text-destructive" : undefined,
                  )}
                >
                  {formatNumber(member.slaBreaches)}
                </span>
              ),
            }))}
          />
        </div>
      </AnalyticsCard>
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Workload & SLA
// ---------------------------------------------------------------------------

export async function TeamWorkloadRow(props: TeamSectionProps) {
  const data = await props.dataPromise;
  const { workload, sla } = data;
  const hasWorkload =
    workload.openInquiries > 0 ||
    workload.unviewedInquiries > 0 ||
    workload.pendingFollowUps > 0;
  const hasSla = sla.byMember.length > 0;

  if (!hasWorkload && !hasSla) return null;

  const breachItems: BarListItem[] = sla.byMember.map((item) => ({
    key: `sla-${item.label}`,
    label: item.label,
    value: formatNumber(item.count),
    share: item.share,
    meta: item.detail,
  }));

  return (
    <AnalyticsRow>
      {hasWorkload ? (
        <AnalyticsCard
          className={analyticsCol(hasSla ? 6 : 12)}
          title="Workload right now"
          description="Live counts across all time — the queues waiting on your team today."
        >
          <StatGrid columns={2}>
            <Stat
              label="Open inquiries"
              value={formatNumber(workload.openInquiries)}
              caption="Not yet won, lost, or archived"
              href={getInquiriesListHref(props.businessSlug)}
            />
            <Stat
              label="Unviewed"
              value={formatNumber(workload.unviewedInquiries)}
              caption="Nobody has opened these yet"
              valueClassName={
                workload.unviewedInquiries > 0 ? "text-warning" : undefined
              }
            />
            <Stat
              label="Oldest unviewed"
              value={formatDuration(workload.oldestUnviewedHours)}
              caption="Age of the longest-waiting inquiry"
              valueClassName={
                workload.oldestUnviewedHours && workload.oldestUnviewedHours > 24
                  ? "text-warning"
                  : undefined
              }
            />
            <Stat
              label="Pending follow-ups"
              value={formatNumber(workload.pendingFollowUps)}
              caption="Scheduled and not yet sent"
              href={getFollowUpsListHref(props.businessSlug, { status: "pending" })}
            />
          </StatGrid>
        </AnalyticsCard>
      ) : null}

      {hasSla ? (
        <AnalyticsCard
          className={analyticsCol(hasWorkload ? 6 : 12)}
          title="Response-time SLA"
          description={`Inquiries submitted in this period that waited more than ${sla.targetHours}h before a first view or the first quote.`}
        >
          <StatGrid columns={2}>
            <Stat
              label="Breached inquiries"
              value={formatNumber(sla.breachedInquiries)}
              caption={`More than ${sla.targetHours}h to a first look`}
              valueClassName={
                sla.breachedInquiries > 0 ? "text-warning" : "text-success"
              }
            />
            <Stat
              label="Breach rate"
              value={formatPercent(sla.breachRate)}
              caption="Breaches ÷ inquiries submitted"
              valueClassName={sla.breachRate > 0.2 ? "text-destructive" : undefined}
            />
          </StatGrid>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="meta-label">Breaches by member</span>
            <BarList
              items={breachItems}
              emptyLabel="No breaches — every inquiry got a timely look."
            />
          </div>
        </AnalyticsCard>
      ) : null}
    </AnalyticsRow>
  );
}

// ---------------------------------------------------------------------------
// Cohorts and activity
// ---------------------------------------------------------------------------

export async function TeamCohortRow(props: TeamSectionProps) {
  const data = await props.dataPromise;
  const hasCohorts = data.cohorts.some((cohort) => cohort.size > 0);
  const { activitySeries } = data;
  const hasActivity = activitySeries.members.some((member) =>
    member.counts.some((count) => count > 0),
  );

  if (!hasCohorts && !hasActivity) return null;

  const totals = activitySeries.members.map((member) => ({
    member,
    total: member.counts.reduce((sum, count) => sum + count, 0),
  }));
  const ranked = [...totals].sort((a, b) => b.total - a.total);

  return (
    <AnalyticsRow>
      {hasCohorts ? (
        <AnalyticsCard
          className={analyticsCol(hasActivity ? 6 : 12)}
          title="Inquiry cohorts"
          description="Each month's inquiries tracked through quoting to a win — the last six months, regardless of the selected range."
          bodyClassName="gap-0"
        >
          <CohortGrid cohorts={data.cohorts} />
        </AnalyticsCard>
      ) : null}

      {hasActivity ? (
        <AnalyticsChartCard
          className={analyticsCol(hasCohorts ? 6 : 12)}
          title="Team activity"
          description="Quotes sent and follow-ups completed per member over the last six months. Members beyond the top five roll into Others."
          chart={
            <LazyTeamActivityChart
              activity={activitySeries}
              ariaLabel="Monthly quotes sent and follow-ups completed per team member"
            />
          }
          table={
            <DataTable
              minWidthClassName="min-w-[36rem]"
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
          }
        />
      ) : null}
    </AnalyticsRow>
  );
}

export async function TeamBenchmarksRow(props: TeamSectionProps) {
  const data = await props.dataPromise;
  if (data.benchmarks.length === 0) return null;

  return (
    <AnalyticsRow>
      <AnalyticsCard
        className={analyticsCol(12)}
        title="How your team compares"
        description="Your numbers against the median for similar businesses, matched by size tier. Benchmarks publish once at least 10 businesses share data."
      >
        <BenchmarkBars rows={data.benchmarks} />
      </AnalyticsCard>
    </AnalyticsRow>
  );
}
