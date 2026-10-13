import { DashboardSection } from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { getAdminEmailQuotas } from "@/features/admin/queries";
import type { AdminEmailQuota } from "@/features/admin/types";

function formatQuotaValue(used: number | null, limit: number | null): string {
  if (used !== null && limit !== null) return `${used.toLocaleString("en-US")}/${limit.toLocaleString("en-US")}`;
  if (used !== null) return used.toLocaleString("en-US");
  if (limit !== null) return `0/${limit.toLocaleString("en-US")}`;
  return "—";
}

function QuotaBadge({ quota }: { quota: AdminEmailQuota }) {
  if (!quota.configured || quota.status === "unavailable") return <Badge variant="ghost">Unavailable</Badge>;
  if (quota.status === "error") return <Badge variant="destructive">Error</Badge>;
  return <Badge variant="secondary">Live</Badge>;
}

/**
 * Limits card for `/admin/emails`.
 *
 * Local outbox volumes (fresh DB counts) plus live provider quotas
 * (5-minute cache, fail-soft per provider). Mounted in its own Suspense
 * boundary so provider polling never blocks the list.
 */
export async function AdminEmailQuotasSection() {
  const data = await getAdminEmailQuotas();

  return (
    <DashboardSection
      description={`Sent ${data.sentLast24h.toLocaleString("en-US")} in 24h · ${data.sentLast7d.toLocaleString("en-US")} in 7d · ${data.failedLast24h.toLocaleString("en-US")} failed in 24h. Provider quotas refresh every 5 minutes.`}
      title="Limits"
    >
      <ul className="grid gap-3 sm:grid-cols-3">
        {data.quotas.map((quota) => {
          const hasQuotaData =
            quota.dailyUsed !== null ||
            quota.dailyLimit !== null ||
            quota.monthlyUsed !== null ||
            quota.monthlyLimit !== null;

          return (
            <li
              className="soft-panel flex min-w-0 flex-col gap-2 px-4 py-3 shadow-none"
              data-padding="none"
              key={quota.provider}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-foreground">{quota.label}</p>
                <QuotaBadge quota={quota} />
              </div>
              {hasQuotaData ? (
                <dl className="grid gap-1 text-xs tabular-nums text-muted-foreground">
                  <div className="flex items-center justify-between gap-2">
                    <dt>Daily</dt>
                    <dd className="font-medium text-foreground">{formatQuotaValue(quota.dailyUsed, quota.dailyLimit)}</dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>Monthly</dt>
                    <dd className="font-medium text-foreground">{formatQuotaValue(quota.monthlyUsed, quota.monthlyLimit)}</dd>
                  </div>
                </dl>
              ) : null}
              {quota.message ? (
                <p className="truncate text-xs text-muted-foreground" title={quota.message}>
                  {quota.message}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </DashboardSection>
  );
}

export function AdminEmailQuotasFallback() {
  return (
    <div className="section-panel space-y-3">
      <Skeleton className="h-5 w-32 rounded-md" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <Skeleton className="h-24 w-full rounded-lg" key={index} />
        ))}
      </div>
    </div>
  );
}
