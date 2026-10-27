import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { DashboardSection } from "@/components/shared/dashboard-layout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ADMIN_AI_ERRORS_PATH,
  ADMIN_EMAILS_PATH,
  ADMIN_SYSTEM_PATH,
} from "@/features/admin/navigation";
import { getAdminHealthSummary } from "@/features/admin/queries";
import { formatAdminCount } from "@/features/admin/components/overview/admin-overview-stats";
import type { AdminOverviewMetrics } from "@/features/admin/types";

type AttentionItem = {
  id: string;
  label: string;
  detail: string;
  badge: string;
  badgeVariant: "destructive" | "secondary";
  href: string;
  linkLabel: string;
};

/**
 * "Needs attention" queue for the admin Overview.
 *
 * Derived entirely from the payloads the page already loads (health
 * summary, 24h email failures, 24h AI errors) — no new queries. Renders
 * an all-clear state when every signal is zero so the card never sits
 * empty.
 */
export async function AdminNeedsAttention({
  metrics,
}: {
  metrics: AdminOverviewMetrics;
}) {
  const summary = await getAdminHealthSummary();

  const items: AttentionItem[] = [];

  if (summary.critical > 0) {
    items.push({
      id: "health-critical",
      label: "Critical system checks",
      detail: `${formatAdminCount(summary.critical)} failing checks need a fix now.`,
      badge: formatAdminCount(summary.critical),
      badgeVariant: "destructive",
      href: ADMIN_SYSTEM_PATH,
      linkLabel: "Review",
    });
  }

  if (summary.warnings > 0) {
    items.push({
      id: "health-warnings",
      label: "System warnings",
      detail: `${formatAdminCount(summary.warnings)} checks degraded or skipped.`,
      badge: formatAdminCount(summary.warnings),
      badgeVariant: "secondary",
      href: ADMIN_SYSTEM_PATH,
      linkLabel: "Review",
    });
  }

  const failedEmails = metrics.email.last24h.byStatus.failed;

  if (failedEmails > 0) {
    items.push({
      id: "email-failures",
      label: "Failed emails (24h)",
      detail: `${formatAdminCount(failedEmails)} transactional sends failed.`,
      badge: formatAdminCount(failedEmails),
      badgeVariant: "destructive",
      href: ADMIN_EMAILS_PATH,
      linkLabel: "Review",
    });
  }

  if (metrics.ai.errors > 0) {
    items.push({
      id: "ai-errors",
      label: "AI errors (24h)",
      detail: `${formatAdminCount(metrics.ai.errors)} failed calls in the last day.`,
      badge: formatAdminCount(metrics.ai.errors),
      badgeVariant: "destructive",
      href: ADMIN_AI_ERRORS_PATH,
      linkLabel: "Review",
    });
  }

  return (
    <DashboardSection
      description="Failures and warnings worth a look right now."
      title="Needs attention"
    >
      {items.length === 0 ? (
        <div className="flex items-center gap-3 py-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary-ink">
            <CheckCircle2 aria-hidden="true" className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">All clear</p>
            <p className="text-xs leading-5 text-muted-foreground">
              No failures or warnings in the current windows.
            </p>
          </div>
        </div>
      ) : (
        <ul>
          {items.map((item) => (
            <li
              aria-label={`${item.label}: ${item.detail}`}
              className="flex items-center justify-between gap-3 border-b border-border/60 py-2 last:border-0"
              key={item.id}
            >
              <div className="flex min-w-0 items-center gap-2.5">
                <Badge variant={item.badgeVariant}>{item.badge}</Badge>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {item.label}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              </div>
              <Button asChild size="sm" variant="ghost" className="shrink-0">
                <Link href={item.href} prefetch={true}>
                  {item.linkLabel}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}
