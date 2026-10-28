import type { AdminHealthReport } from "@/lib/admin/health-checks";
import { cn } from "@/lib/utils";

import { Card, CardContent } from "@/components/ui/card";
import {
  checkStatusDotClass,
  getSystemOverallStatus,
  systemCategoryLabels,
  systemCategoryOrder,
  systemOverallStatusConfig,
} from "@/features/admin/components/system/system-status-shared";
import type { AdminHealthCheckCategory } from "@/lib/admin/health-checks";

type AdminSystemStatusBannerProps = {
  report: AdminHealthReport;
};

export function AdminSystemStatusBanner({ report }: AdminSystemStatusBannerProps) {
  const overall = getSystemOverallStatus(report);
  const config = systemOverallStatusConfig[overall];
  const StatusIcon = config.icon;

  const categoryStatuses = Object.fromEntries(
    systemCategoryOrder.map((category) => {
      const items = report.results.filter((r) => r.category === category);
      const worst = items.some((i) => i.status === "fail")
        ? "fail"
        : items.some((i) => i.status === "warn")
          ? "warn"
          : items.every((i) => i.status === "pass")
            ? "pass"
            : items.length === 0
              ? "skip"
              : "mixed";
      return [category, worst];
    }),
  ) as Record<AdminHealthCheckCategory, string>;

  return (
    <Card className={cn("gap-0 border-l-4", config.borderClass)}>
      <CardContent className="flex flex-col gap-5 pt-4 sm:pt-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 gap-4">
          <div
            className={cn(
              "flex size-11 shrink-0 items-center justify-center rounded-xl border border-border/70 bg-accent/50",
              config.iconClass,
            )}
          >
            <StatusIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <p className="meta-label">Latest check</p>
            <h2 className="mt-1 font-heading text-lg font-semibold tracking-tight text-foreground">
              {config.label}
            </h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {config.description}
            </p>
            <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <MetaItem label="Environment" value={report.environment} />
              <MetaItem
                label="Duration"
                value={`${report.totalDuration}ms`}
              />
              <MetaItem label="Critical" value={String(report.critical)} />
              <MetaItem label="Warnings" value={String(report.warnings)} />
              <MetaItem label="Healthy" value={String(report.healthy)} />
            </dl>
          </div>
        </div>

        <span
          className={cn(
            "inline-flex w-fit shrink-0 items-center rounded-full border px-3 py-1 text-xs font-medium",
            config.badgeClass,
          )}
        >
          {report.results.length} checks run
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {systemCategoryOrder.map((category) => {
          const status = categoryStatuses[category];

          return (
            <div
              className="flex items-center gap-2.5 rounded-lg border border-border/70 bg-muted/60 px-3 py-2.5"
              key={category}
            >
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  checkStatusDotClass(status),
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-foreground">
                  {systemCategoryLabels[category]}
                </p>
                <p className="truncate text-xs uppercase tracking-[0.12em] text-muted-foreground">
                  {status}
                </p>
              </div>
            </div>
          );
        })}
      </div>
      </CardContent>
    </Card>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-semibold tabular-nums text-foreground">{value}</dd>
    </div>
  );
}
