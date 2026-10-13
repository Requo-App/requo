import Link from "next/link";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardSection,
} from "@/components/shared/dashboard-layout";
import type { Stat } from "@/components/shared/stat-cards";
import { AdminAiStatCards } from "@/features/admin/components/ai/admin-ai-stat-cards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminAiStatusBadge } from "@/features/admin/components/primitives/admin-status-badges";
import {
  ADMIN_AI_ERRORS_PATH,
  ADMIN_AI_PROVIDERS_PATH,
  ADMIN_AI_REQUESTS_PATH,
} from "@/features/admin/navigation";
import {
  getAdminAiOverview,
} from "@/features/admin/queries";
import type { AdminAiOverview as AdminAiOverviewPayload } from "@/features/admin/types";
import {
  formatAdminCostCents,
  formatAdminCount,
  formatAdminPercent,
} from "@/features/admin/components/overview/admin-overview-stats";
import {
  formatCompactCount,
  formatLatencyMs,
} from "@/features/admin/components/ai/admin-ai-format";

/**
 * Serializable icon keys for the AI overview tiles.
 *
 * `StatCards` is a client component and `Stat.icon` is a component
 * reference, which cannot cross the server → client boundary — so the
 * builder below emits keys and `AdminAiStatCards` resolves them to icon
 * components client-side (same bridge as `HomeKpiCards`).
 */
export type AdminAiStatIcon = "calls" | "tokens" | "cost" | "errors";

export type AdminAiStat = Omit<Stat, "icon"> & {
  icon: AdminAiStatIcon;
};

function buildAiOverviewStats(overview: AdminAiOverviewPayload): AdminAiStat[] {
  const { last24h, last7d } = overview;
  const errorRate = formatAdminPercent(last24h.errors, last24h.requests);

  return [
    {
      icon: "calls",
      label: "AI calls (24h)",
      value: formatAdminCount(last24h.requests),
      delta: `${formatAdminCount(last7d.requests)} in 7d`,
      deltaColor: last24h.requests > 0 ? "lime" : "neutral",
      deltaDirection: last24h.requests > 0 ? "up" : "flat",
    },
    {
      icon: "tokens",
      label: "Tokens (24h)",
      value: formatAdminCount(last24h.tokens),
      delta: `${formatAdminCount(last7d.tokens)} in 7d`,
      deltaColor: last24h.tokens > 0 ? "lime" : "neutral",
      deltaDirection: last24h.tokens > 0 ? "up" : "flat",
    },
    {
      icon: "cost",
      label: "Est. cost (24h)",
      value: formatAdminCostCents(last24h.estimatedCostCents),
      delta:
        last24h.unpricedCalls > 0
          ? `${formatAdminCount(last24h.unpricedCalls)} unpriced`
          : "Fully priced",
      deltaColor: "neutral",
      deltaDirection: "flat",
    },
    {
      icon: "errors",
      label: "Errors (24h)",
      value: formatAdminCount(last24h.errors),
      delta: errorRate ?? "No calls",
      deltaColor: last24h.errors > 0 ? "rose" : "neutral",
      deltaDirection: last24h.errors > 0 ? "up" : "flat",
    },
  ];
}

/**
 * AI overview for `/admin/ai`.
 *
 * KPI tiles for the trailing 24 hours plus 7-day breakdowns by provider
 * and task type, agent-session states, and the security-event count.
 * Fallback / rate-limit / exhaustion panels are deliberately absent:
 * those events are `console.warn` only and are never persisted, so there
 * is nothing truthful to render.
 */
