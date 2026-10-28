import type { LucideIcon } from "lucide-react";
import { Clock } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type {
  AdminHealthCheckCategory,
  AdminHealthCheckResult,
} from "@/lib/admin/health-checks";
import { cn } from "@/lib/utils";

import { AdminHealthStatusBadge } from "@/features/admin/components/primitives/admin-status-badges";
import {
  checkStatusBorderClass,
  systemCategoryIcons,
} from "@/features/admin/components/system/system-status-shared";

type AdminHealthCheckCardProps = {
  check: AdminHealthCheckResult;
  category: AdminHealthCheckCategory;
};

export function AdminHealthCheckCard({
  check,
  category,
}: AdminHealthCheckCardProps) {
  const Icon: LucideIcon = systemCategoryIcons[category];

  return (
    <Card
      size="sm"
      className={cn("gap-3 border-l-4", checkStatusBorderClass(check.status))}
    >
      <CardContent className="flex flex-col gap-3 pt-3.5 sm:pt-4">
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/70",
            "bg-muted text-foreground",
          )}
        >
          <Icon className="size-4" />
        </div>
        <AdminHealthStatusBadge status={check.status} />
      </div>

      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-foreground">{check.name}</h3>
        {check.message ? (
          <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
            {check.message}
          </p>
        ) : null}
      </div>

      <div className="mt-auto flex flex-col gap-2 border-t border-border/60 pt-3">
        {check.duration != null ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="size-3.5 shrink-0" />
            <span>
              Response time{" "}
              <span className="font-medium tabular-nums text-foreground">
                {check.duration}ms
              </span>
            </span>
          </p>
        ) : null}
        {check.hint && check.status !== "pass" ? (
          <p className="text-xs leading-5 text-muted-foreground">{check.hint}</p>
        ) : null}
      </div>
      </CardContent>
    </Card>
  );
}
