import type { AdminHealthCheckResult } from "@/lib/admin/health-checks";
import { cn } from "@/lib/utils";

import { AdminHealthCheckCard } from "@/features/admin/components/system/admin-health-check-card";
import {
  aggregateStatusLabel,
  categoryAggregateStatus,
  checkStatusDotClass,
  systemCategoryIcons,
  systemCategoryOrder,
  systemCategoryTitles,
} from "@/features/admin/components/system/system-status-shared";

type AdminHealthCheckGridProps = {
  results: AdminHealthCheckResult[];
};

export function AdminHealthCheckGrid({ results }: AdminHealthCheckGridProps) {
  const grouped = systemCategoryOrder
    .map((category) => ({
      category,
      items: results.filter((result) => result.category === category),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="flex flex-col gap-8">
      {grouped.map((group) => {
        const CategoryIcon = systemCategoryIcons[group.category];
        const aggregate = categoryAggregateStatus(
          group.items.map((item) => item.status),
        );

        return (
          <section className="flex flex-col gap-4" key={group.category}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex size-8 items-center justify-center rounded-xl border border-border/70 bg-accent/50 text-accent-foreground">
                  <CategoryIcon className="size-4" />
                </div>
                <div>
                  <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                    {systemCategoryTitles[group.category]}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {group.items.length}{" "}
                    {group.items.length === 1 ? "check" : "checks"}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-full border border-border/70 bg-muted/60 px-3 py-1.5">
                <span
                  aria-hidden
                  className={cn(
                    "size-2 rounded-full",
                    checkStatusDotClass(aggregate),
                  )}
                />
                <span className="text-xs font-medium text-foreground">
                  {aggregateStatusLabel(aggregate)}
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.items.map((check) => (
                <AdminHealthCheckCard
                  category={group.category}
                  check={check}
                  key={check.name}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
