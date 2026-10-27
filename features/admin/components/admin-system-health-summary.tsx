import Link from "next/link";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ADMIN_SYSTEM_PATH } from "@/features/admin/navigation";
import { getAdminHealthSummary } from "@/features/admin/queries";
import type { AdminHealthCheckCategory } from "@/lib/admin/health-checks";
import { cn } from "@/lib/utils";

const categoryLabels: Record<AdminHealthCheckCategory, string> = {
  core: "Core",
  email: "Email",
  ai: "AI",
  jobs: "Jobs",
  cache: "Cache",
  billing: "Billing",
  push: "Push",
};

type OverallStatus = "healthy" | "attention" | "critical";

function getOverallStatus(summary: {
  critical: number;
  warnings: number;
}): OverallStatus {
  if (summary.critical > 0) return "critical";
  if (summary.warnings > 0) return "attention";
  return "healthy";
}

const statusConfig: Record<
  OverallStatus,
  {
    label: string;
    badgeVariant: "default" | "secondary" | "destructive";
    icon: typeof CheckCircle2;
    iconTileClass: string;
  }
> = {
  healthy: {
    label: "All systems operational",
    badgeVariant: "default",
    icon: CheckCircle2,
    iconTileClass: "bg-primary/10 text-primary-ink",
  },
  attention: {
    label: "Needs attention",
    badgeVariant: "secondary",
    icon: AlertTriangle,
    iconTileClass: "bg-muted text-muted-foreground",
  },
  critical: {
    label: "Critical issues detected",
    badgeVariant: "destructive",
    icon: XCircle,
    iconTileClass: "bg-destructive/10 text-destructive-ink",
  },
};

function categoryBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" | "ghost" {
  if (status === "fail") return "destructive";
  if (status === "pass") return "default";
  if (status === "warn" || status === "mixed") return "secondary";
  return "ghost";
}

/**
 * System health strip for the admin Overview.
 *
 * Compact `Card` row: status icon, headline, category badges, and a link to
 * the full system page. Status reads through `Badge` variants and semantic
 * tokens only — no raw palette utilities.
 */
export async function AdminSystemHealthBanner() {
  const summary = await getAdminHealthSummary();
  const overall = getOverallStatus(summary);
  const config = statusConfig[overall];
  const StatusIcon = config.icon;

  return (
    <Card>
      <CardContent className="pt-4 sm:pt-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3.5">
            <span
              className={cn(
                "flex size-11 shrink-0 items-center justify-center rounded-xl",
                config.iconTileClass,
              )}
            >
              <StatusIcon aria-hidden="true" className="size-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-heading text-base font-semibold tracking-tight text-foreground">
                  {config.label}
                </h2>
                <Badge variant={config.badgeVariant}>
                  {summary.critical} critical · {summary.warnings} warnings ·{" "}
                  {summary.healthy} healthy
                </Badge>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {(
                  Object.entries(summary.byCategory) as [
                    AdminHealthCheckCategory,
                    string,
                  ][]
                ).map(([category, status]) => (
                  <Badge
                    key={category}
                    variant={categoryBadgeVariant(status)}
                  >
                    {categoryLabels[category]}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          <Button
            asChild
            size="sm"
            variant="outline"
            className="shrink-0 self-start lg:self-center"
          >
            <Link href={ADMIN_SYSTEM_PATH} prefetch={true}>
              <Activity data-icon="inline-start" />
              System details
              <ArrowRight data-icon="inline-end" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