export async function AdminAiOverview() {
  const overview = await getAdminAiOverview();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminAiStatCards stats={buildAiOverviewStats(overview)} />

      {overview.last24h.unpricedCalls > 0 ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Cost is a floor: {formatAdminCount(overview.last24h.unpricedCalls)}{" "}
          calls in the last 24 hours used models with no catalog price, so
          actual spend is higher.
        </p>
      ) : null}

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <DashboardSection
          action={
            <Button asChild size="sm" variant="outline">
              <Link href={ADMIN_AI_REQUESTS_PATH} prefetch={true}>
                View requests
              </Link>
            </Button>
          }
          description="Model usage over the last 7 days, busiest first."
          title="By provider"
        >
          {overview.byProvider.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No AI calls in the last 7 days.
            </p>
          ) : (
            <ul>
              {overview.byProvider.map((row) => (
                <li
                  aria-label={`${row.provider}: ${formatAdminCount(row.requests)} requests`}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"
                  key={row.provider}
                >
                  <span className="min-w-0 truncate text-sm font-medium text-foreground">
                    {row.provider}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-muted-foreground">
                    {row.errors > 0 ? (
                      <AdminAiStatusBadge status="error" />
                    ) : null}
                    <span className="font-semibold text-foreground">
                      {formatCompactCount(row.requests)}
                    </span>
                    <span>·</span>
                    <span>{formatCompactCount(row.tokens)} tok</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>

        <DashboardSection
          description="Workload mix over the last 7 days, busiest first."
          title="By task type"
        >
          {overview.byTaskType.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No AI calls in the last 7 days.
            </p>
          ) : (
            <ul>
              {overview.byTaskType.map((row) => (
                <li
                  aria-label={`${row.taskType}: ${formatAdminCount(row.requests)} requests`}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-1.5 last:border-0"
                  key={row.taskType}
                >
                  <span className="min-w-0 truncate font-mono text-xs text-foreground">
                    {row.taskType}
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm tabular-nums text-muted-foreground">
                    {row.errors > 0 ? (
                      <AdminAiStatusBadge status="error" />
                    ) : null}
                    <span className="font-semibold text-foreground">
                      {formatCompactCount(row.requests)}
                    </span>
                    <span>·</span>
                    <span>{formatCompactCount(row.tokens)} tok</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </DashboardSection>
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-2">
        <DashboardSection
          description="Cache hits, latency, and reliability for the last 24 hours."
          title="Reliability"
        >
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            <div className="min-w-0">
              <dt className="meta-label">Error rate</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {formatAdminPercent(
                  overview.last24h.errors,
                  overview.last24h.requests,
                ) ?? "No calls in window"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="meta-label">Cache-hit rate</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {formatAdminPercent(
                  overview.last24h.cacheHits,
                  overview.last24h.requests,
                ) ?? "No calls in window"}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="meta-label">Avg latency</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {formatLatencyMs(overview.last24h.averageLatencyMs)}
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="meta-label">Security events (7d)</dt>
              <dd className="mt-1 text-sm font-medium tabular-nums text-foreground">
                {formatAdminCount(overview.securityEventsLast7d)}
              </dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href={ADMIN_AI_ERRORS_PATH} prefetch={true}>
                View errors
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={ADMIN_AI_PROVIDERS_PATH} prefetch={true}>
                View providers
              </Link>
            </Button>
          </div>
        </DashboardSection>

        <DashboardSection
          description="Public customer-chat sessions by state."
          title="Agent sessions"
        >
          {overview.agentSessionsByStatus.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No agent sessions on record.
            </p>
          ) : (
            <DashboardDetailFeed>
              {overview.agentSessionsByStatus.map((row) => (
                <DashboardDetailFeedItem
                  key={row.status}
                  meta={
                    <span>
                      {formatAdminCount(row.count)}{" "}
                      {row.count === 1 ? "session" : "sessions"}
                    </span>
                  }
                  title={
                    <span className="flex items-center gap-2">
                      <span className="capitalize">
                        {row.status.replaceAll("_", " ")}
                      </span>
                      <Badge variant="ghost">{formatCompactCount(row.count)}</Badge>
                    </span>
                  }
                />
              ))}
            </DashboardDetailFeed>
          )}
        </DashboardSection>
      </div>
    </div>
  );
}
