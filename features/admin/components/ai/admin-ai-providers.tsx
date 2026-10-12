import Link from "next/link";

import {
  DashboardDetailFeed,
  DashboardDetailFeedItem,
  DashboardSection,
  DashboardTableContainer,
} from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  formatCompactCount,
  formatLoadPercent,
} from "@/features/admin/components/ai/admin-ai-format";
import {
  getAdminAiCapacity,
  getAdminAiProviders,
} from "@/features/admin/queries";
import type {
  AdminAiCapacityEntry,
  AdminAiProviders as AdminAiProvidersPayload,
} from "@/features/admin/types";

/**
 * Configured providers and routing profiles for `/admin/ai/providers`.
 *
 * Provider state is env-driven (credentials present or not); routing is
 * the static profile table. Neither is a database read. Live Redis
 * capacity is deliberately separate — see `AdminAiCapacitySection`.
 */
export async function AdminAiProviders() {
  const data = await getAdminAiProviders();

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <AdminProvidersSection data={data} />
      <AdminRoutingProfilesSection data={data} />
    </div>
  );
}

export function AdminProvidersSection({
  data,
}: {
  data: AdminAiProvidersPayload;
}) {
  const configuredCount = data.providers.filter((p) => p.configured).length;

  return (
    <DashboardSection
      description={`${configuredCount} of ${data.providers.length} providers have credentials configured. Unconfigured providers are skipped by the router.`}
      title="Providers"
    >
      <ul>
        {data.providers.map((provider) => (
          <li
            className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0"
            key={provider.id}
          >
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              {provider.label}
            </span>
            {provider.configured ? (
              <Badge variant="secondary">Configured</Badge>
            ) : (
              <Badge variant="ghost">Missing keys</Badge>
            )}
          </li>
        ))}
      </ul>
    </DashboardSection>
  );
}

export function AdminRoutingProfilesSection({
  data,
}: {
  data: AdminAiProvidersPayload;
}) {
  return (
    <DashboardSection
      description="Static fallback order per workload — first model is preferred. Capacities shift at runtime; the order does not."
      title="Routing profiles"
    >
      <DashboardDetailFeed>
        {data.profiles.map((profile) => (
          <DashboardDetailFeedItem
            key={profile.name}
            meta={
              <>
                <span>min quality {profile.minQuality}</span>
                {profile.needsTools ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>tools required</span>
                  </>
                ) : null}
                {profile.excludedProviders.length > 0 ? (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      excludes {profile.excludedProviders.join(", ")}
                    </span>
                  </>
                ) : null}
              </>
            }
            title={<span className="font-mono text-xs">{profile.name}</span>}
            titleLines={1}
          >
            <p className="font-mono text-xs leading-6 text-muted-foreground break-words">
              {profile.order.join(" → ")}
            </p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {profile.reasoning}
            </p>
          </DashboardDetailFeedItem>
        ))}
      </DashboardDetailFeed>
    </DashboardSection>
  );
}

/**
 * Live per-model capacity for `/admin/ai/providers`.
 *
 * Mounted only when the admin opts in (`?capacity=1`): the snapshot fans
 * out many Redis GETs, so it sits behind its own Suspense boundary and is
 * never part of the initial page payload and never cached.
 */
export async function AdminAiCapacitySection() {
  const entries = await getAdminAiCapacity();

  return (
    <DashboardSection
      action={
        <Button asChild size="sm" variant="ghost">
          <Link href="?" prefetch={false}>
            Hide live capacity
          </Link>
        </Button>
      }
      description="Live Redis counters with catalog limits at page-load time, most-loaded first. Refresh to re-read."
      title="Live capacity"
    >
      <AdminAiCapacityTable entries={entries} />
    </DashboardSection>
  );
}

function formatUsageLimit(used: number, limit: number): string {
  if (limit <= 0) return formatCompactCount(used);
  return `${formatCompactCount(used)}/${formatCompactCount(limit)}`;
}

export function AdminAiProvidersFallback() {
  return (
    <div className="section-panel space-y-4">
      <Skeleton className="h-5 w-40 rounded-md" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="h-9 w-full rounded-lg" key={index} />
        ))}
      </div>
    </div>
  );
}

export function AdminAiCapacityFallback() {
  return (
    <div className="section-panel space-y-4">
      <Skeleton className="h-5 w-40 rounded-md" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton className="h-9 w-full rounded-lg" key={index} />
        ))}
      </div>
    </div>
  );
}

export function AdminAiCapacityTable({
  entries,
}: {
  entries: AdminAiCapacityEntry[];
}) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No models in the catalog.
      </p>
    );
  }

  return (
    <DashboardTableContainer>
      <Table className="min-w-[52rem]">
        <TableHeader>
          <TableRow>
            <TableHead>Model</TableHead>
            <TableHead className="w-[7rem] text-right">Load</TableHead>
            <TableHead className="w-[9rem] text-right">Req/min</TableHead>
            <TableHead className="w-[9rem] text-right">Tok/min</TableHead>
            <TableHead className="w-[8rem]">Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => (
            <TableRow key={entry.modelId}>
              <TableCell className="max-w-full">
                <span className="block truncate font-mono text-xs text-foreground">
                  {entry.modelId}
                </span>
                {entry.neuronPool ? (
                  <span className="block truncate font-mono text-xs text-muted-foreground">
                    neurons {formatUsageLimit(entry.neuronUsageMilli ?? 0, entry.neuronPool * 1000)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="w-[7rem] text-right text-sm font-medium tabular-nums text-foreground">
                {formatLoadPercent(entry.loadRatio)}
              </TableCell>
              <TableCell className="w-[9rem] text-right text-sm tabular-nums text-muted-foreground">
                {formatUsageLimit(entry.minuteUsage, entry.rpm)}
                <span className="block text-xs">
                  day {formatUsageLimit(entry.dayUsage, entry.rpd)}
                </span>
              </TableCell>
              <TableCell className="w-[9rem] text-right text-sm tabular-nums text-muted-foreground">
                {formatUsageLimit(entry.tokenUsage, entry.tpm)}
                {entry.tpd > 0 ? (
                  <span className="block text-xs">
                    day {formatUsageLimit(entry.dailyTokenUsage, entry.tpd)}
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="w-[8rem]">
                {entry.available ? (
                  <Badge variant="secondary">Available</Badge>
                ) : (
                  <Badge variant="destructive">Stressed</Badge>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </DashboardTableContainer>
  );
}
